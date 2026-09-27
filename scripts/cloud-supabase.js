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
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'ironlog.auth' }
  });
  const site = () => location.origin + location.pathname;

  /* Plain words for the errors people actually hit. */
  function friendly(e) {
    const msg = String((e && (e.message || e.error_description)) || e || '');
    const code = String((e && (e.code || e.error_code)) || '');
    const status = +(e && e.status) || 0;
    let text = msg || 'Something went wrong. Try again.';
    if (/invalid login credentials|invalid_credentials/i.test(msg + code)) text = 'Wrong email or password.';
    else if (/email not confirmed|email_not_confirmed/i.test(msg + code)) text = 'Confirm your email first: open the link we sent, then sign in here.';
    else if (/already registered|user_already_exists/i.test(msg + code)) text = 'An account with this email already exists. Sign in instead.';
    else if (/rate limit|over_email_send_rate_limit|too many/i.test(msg + code) || status === 429) text = 'Too many emails in the last hour. Try again later.';
    else if (/weak_password|password should/i.test(msg + code)) text = msg || 'Choose a longer password.';
    else if (/same_password|should be different/i.test(msg + code)) text = 'Choose a password different from the old one.';
    else if (/failed to fetch|network|load failed|fetch/i.test(msg) || e instanceof TypeError) text = 'No connection. Try again when you have signal.';
    const out = new Error(text);
    // 401/403 from the database means the sign-in is no longer valid: sync
    // switches itself off (cloudFail treats 'revoked' that way).
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
    /* cb(event, user): SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY, TOKEN_REFRESHED, USER_UPDATED. */
    onChange(cb) { sb.auth.onAuthStateChange((ev, s) => { try { cb(ev, who(s)); } catch (e) { /* the app logs its own errors */ } }); }
  };

  const last = p => p.slice(p.lastIndexOf('/') + 1);
  const likeEsc = s => s.replace(/[\\%_]/g, m => '\\' + m);
  async function uid() { const s = await session(); if (!s) throw Object.assign(new Error('Signed out'), { code: 'revoked' }); return s.user.id; }
  const db = {
    doc(path) {
      return {
        async get() {
          const { data, error } = await sb.from('docs').select('data').eq('path', path).maybeSingle();
          if (error) throw friendly(error);
          return { id: last(path), exists: !!data, data: () => (data ? data.data : undefined) };
        },
        async set(obj) {
          const user_id = await uid();
          const { error } = await sb.from('docs').upsert({ user_id, path, data: obj, updated_at: new Date().toISOString() }, { onConflict: 'user_id,path' });
          if (error) throw friendly(error);
        }
      };
    },
    collection(path) {
      return {
        async get() {
          const { data, error } = await sb.from('docs').select('path,data').like('path', likeEsc(path) + '/%');
          if (error) throw friendly(error);
          // Direct children only, like a document store's collection listing.
          const docs = (data || []).filter(r => r.path.indexOf('/', path.length + 1) < 0)
            .map(r => ({ id: last(r.path), exists: true, data: () => r.data }));
          return { docs };
        }
      };
    }
  };
  window.ironlogCloud = async () => {
    if (hold) return null;
    const s = await session().catch(() => null);
    return s ? { db, userId: s.user.id } : null;
  };
})();
