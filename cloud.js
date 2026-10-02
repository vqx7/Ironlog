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

  /* Implicit flow: the tokens travel in the link itself. The PKCE flow would
     need a secret kept by the browser that asked for the email, and the link
     usually opens in a different one. */
  const sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: PREVIEW ? 'ironlog-preview.auth' : 'ironlog.auth' }
  });
  const site = () => location.origin + location.pathname;

  /* Plain words for the errors people actually hit. */
  function friendly(e) {
    const msg = String((e && (e.message || e.error_description)) || e || '');
    const code = String((e && (e.code || e.error_code)) || '');
    const status = +(e && e.status) || 0;
    let text = msg || 'Something went wrong. Try again.';
    // A setup step still to do, shown in Your data like a table without
    // permissions ('denied'), while sync keeps retrying.
    if (PREVIEW && /docs_preview/.test(msg) && /PGRST205|42P01|does not exist|schema cache/i.test(msg + code)) return Object.assign(new Error('Preview sync is not set up yet (SUPABASE.md, Part 5). The preview keeps its log on this phone meanwhile.'), { code: 'denied' });
    if (/invalid login credentials|invalid_credentials/i.test(msg + code)) text = 'Wrong email or password.';
    else if (/email not confirmed|email_not_confirmed/i.test(msg + code)) text = 'Confirm your email first: open the link we sent, then sign in here.';
    else if (/already registered|user_already_exists/i.test(msg + code)) text = 'An account with this email already exists. Sign in instead.';
    else if (/rate limit|over_email_send_rate_limit|too many/i.test(msg + code) || status === 429) text = 'Too many emails in the last hour. Try again later.';
    else if (/weak_password|password should/i.test(msg + code)) text = msg || 'Choose a longer password.';
    else if (/same_password|should be different/i.test(msg + code)) text = 'Choose a password different from the old one.';
    else if (/send a request to the edge function/i.test(msg)) text = 'Could not reach the delete function. Check it is deployed with Verify JWT off (SUPABASE.md), and that you have signal.';
    else if (/failed to fetch|network|load failed|fetch/i.test(msg) || e instanceof TypeError) text = 'No connection. Try again when you have signal.';
    const out = new Error(text);
    // 401/403 from the database means the sign-in is no longer valid: sync
    // switches itself off (cloudFail treats 'revoked' that way).
    // A table without permissions for signed-in users is a setup problem, not
    // a sign-out: say so and keep retrying. 401/403 otherwise, or an expired
    // or rejected token, means this sign-in is no longer valid and sync
    // switches itself off (cloudFail treats 'revoked' that way).
    if (code === '42501' || /permission denied/i.test(msg)) { out.message = 'The cloud database refused access. Its table permissions need fixing (SUPABASE.md, step 6).'; out.code = 'denied'; return out; }
    out.code = status === 401 || status === 403 || /jwt|PGRST30[0-3]/i.test(code + msg) ? 'revoked' : (code || 'error');
    return out;
  }
  const who = s => (s && s.user ? { id: s.user.id, email: s.user.email || '' } : null);
  async function session() {
    const { data, error } = await sb.auth.getSession();
    if (error) throw friendly(error);
    return data ? data.session : null;
  }

  window.ironlogAuth = {
    landing,
    async user() { try { return who(await session()); } catch (e) { return null; } },
    /* Returns {confirm: true} when an email must be confirmed first. */
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: site() } });
      if (error) throw friendly(error);
      // An address that is already registered gets a stand-in user with no
      // identities (so the reply does not reveal who has an account).
      if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw friendly({ message: 'User already registered' });
      return { confirm: !(data && data.session), user: who(data && data.session) };
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw friendly(error);
      hold = false;
      return who(data && data.session);
    },
    async signOut() {
      // Local scope: this device only; other devices stay signed in.
      const { error } = await sb.auth.signOut({ scope: 'local' });
      hold = false;
      if (error && !/session/i.test(error.message || '')) throw friendly(error);
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: site() });
      if (error) throw friendly(error);
    },
    async updatePassword(password) {
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
        if (status === 404) throw Object.assign(new Error('Account deletion is not set up yet (SUPABASE.md, Delete my account).'), { code: 'not_deployed' });
        if (status === 401) throw Object.assign(new Error('Your sign-in has expired. Sign out, sign in again, then delete.'), { code: 'revoked' });
        throw friendly(error);
      }
      if (!data || !data.deleted) throw Object.assign(new Error('The account was not deleted. Try again.'), { code: 'error' });
      try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* the account is already gone */ }
      hold = false;
    },
    /* The person said this browser is where they use Ironlog (the question
       after a confirmation link, or the link opened where the app waits for
       it): let it sync. */
    release() { hold = false; },
    /* cb(event, user): SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY, TOKEN_REFRESHED, USER_UPDATED. */
    onChange(cb) { sb.auth.onAuthStateChange((ev, s) => { try { cb(ev, who(s)); } catch (e) { /* the app logs its own errors */ } }); }
  };
  // The app shows Delete my account only when this function exists.
  if (PREVIEW) delete window.ironlogAuth.deleteAccount;

  const last = p => p.slice(p.lastIndexOf('/') + 1);
  const likeEsc = s => s.replace(/[\\%_]/g, m => '\\' + m);
  /* The server can reject a token the phone still thinks is valid (its clock
     runs ahead, or the token was revoked). Refresh once and try again before
     calling the sign-in lost. */
  async function authed(run) {
    let r = await run();
    const e = r && r.error;
    if (e && (+e.status === 401 || /PGRST30[0-3]|jwt/i.test(String(e.code || '') + String(e.message || ''))) && !/42501|permission denied/i.test(String(e.code || '') + String(e.message || ''))) {
      const { error } = await sb.auth.refreshSession();
      if (!error) r = await run();
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
      const s = await session().catch(() => null);
      if (!s) throw Object.assign(new Error('Sign in to send a report.'), { code: 'signin' });
      const row = { category: fb.category, message: fb.message, reply_to: fb.reply_to || null, screenshot: fb.screenshot || null, context: fb.context || {} };
      const { error } = await sb.from('feedback').insert(row);
      if (error) {
        const t = String(error.code || '') + ' ' + String(error.message || '');
        if (/relation .*feedback.* does not exist|PGRST205|42P01/i.test(t)) throw Object.assign(new Error('Reports are not set up yet (SUPABASE.md, Part 4). Your text is kept.'), { code: 'not_set_up' });
        if (/feedback_rate_limited/i.test(t)) throw Object.assign(new Error('You have sent 5 reports today. Try again tomorrow.'), { code: 'limit' });
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
  window.ironlogCloud = async () => {
    if (hold) return null;
    const s = await session().catch(() => null);
    return s ? { db, userId: s.user.id } : null;
  };
})();
