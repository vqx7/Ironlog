/* Ironlog accounts and cloud sync for the standalone app, on Supabase.

   scripts/build.js copies this file into dist/ as cloud.js, next to the
   supabase-js browser bundle, and sets window.IRONLOG_SUPABASE ({url, key})
   from supabase.config.json. index.html itself knows nothing about Supabase:
   it only looks for two globals this file defines.

   window.ironlogAuth   sign up, sign in, sign out, password reset, and what an
                        emailed link just did (landing)
   window.ironlogCloud  the database handle cloud sync uses: {db, userId},
                        where db offers doc(path).get()/.set(obj) and
                        collection(path).get(), the same calls as Claude's db.

   Data lives in one table, public.docs (user_id, path, data), with row level
   security so a signed-in person reads and writes only their own rows. The
   key here is the project's publishable key: it identifies the project and
   grants nothing by itself; the table rule decides every read and write. */
(function () {
  const CFG = window.IRONLOG_SUPABASE;
  if (!CFG || !CFG.url || !CFG.key || !window.supabase || typeof window.supabase.createClient !== 'function') return;
  /* The preview build (r24) shares the live app's site, accounts and project,
     so the same email and password work in both. It keeps its own sign-in
     slot in storage (signing out of one leaves the other signed in), syncs
     to its own table (public.docs_preview, SUPABASE.md Part 5), so nothing
     tried in the preview reaches the real log, and offers no Delete my
     account, which would delete the real account. */
  const PREVIEW = window.IRONLOG_ENV === 'preview';
  const DOCS = PREVIEW ? 'docs_preview' : 'docs';

  /* Links in emails (confirm, reset) come back with the result in the address
     fragment. Read it before the client consumes and clears it. */
  const landing = (() => {
    try {
      const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      const type = h.get('type'), err = h.get('error_description') || h.get('error');
      if (!type && !err) return null;
      return { type: type || null, error: err ? String(err).replace(/\+/g, ' ') : null };
    } catch (e) { return null; }
  })();
  const standalone = () => { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  /* On an iPhone an emailed link opens in Safari, which keeps its own storage,
     apart from the home-screen app. A link that signs Safari in must not start
     syncing whatever Safari happens to hold (old test data, demo data) into the
     account. The app reads landing, finishes the step, signs this browser out,
     and only then is sync allowed here. */
  let hold = !!(landing && landing.type && !standalone());

  /* The time limit every request to the account server has, in milliseconds
     (NET_MS in src/app/config.ts, written in by the build; inside quotes, so
     this file parses as it stands, and under a name of its own, since a name
     config defines is never bound again, tests/hygiene.js), and what a
     request given up for want of an answer fails with: code 'timeout', which
     the app words as it words every request with no answer (NO_ANSWER in
     src/app/report.ts). It is named AbortError, as the browser names an
     aborted request, so the database client does not send it again; the
     libraries keep only its message, which marks it. */
  const LIMIT_MS = Number('{{NET_MS}}');
  const LATE = `No answer in ${LIMIT_MS / 1000} s`;
  const late = () => Object.assign(new Error(LATE), { name: 'AbortError', code: 'timeout', unanswered: true });
  const isLate = e => !!e && [e.message, e.context && e.context.message].some(m => typeof m === 'string' && m.indexOf(LATE) >= 0);
  /* Every request the account library makes has that limit (r64, the r63
     audit's F3). supabase-js sets none, and its token refresh, which every
     later call waits behind, waited for ever on a server that did not
     answer: the account stalled until the app was relaunched. A timer and an
     AbortController, not AbortSignal.timeout or AbortSignal.any, which older
     iPhones lack; a signal the library passes still aborts the request. */
  function limitedFetch(input, init) {
    const ctl = new AbortController();
    const own = init && init.signal;
    const stop = () => ctl.abort();
    if (own) { if (own.aborted) ctl.abort(); else own.addEventListener('abort', stop); }
    let timedOut = false;
    const t = setTimeout(() => { timedOut = true; ctl.abort(); }, LIMIT_MS);
    return fetch(input, Object.assign({}, init, { signal: ctl.signal }))
      .catch(e => { throw timedOut ? late() : e; })
      .finally(() => { clearTimeout(t); if (own) own.removeEventListener('abort', stop); });
  }

  /* Where the library keeps this phone's sign-in. */
  const AUTH_KEY = PREVIEW ? '{{STORAGE_ID}}-preview.auth' : '{{STORAGE_ID}}.auth';
  /* Implicit flow: the tokens travel in the link itself. The PKCE flow would
     need a secret kept by the browser that asked for the email, and the link
     usually opens in a different one. */
  const sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: AUTH_KEY },
    global: { fetch: limitedFetch }
  });
  /* The library's own start refreshes an expired sign-in before it answers
     any call, trying twice when the server does not answer. A call waits for
     it at most the limit; once one has waited that long, the next ones fail
     at once until the start ends, rather than each waiting the limit again
     (r64, F3: a phone not yet set up showed only the logo for over 45 s). */
  let started = false, waitedOut = false;
  sb.auth.initialize().then(() => { started = true; }, () => { started = true; });
  /* A sign-out this phone makes (Sign out, Delete my account, a sign-in the
     server refused during a sync) is marked with whose sign-in it ended and
     when, where every tab of the app reads it. One the library makes itself,
     when the server refuses a sign-in it was refreshing, is not, and that is
     how the app tells the two apart: before r65 the phone read signed out
     with nothing said (the r63 audit's NEW-3). A tab knows the sign-in it
     has, whose it is and since when; a sign-in gone without a mark for it
     made since then was refused. No time limit: a tab that hears of another
     tab's sign-out late (a phone's background tab, resumed) still finds the
     mark. */
  const OUT_KEY = AUTH_KEY + '.out';
  let known = null, gone = null;
  const seeUser = id => { if (!known || known.id !== id) known = { id, since: Date.now() }; };
  { const k = kept(); if (k) seeUser(k.id); }
  sb.auth.onAuthStateChange((ev, s) => {
    if (s && s.user) seeUser(s.user.id);
    else if (ev === 'SIGNED_OUT' && known) { gone = known; known = null; }
  });
  const markOut = () => {
    const k = kept() || known;
    try { localStorage.setItem(OUT_KEY, JSON.stringify({ id: k ? k.id : '', t: Date.now() })); } catch (e) { /* storage blocked: no sign-in is kept here either */ }
  };
  function answered(p) {
    if (!started && waitedOut) return Promise.reject(late());
    let t;
    // Given up on, the call may still fail later; that is no longer anyone's to hear.
    p.catch(() => {});
    return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => { if (!started) waitedOut = true; no(late()); }, LIMIT_MS); })]).finally(() => clearTimeout(t));
  }
  /* A failure where the server could not be asked: no answer in time, no
     connection, or a server error (the library's retryable kind). */
  const noAnswer = e => isLate(e) || (!!e && e.name === 'AuthRetryableFetchError');
  /* The sign-in the library keeps on this phone, read without the server:
     who it is, or null. The library removes it when the server refuses it. */
  function kept() {
    try {
      const s = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
      return s && s.refresh_token && s.user && s.user.id ? { id: s.user.id, email: s.user.email || '' } : null;
    } catch (e) {
      // Storage blocked or the record damaged: no sign-in can be read here.
      return null;
    }
  }
  const site = () => location.origin + location.pathname;

  /* Plain words for the errors people actually hit. */
  function friendly(e) {
    if (isLate(e)) return late();
    const msg = String((e && (e.message || e.error_description)) || e || '');
    const code = String((e && (e.code || e.error_code)) || '');
    const status = +(e && e.status) || 0;
    let text = msg || 'Something went wrong. Try again.';
    // A setup step still to do, shown in Your data like a table without
    // permissions ('denied'), while sync keeps retrying.
    if (PREVIEW && /docs_preview/.test(msg) && /PGRST205|42P01|does not exist|schema cache/i.test(msg + code)) return Object.assign(new Error('Preview sync is not set up yet. The preview keeps its log on this phone meanwhile.'), { code: 'denied' });
    /* The account is gone (r55.1, V 2026-10-19: a phone still signed in to an
       account deleted on another phone kept saying its log would sync): the
       docs table's rows belong to the account (a foreign key, SUPABASE.md),
       so a write after it is deleted fails with Postgres's foreign key
       violation (23503), and the auth service says user_not_found (its
       documented code: the user no longer exists). Told apart from an expired
       sign-in, which is neither. */
    if (code === '23503' || /user_not_found/i.test(code)) return Object.assign(new Error('This account no longer exists. Your log stays on this phone.'), { code: 'gone' });
    if (/invalid login credentials|invalid_credentials/i.test(msg + code)) text = 'Wrong email or password.';
    else if (/email not confirmed|email_not_confirmed/i.test(msg + code)) text = 'Confirm your email first: type the code from the email below, or open its link.';
    else if (/already registered|user_already_exists/i.test(msg + code)) text = 'An account with this email already exists. Sign in instead.';
    // A confirmation code that is wrong, used or expired: Supabase answers all three the same way, so one message (r45 review).
    else if (/otp_expired|token has expired or is invalid/i.test(msg + code)) return Object.assign(new Error('That code is wrong or has expired. Use the newest email, or send a new one.'), { code: 'bad_code' });
    // One email per address a minute: "you can only request this after 42 seconds".
    else if (/request this after (\d+) seconds?/i.test(msg)) return Object.assign(new Error(`Wait ${msg.match(/after (\d+) seconds?/i)[1]} seconds, then try again.`), { code: 'wait' });
    else if (/rate limit|over_email_send_rate_limit|too many/i.test(msg + code) || status === 429) text = 'Too many emails in the last hour. Try again later.';
    else if (/weak_password|password should/i.test(msg + code)) text = msg || 'Choose a longer password.';
    else if (/same_password|should be different/i.test(msg + code)) text = 'Choose a password different from the old one.';
    else if (/send a request to the edge function/i.test(msg)) text = 'Could not delete the account just now. Check you have signal and try again; if it keeps failing, report a problem.';
    else if (/failed to fetch|network|load failed|fetch/i.test(msg) || e instanceof TypeError) text = 'No connection. Try again when you have signal.';
    const out = new Error(text);
    // 401/403 from the database means the sign-in is no longer valid: sync
    // switches itself off (cloudFail treats 'revoked' that way).
    // A table without permissions for signed-in users is a setup problem, not
    // a sign-out: say so and keep retrying. 401/403 otherwise, or an expired
    // or rejected token, means this sign-in is no longer valid and sync
    // switches itself off (cloudFail treats 'revoked' that way).
    if (code === '42501' || /permission denied/i.test(msg)) { out.message = 'Your account could not be reached just now. Your log is safe on this phone; it syncs once this is fixed. Report a problem if it keeps happening.'; out.code = 'denied'; return out; }
    out.code = status === 401 || status === 403 || /jwt|PGRST30[0-3]/i.test(code + msg) ? 'revoked' : (code || 'error');
    return out;
  }
  const who = s => (s && s.user ? { id: s.user.id, email: s.user.email || '' } : null);
  async function session() {
    const { data, error } = await answered(sb.auth.getSession());
    if (error) throw Object.assign(friendly(error), { unanswered: noAnswer(error) });
    return data ? data.session : null;
  }
  /* Who is signed in on this phone (r64, the r63 audit's F3 and F6): the
     library's sign-in, or, when the server cannot be asked (offline, no
     connection, no answer), the sign-in kept here, whose token is refreshed
     once the server answers. Read as signed out, a phone that was signed in
     said "Saved on this phone only. Create an account" and stopped syncing. */
  async function signedIn() {
    if (navigator.onLine === false) return kept();
    try {
      return who(await session());
    } catch (e) {
      return e && e.unanswered ? kept() : null;
    }
  }

  /* Breached passwords (r26). Supabase's own check (leaked password
     protection) is only on its paid plans, so the app asks Have I Been Pwned
     itself when a password is set: the first 5 characters of the password's
     SHA-1 hash go out, the matching hash endings come back, and the match is
     made on the phone (k-anonymity), so neither the password nor its full
     hash leaves the phone. Padding hides how many endings matched. Offline or
     slow (3 s), the check is skipped rather than blocking a sign-up. */
  async function breached(password) {
    try {
      if (!(window.crypto && crypto.subtle && window.fetch)) return 0;
      const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
      const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000);
      const res = await fetch('{{HIBP_ORIGIN}}/range/' + hex.slice(0, 5), { headers: { 'Add-Padding': 'true' }, signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t); if (!res.ok) return 0;
      const tail = hex.slice(5);
      for (const line of (await res.text()).split('\n')) { const [h, n] = line.trim().split(':'); if (h === tail) return +n || 0; }
      return 0;
    } catch (e) { return 0; }
  }
  const BREACHED = 'This password has appeared in a data breach, so it is easy to guess. Choose a different one.';

  window.ironlogAuth = {
    landing,
    user: signedIn,
    /* Returns {confirm: true} when an email must be confirmed first. */
    async signUp(email, password) {
      if (await breached(password) > 0) throw Object.assign(new Error(BREACHED), { code: 'breached' });
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: site() } });
      if (error) throw friendly(error);
      // An address that is already registered gets a stand-in user with no
      // identities (so the reply does not reveal who has an account).
      if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw friendly({ message: 'User already registered' });
      return { confirm: !(data && data.session), user: who(data && data.session) };
    },
    /* The 6-digit code in the confirmation email (r45, item 61): typed in the
       app, so it works where the emailed link opens a browser instead (an
       iPhone's home-screen app). type 'email' is Supabase's current name for
       a sign-up's code ('signup' is deprecated for verifying). */
    async verifyCode(email, code) {
      const token = String(code || '').replace(/\D/g, '');
      if (!token) throw Object.assign(new Error('Type the code from the email.'), { code: 'no_code' });
      const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw friendly(error);
      hold = false;
      return who(data && data.session);
    },
    /* A new confirmation email, with its link pointing back at this build (the preview's own address in the preview). */
    async resendCode(email) {
      const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: site() } });
      if (error) throw friendly(error);
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw friendly(error);
      hold = false;
      return who(data && data.session);
    },
    /* Local scope: this device only; other devices stay signed in. The
       sign-out happens here whatever the server does (r64, the r63 audit's
       F3 and F7): with no signal it said "No connection" though the library
       had signed the phone out, and with a server that did not answer it
       waited in silence. The server is told when it answers; the sign-in
       kept on this phone goes either way. */
    async signOut() {
      hold = false;
      markOut();
      await answered(sb.auth.signOut({ scope: 'local' })).catch(() => {
        // No answer in time: this phone signs out all the same, below.
      });
      if (kept()) localStorage.removeItem(AUTH_KEY);
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: site() });
      if (error) throw friendly(error);
    },
    async updatePassword(password) {
      if (await breached(password) > 0) throw Object.assign(new Error(BREACHED), { code: 'breached' });
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw friendly(error);
    },
    /* Deletes the account and, by the table's cascade, its synced log. The
       work happens in the delete-account function on the server, because
       admin rights can never live in the app. */
    async deleteAccount() {
      const s = await session();
      if (!s) throw Object.assign(new Error('Sign in first.'), { code: 'revoked' });
      const { data, error } = await sb.functions.invoke('delete-account', { method: 'POST' });
      if (error) {
        const status = error.context && error.context.status;
        if (status === 404) throw Object.assign(new Error('Deleting an account is not available yet. Report a problem and the owner will delete it for you.'), { code: 'not_deployed' });
        if (status === 401) throw Object.assign(new Error('Your sign-in has expired. Sign out, sign in again, then delete.'), { code: 'revoked' });
        throw friendly(error);
      }
      if (!data || !data.deleted) throw Object.assign(new Error('The account was not deleted. Try again.'), { code: 'error' });
      markOut();
      try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* the account is already gone */ }
      hold = false;
    },
    /* The person said this browser is where they use Ironlog (the question
       after a confirmation link, or the link opened where the app waits for
       it): let it sync. */
    release() { hold = false; },
    /* Whether the sign-in this tab had is gone with no sign-out of it marked
       since this tab first had it: the server refused it (r65, NEW-3). True
       once, then false until there is a sign-in again. */
    refused() {
      if (kept()) return false;
      const was = known || gone;
      known = null; gone = null;
      if (!was) return false;
      let m = null;
      try { m = JSON.parse(localStorage.getItem(OUT_KEY) || 'null'); } catch (e) { /* no mark to read: none was made */ }
      return !(m && m.id === was.id && +m.t >= was.since);
    },
    /* cb(event, user): INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY, TOKEN_REFRESHED, USER_UPDATED.
       A sign-in the library could not refresh for want of an answer is still
       this phone's (signedIn above): its start reports it with no session. */
    onChange(cb) { sb.auth.onAuthStateChange((ev, s) => { try { cb(ev, ev === 'SIGNED_OUT' ? null : who(s) || kept()); } catch (e) { /* the app logs its own errors */ } }); }
  };
  // The app shows Delete my account only when this function exists.
  if (PREVIEW) delete window.ironlogAuth.deleteAccount;

  const last = p => p.slice(p.lastIndexOf('/') + 1);
  const likeEsc = s => s.replace(/[\\%_]/g, m => '\\' + m);
  /* The server can reject a token the phone still thinks is valid (its clock
     runs ahead, or the token was revoked). Refresh once and try again before
     calling the sign-in lost. */
  async function authed(run) {
    /* Never a request without the sign-in, which the library would send with
       the project's key alone: one whose token cannot be refreshed for want
       of an answer fails as a dropped connection does, and the sync retries
       (r64). */
    await uid();
    let r = await run();
    const e = r && r.error;
    if (e && (+e.status === 401 || /PGRST30[0-3]|jwt/i.test(String(e.code || '') + String(e.message || ''))) && !/42501|permission denied/i.test(String(e.code || '') + String(e.message || ''))) {
      const { error } = await sb.auth.refreshSession();
      if (!error) r = await run();
      // A refresh that got no answer is a dropped connection, retried, not a refused sign-in (r64, the r63 audit's F10: only a refusal says to sign in again).
      else if (noAnswer(error)) throw friendly(error);
    }
    return r;
  }
  async function uid() { const s = await session(); if (!s) throw Object.assign(new Error('Signed out'), { code: 'revoked' }); return s.user.id; }
  const db = {
    doc(path) {
      return {
        async get() {
          const { data, error } = await authed(() => sb.from(DOCS).select('data').eq('path', path).maybeSingle());
          if (error) throw friendly(error);
          return { id: last(path), exists: !!data, data: () => (data ? data.data : undefined) };
        },
        async set(obj) {
          const user_id = await uid();
          const { error } = await authed(() => sb.from(DOCS).upsert({ user_id, path, data: obj, updated_at: new Date().toISOString() }, { onConflict: 'user_id,path' }));
          if (error) throw friendly(error);
        }
      };
    },
    collection(path) {
      return {
        async get() {
          const { data, error } = await authed(() => sb.from(DOCS).select('path,data').like('path', likeEsc(path) + '/%'));
          if (error) throw friendly(error);
          // Direct children only, like a document store's collection listing.
          const docs = (data || []).filter(r => r.path.indexOf('/', path.length + 1) < 0)
            .map(r => ({ id: last(r.path), exists: true, data: () => r.data }));
          return { docs };
        }
      };
    }
  };
  /* Feedback (PENDING 58): anyone can add a report, signed in or out; only
     accounts listed in feedback_readers (the app owner) can read them. The
     table rules in SUPABASE.md, Part 4, enforce both. */
  window.ironlogFeedback = {
    /* Signed in only since r25 (V's choice, to keep spam out): the table
       takes reports from signed-in accounts only, at most 5 a day each
       (SUPABASE.md, Part 4). */
    async send(fb) {
      // A sign-in the server could not be asked about is not a sign-out: the report says so as any request with no answer does (r64).
      const s = await session().catch(e => { if (e && e.unanswered) throw e; return null; });
      if (!s) throw Object.assign(new Error('Sign in to send a report.'), { code: 'signin' });
      const row = { category: fb.category, message: fb.message, reply_to: fb.reply_to || null, screenshot: fb.screenshot || null, context: fb.context || {} };
      /* The report's key (r63, PENDING 306): the table keeps a report sent
         again once (SUPABASE.md, Part 4), so a retry after a lost answer is
         not a second report and a second ticket. A table without the key's
         column yet (its step not run) is sent the report without it. */
      if (fb.client_id) row.client_id = fb.client_id;
      let { error } = await sb.from('feedback').insert(row);
      if (error && row.client_id && /client_id/i.test(String(error.message || '')) && /PGRST204|42703/.test(String(error.code || ''))) {
        delete row.client_id;
        ({ error } = await sb.from('feedback').insert(row));
      }
      if (error) {
        const t = String(error.code || '') + ' ' + String(error.message || '');
        // Two sends of one report at the same moment: the table took the other, so this one is sent.
        if (/23505/.test(String(error.code || '')) && /feedback_client_once/.test(t)) return;
        if (/relation .*feedback.* does not exist|PGRST205|42P01/i.test(t)) throw Object.assign(new Error('Reports are not set up yet. Your text is kept.'), { code: 'not_set_up' });
        // The app says the limit in its own words, with its own number (report.ts); this one is never shown by it.
        if (/feedback_rate_limited/i.test(t)) throw Object.assign(new Error('Too many reports today. Try again tomorrow.'), { code: 'limit' });
        throw friendly(error);
      }
    },
    async isReader() {
      const s = await session().catch(() => null); if (!s) return false;
      const { data, error } = await sb.from('feedback_readers').select('user_id').eq('user_id', s.user.id).maybeSingle();
      return !error && !!data;
    },
    async inbox(limit) {
      const { data, error } = await sb.from('feedback').select('id,created_at,category,message,reply_to,context,screenshot,issue_url').order('created_at', { ascending: false }).limit(limit || 50);
      if (error) throw friendly(error);
      return data || [];
    }
  };
  /* The preview only (r29): read, never write, this account's rows of the live
     app's table, for "Copy my log from Ironlog". On an iPhone the preview and
     the live app keep separate storage on the phone, so the account's cloud
     copy is the one place the preview can find the real log. Row level
     security limits the read to the signed-in account's own rows. */
  if (PREVIEW) window.ironlogLiveDocs = async () => {
    const s = await session().catch(e => { if (e && e.unanswered) throw e; return null; });
    if (!s) throw Object.assign(new Error('Sign in with your {{APP_NAME}} account first.'), { code: 'signin' });
    const base = `data/users/${s.user.id}`;
    const { data, error } = await authed(() => sb.from('docs').select('path,data').like('path', likeEsc(base) + '/%'));
    if (error) throw friendly(error);
    return (data || []).filter(r => r.path.indexOf('/', base.length + 1) < 0).map(r => ({ id: last(r.path), data: r.data }));
  };
  window.ironlogCloud = async () => {
    if (hold) return null;
    const u = await signedIn();
    return u ? { db, userId: u.id } : null;
  };
})();
