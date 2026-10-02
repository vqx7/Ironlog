// A small stand-in for Supabase, for tests only: the parts of Auth (GoTrue)
// and the Data API (PostgREST) that supabase-js calls for Ironlog, with the
// same row rule as the real table (each signed-in user sees only their own
// rows, signed-out requests see nothing). It also serves a folder of static
// files, so the app and its "cloud" share one origin like in production.
//
// start(root) -> {base, users, rows, feedback, confirm(email), addReader(email), expireTokens(), log, close()}
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const b64u = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

function start(root) {
  const users = new Map();      // email -> user
  const tokens = new Map();     // access token -> {uid, exp}
  const refresh = new Map();    // refresh token -> uid
  const rows = new Map();       // `${uid} ${path}` -> {user_id, path, data, updated_at}
  const rowsLive = rows;
  const rowsPreview = new Map(); // the same for public.docs_preview (the preview build, r24)
  let pvOn = true;              // false: docs_preview is not created yet
  const feedback = [];          // rows of public.feedback
  const readers = new Set();    // user ids in public.feedback_readers
  let fbOn = true;              // false: the feedback tables are not created yet
  const log = [];
  let tokenLife = 3600; let deny = false; let fnDeployed = false;
  const now = () => Math.floor(Date.now() / 1000);
  const userJson = u => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    email_confirmed_at: u.confirmed ? u.created : null, confirmed_at: u.confirmed ? u.created : null,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
    identities: [{ id: u.id, identity_id: u.id, user_id: u.id, provider: 'email', identity_data: { sub: u.id, email: u.email } }],
    created_at: u.created, updated_at: u.created });
  function session(u) {
    const exp = now() + tokenLife;
    const at = [b64u({ alg: 'HS256', typ: 'JWT' }), b64u({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp, iat: now(), session_id: crypto.randomUUID() }), b64u(crypto.randomBytes(16))].join('.');
    const rt = crypto.randomBytes(12).toString('hex');
    tokens.set(at, { uid: u.id, exp }); refresh.set(rt, u.id);
    return { access_token: at, token_type: 'bearer', expires_in: tokenLife, expires_at: exp, refresh_token: rt, user: userJson(u) };
  }
  const byId = id => [...users.values()].find(u => u.id === id);
  function caller(req) {
    const h = req.headers.authorization || '';
    const t = h.replace(/^Bearer /, '');
    const k = tokens.get(t);
    if (!k) return null;
    if (k.exp < now()) return { expired: true };
    return byId(k.uid) || null;
  }
  const send = (res, code, body, extra) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...(extra || {}) });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const authErr = (res, code, error_code, msg) => send(res, code, { code, error_code, msg });
  const reEsc = c => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  function likeRe(p) {
    let re = '';
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      if (ch === '\\' && i + 1 < p.length) re += reEsc(p[++i]);
      else if (ch === '%' || ch === '*') re += '.*';
      else if (ch === '_') re += '.';
      else re += reEsc(ch);
    }
    return new RegExp('^' + re + '$');
  }

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const p = u.pathname;
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); res.end(); return; }
      const json = () => { try { return body ? JSON.parse(body) : {}; } catch (e) { return {}; } };
      if (p.startsWith('/auth/v1/') || p.startsWith('/rest/v1/')) log.push(`${req.method} ${p}${u.search}`);
      if (p.startsWith('/auth/v1/') && !req.headers.apikey) return authErr(res, 401, 'no_api_key', 'No API key found in request');
      // ---- Auth ----
      if (p === '/auth/v1/signup' && req.method === 'POST') {
        const { email, password } = json();
        if (!password || password.length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.', weak_password: { reasons: ['length'] } });
        const ex = users.get(email);
        if (ex) { const f = userJson(ex); f.identities = []; f.id = crypto.randomUUID(); return send(res, 200, f); }
        const nu = { id: crypto.randomUUID(), email, password, confirmed: false, created: new Date().toISOString() };
        users.set(email, nu);
        return send(res, 200, userJson(nu));
      }
      if (p === '/auth/v1/token' && req.method === 'POST') {
        const g = u.searchParams.get('grant_type'); const b = json();
        if (g === 'password') {
          const x = users.get(b.email);
          if (!x || x.password !== b.password) return authErr(res, 400, 'invalid_credentials', 'Invalid login credentials');
          if (!x.confirmed) return authErr(res, 400, 'email_not_confirmed', 'Email not confirmed');
          return send(res, 200, session(x));
        }
        if (g === 'refresh_token') {
          const id = refresh.get(b.refresh_token); if (!id) return authErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
          refresh.delete(b.refresh_token); return send(res, 200, session(byId(id)));
        }
        return authErr(res, 400, 'unsupported_grant_type', 'unsupported grant');
      }
      if (p === '/auth/v1/user') {
        const c = caller(req); if (!c || c.expired) return authErr(res, 401, 'bad_jwt', 'invalid JWT');
        if (req.method === 'PUT') { const b = json(); if (b.password) { if (b.password === c.password) return authErr(res, 422, 'same_password', 'New password should be different from the old password.'); c.password = b.password; } }
        return send(res, 200, userJson(c));
      }
      if (p === '/auth/v1/logout') { const t = (req.headers.authorization || '').replace(/^Bearer /, ''); tokens.delete(t); return send(res, 204); }
      if (p === '/auth/v1/recover') return send(res, 200, {});
      // ---- Edge Function: delete-account ----
      if (p === '/functions/v1/delete-account') {
        if (!fnDeployed) return send(res, 404, { code: 'NOT_FOUND', message: 'Requested function was not found' });
        const c = caller(req); if (!c || c.expired) return send(res, 401, { error: 'Not signed in' });
        for (const [k, r] of [...rows]) if (r.user_id === c.id) rows.delete(k);
        users.delete(c.email); for (const [t, v] of [...tokens]) if (v.uid === c.id) tokens.delete(t);
        return send(res, 200, { deleted: true });
      }
      // ---- Data API: feedback (anyone adds; only listed readers read) ----
      if (p === '/rest/v1/feedback' || p === '/rest/v1/feedback_readers') {
        const c = caller(req);
        if (c && c.expired) return send(res, 401, { code: 'PGRST303', message: 'JWT expired' });
        if (!fbOn) return send(res, 404, { code: 'PGRST205', message: `Could not find the table 'public.${p.slice(9)}' in the schema cache` });
        if (p === '/rest/v1/feedback_readers') {
          if (req.method !== 'GET') return send(res, 405, { message: 'method' });
          const mine = c && readers.has(c.id) ? [{ user_id: c.id }] : [];
          if (/vnd\.pgrst\.object/.test(req.headers.accept || '')) return mine.length ? send(res, 200, mine[0]) : send(res, 406, { code: 'PGRST116', message: 'no rows' });
          return send(res, 200, mine);
        }
        if (req.method === 'POST') {
          const b = json(); const arr = Array.isArray(b) ? b : [b];
          for (const r of arr) {
            // Since r25: signed-in accounts only, 10 to 1,000 characters, 5 a day each (SUPABASE.md, Part 4).
            if (!c || (r.user_id && r.user_id !== c.id)) return send(res, 401, { code: '42501', message: 'new row violates row-level security policy for table "feedback"' });
            if (!['bug', 'idea', 'question'].includes(r.category) || !r.message || String(r.message).length < 10 || String(r.message).length > 1000) return send(res, 400, { code: '23514', message: 'new row violates check constraint' });
            if (feedback.filter(f => f.user_id === c.id && Date.now() - Date.parse(f.created_at) < 864e5).length >= 5) return send(res, 400, { code: 'P0001', message: 'feedback_rate_limited' });
            feedback.push({ id: feedback.length + 1, created_at: new Date().toISOString(), user_id: c ? c.id : null, category: r.category, message: r.message, reply_to: r.reply_to || null, screenshot: r.screenshot || null, context: r.context || {}, issue_url: null });
          }
          return send(res, 201);
        }
        if (req.method === 'GET') return send(res, 200, c && readers.has(c.id) ? feedback.slice().reverse() : []);
        return send(res, 405, { message: 'method' });
      }
      // ---- Data API: tables docs and docs_preview ----
      if (p === '/rest/v1/docs' || p === '/rest/v1/docs_preview') {
        const rows = p === '/rest/v1/docs' ? rowsLive : rowsPreview;
        if (rows === rowsPreview && !pvOn) return send(res, 404, { code: 'PGRST205', message: "Could not find the table 'public.docs_preview' in the schema cache" });
        const c = caller(req);
        if (c && c.expired) return send(res, 401, { code: 'PGRST303', message: 'JWT expired' });
        if (!c) return send(res, 401, { code: '42501', message: 'permission denied for table docs' });
        if (deny) return send(res, 401, { code: '42501', message: 'permission denied for table docs' });
        if (req.method === 'GET') {
          let list = [...rows.values()].filter(r => r.user_id === c.id);
          for (const [k, v] of u.searchParams) {
            if (['select', 'limit', 'order', 'offset'].includes(k)) continue;
            const [op, ...rest] = v.split('.'); const val = rest.join('.');
            if (op === 'eq') list = list.filter(r => String(r[k]) === val);
            else if (op === 'like') { const re = likeRe(val); list = list.filter(r => re.test(String(r[k]))); }
            else return send(res, 400, { code: 'PGRST100', message: 'unsupported filter ' + op });
          }
          const cols = (u.searchParams.get('select') || '*').split(',');
          const out = list.map(r => cols[0] === '*' ? r : Object.fromEntries(cols.map(k => [k, r[k]])));
          if (/vnd\.pgrst\.object/.test(req.headers.accept || '')) {
            if (out.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${out.length} rows` });
            return send(res, 200, out[0]);
          }
          return send(res, 200, out);
        }
        if (req.method === 'POST') {
          const b = json(); const arr = Array.isArray(b) ? b : [b];
          for (const r of arr) {
            const user_id = r.user_id || c.id;
            if (user_id !== c.id) return send(res, 403, { code: '42501', message: 'new row violates row-level security policy for table "docs"' });
            rows.set(`${user_id} ${r.path}`, { user_id, path: r.path, data: r.data, updated_at: r.updated_at || new Date().toISOString() });
          }
          return send(res, 201);
        }
        return send(res, 405, { message: 'method' });
      }
      // ---- static files ----
      let fp = decodeURIComponent(p); if (fp.endsWith('/')) fp += 'index.html';
      const f = path.join(root, fp.replace(/^\/ironlog\//, '/'));
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    r({ base, users, rows, rowsPreview, log,
      previewTable(v) { pvOn = !!v; },
      addUser(email, password) { const nu = { id: crypto.randomUUID(), email, password, confirmed: true, created: new Date().toISOString() }; users.set(email, nu); return nu; },
      confirm(email) { const x = users.get(email); if (x) x.confirmed = true; },
      expireTokens() { for (const v of tokens.values()) v.exp = now() - 10; },
      setTokenLife(s) { tokenLife = s; },
      setDeny(v) { deny = !!v; },
      deployDelete(v) { fnDeployed = !!v; },
      feedback, addReader(email) { const x = users.get(email); if (x) readers.add(x.id); }, feedbackTables(v) { fbOn = !!v; },
      close: () => new Promise(q => server.close(q)) });
  }));
}
module.exports = { start };
