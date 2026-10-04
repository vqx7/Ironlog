// Builds the standalone installable app into dist/ from the one source file.
//
// index.html stays the single source and keeps working as the Claude artifact.
// This script copies it and changes only what a self-hosted, offline app
// needs: fonts and libraries served from the same site (a gym basement has
// no signal, and a CDN outage must not break logging), a web app manifest
// and icons so it installs to the home screen, and a service worker that
// keeps every file available offline.
//
// Usage: node scripts/build.js             (writes dist/, prints the file list)
//        node scripts/build.js --preview   (writes dist-preview/, the preview build)
//
// The preview build (r24) is the same app, published to /preview/ under the
// live app on the same site. The site is one origin, so the two share this
// browser's storage and caches; the preview therefore gets its own storage
// keys (IRONLOG_ENV, read by index.html and cloud.js), its own cache names,
// its own name and icons, and a service worker scoped to /preview/ only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');


const ROOT = path.join(__dirname, '..');
const PREVIEW = process.argv.includes('--preview');
const DIST = path.join(ROOT, PREVIEW ? 'dist-preview' : 'dist');
// Cache names: the live worker deletes every old cache starting "ironlog-",
// so the preview's caches must never start with it.
const CACHE_PREFIX = PREVIEW ? 'ilpreview-' : 'ironlog-';
const NM = path.join(ROOT, 'node_modules');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function must(cond, msg) { if (!cond) { console.error('build: ' + msg); process.exit(1); } }
function replaceOnce(text, a, b, what) {
  const n = text.split(a).length - 1;
  must(n === 1, `expected exactly one ${what}, found ${n}`);
  return text.replace(a, b);
}

const version = (src.match(/const APP_VERSION='([^']+)'/) || [])[1];
must(version, 'APP_VERSION not found in index.html');

fs.rmSync(DIST, { recursive: true, force: true });
for (const d of ['vendor', 'fonts', 'icons']) fs.mkdirSync(path.join(DIST, d), { recursive: true });

// Libraries: the exact versions the artifact loads from cdnjs.
fs.copyFileSync(path.join(NM, 'chart.js/dist/chart.umd.js'), path.join(DIST, 'vendor/chart.umd.js'));
fs.copyFileSync(path.join(NM, 'sortablejs/Sortable.min.js'), path.join(DIST, 'vendor/Sortable.min.js'));
// three.js for the 3D body; the app loads it only when 3D is first opened.
fs.copyFileSync(path.join(NM, 'three/build/three.module.min.js'), path.join(DIST, 'vendor/three.module.min.js'));

// Accounts and cloud sync (Supabase), only when supabase.config.json exists.
// It holds the project URL and the publishable key, both public by design:
// the database's row level security decides what each signed-in person can
// read. The secret key never goes anywhere near this repo.
const CFG_FILE = path.join(ROOT, 'supabase.config.json');
const cloudCfg = fs.existsSync(CFG_FILE) ? JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) : null;
if (cloudCfg) {
  must(/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cloudCfg.url || ''), 'supabase.config.json: url must look like https://<project>.supabase.co');
  must(/^sb_publishable_/.test(cloudCfg.key || '') || /^eyJ/.test(cloudCfg.key || ''), 'supabase.config.json: key must be the publishable (or legacy anon) key');
  must(!/secret|service_role/i.test(cloudCfg.key), 'supabase.config.json: never the secret key');
  fs.copyFileSync(path.join(NM, '@supabase/supabase-js/dist/umd/supabase.js'), path.join(DIST, 'vendor/supabase.js'));
  fs.copyFileSync(path.join(ROOT, 'scripts/cloud-supabase.js'), path.join(DIST, 'cloud.js'));
}

// Fonts: the weights the page asks Google Fonts for, latin subset.
const FONTS = [['Big Shoulders Display', 'big-shoulders-display', [600, 700, 800]], ['Hanken Grotesk', 'hanken-grotesk', [400, 500, 600, 700]]];
let css = '/* Self-hosted copies of the Google Fonts the app uses (SIL Open Font License). */\n';
for (const [family, dir, weights] of FONTS) {
  for (const w of weights) {
    const file = `${dir}-latin-${w}-normal.woff2`;
    fs.copyFileSync(path.join(NM, '@fontsource', dir, 'files', file), path.join(DIST, 'fonts', file));
    css += `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:url(${file}) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}\n`;
  }
}
fs.writeFileSync(path.join(DIST, 'fonts/fonts.css'), css);

// Icons, made by scripts/icons.py into assets/.
const ICONS = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-64.png'];
const ICON_DIR = path.join(ROOT, 'assets', PREVIEW ? 'preview' : '');
for (const f of ICONS) fs.copyFileSync(path.join(ICON_DIR, f), path.join(DIST, 'icons', f));
const NAME = PREVIEW ? 'Ironlog Preview' : 'Ironlog';
const SHORT = PREVIEW ? 'Preview' : 'Ironlog';

let html = src;
// Fonts from this site instead of Google.
html = replaceOnce(html, '<link rel="preconnect" href="https://fonts.googleapis.com">\n', '', 'Google Fonts preconnect');
html = replaceOnce(html, '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n', '', 'gstatic preconnect');
html = html.replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">/, () => '<link rel="stylesheet" href="fonts/fonts.css">');
must(!/fonts\.googleapis/.test(html), 'Google Fonts link still present');
// Libraries: the local copy first, the CDNs stay as fallbacks.
html = replaceOnce(html, "loadScript(['https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js',", "loadScript(['vendor/Sortable.min.js','https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js',", 'Sortable loader');
html = replaceOnce(html, "loadScript(['https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',", "loadScript(['vendor/chart.umd.js','https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',", 'Chart.js loader');
html = replaceOnce(html, "const THREE_URLS=['https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.min.js',", "const THREE_URLS=['./vendor/three.module.min.js','https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.min.js',", 'three.js loader');
// Claude features (V, 2026-10-04). Debriefs, Ask Claude, suggested swaps and
// Claude reading typed sets work only when the page runs inside Claude, so the
// installed app never used them, yet every phone downloaded their prompts.
// The source marks each such block /*ai{*/ ... /*}ai*/, or /*}ai=code*/ when
// something must stand in its place, and this build leaves them out. The
// source keeps them for the Claude artifact.
{
  const re = /\/\*ai\{\*\/[\s\S]*?\/\*\}ai(?:=([\s\S]*?))?\*\//g;
  const n = (html.match(re) || []).length;
  must(n >= 13, `expected the marked Claude blocks, found ${n}`);
  html = html.replace(re, (m, sub) => sub || '');
  must(!/\/\*ai\{|\/\*\}ai/.test(html), 'an unmatched Claude block marker');
  for (const w of ['AI_STYLE', 'aiDigest', 'debriefPrompt', 'Ask Claude', 'Debrief with Claude', 'Reading with Claude', 'You are an experienced', 'window.claude.use(\'sample\')'])
    must(!html.includes(w), `Claude feature text still in the build: ${w}`);
}
// Install metadata.
// IRONLOG_APP marks the installable build, so the app can offer to install
// itself. The browser's install offer (Android and desktop Chrome) can fire
// before the app's own script runs, so it is caught here, first thing, and
// kept until the lifter taps Install.
const head = `<script>window.IRONLOG_APP=true;${PREVIEW ? "window.IRONLOG_ENV='preview';" : ''}window.__installEvt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__installEvt=e;if(window.ironlogInstallReady)window.ironlogInstallReady();});
window.addEventListener('appinstalled',()=>{window.__installEvt=null;if(window.ironlogInstallReady)window.ironlogInstallReady();});</script>
<meta name="theme-color" content="#08090b">
<meta name="color-scheme" content="dark light">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${SHORT}">
<meta name="description" content="Log lifting sessions, track progress and plan training. Works offline.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/favicon-64.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
`;
html = replaceOnce(html, '<title>Ironlog</title>\n', `<title>${NAME}</title>\n` + head, 'title');
// The cloud script runs before the app's own script, so cloudProvider() finds
// window.ironlogCloud on its first check.
if (cloudCfg) html = replaceOnce(html, '</head>', `<script>window.IRONLOG_SUPABASE=${JSON.stringify({ url: cloudCfg.url, key: cloudCfg.key })};</script>
<script src="vendor/supabase.js"></script>
<script src="cloud.js"></script>
</head>`, 'closing head tag');
// Offline: register the service worker, and ask the browser to keep this
// site's storage (an installed app's data is then not evicted under
// storage pressure).
//
// Updates: a new version downloads in the background and then waits. The page
// is told (ironlogUpdateReady) and shows "New version ready"; tapping Reload
// calls ironlogApplyUpdate, which lets the waiting worker take over, and the
// page reloads once it has. The check also runs whenever the app comes back
// to the foreground, because an installed iPhone app is often resumed rather
// than relaunched and would otherwise not look for updates for days.
const boot = `<script>
/* Standalone build only. */
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
  const hadController=!!navigator.serviceWorker.controller;let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!reloading){reloading=true;location.reload();}});
  window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').then(reg=>{
    const offer=()=>{if(reg.waiting&&navigator.serviceWorker.controller&&window.ironlogUpdateReady)window.ironlogUpdateReady();};
    window.ironlogApplyUpdate=()=>{if(reg.waiting)reg.waiting.postMessage('skipWaiting');else location.reload();};
    reg.addEventListener('updatefound',()=>{const w=reg.installing;if(w)w.addEventListener('statechange',()=>{if(w.state==='installed')offer();});});
    offer();
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{});});
  }).catch(()=>{});});
}
try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persisted().then(p=>{if(!p)navigator.storage.persist();});}catch(e){}
</script>
`;
html = replaceOnce(html, '</body>', boot + '</body>', 'closing body tag');
/* Content Security Policy (r29, item 128): defense in depth. If a bug ever
   let someone else's text run as script (as the reports inbox could have
   before the r29 audit), the page still could not load script from anywhere
   but this site, or send data anywhere but this site, the Supabase project,
   and Have I Been Pwned's range API. Each inline script is allowed by its
   hash, computed last so it matches what ships. Styles stay 'unsafe-inline':
   the app sets style attributes throughout, and CSS cannot send data out
   without an allowed address. The CDN fallbacks in the loaders are left out
   on purpose: this build ships its own copies. A meta tag cannot set
   frame-ancestors; GitHub Pages sends no such header, which is acceptable for
   an app with no actions a framing page could trick a tap into. */

const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
must(hashes.length >= 3, 'expected the head, app and boot inline scripts');
const sbHost = cloudCfg ? cloudCfg.url.replace(/^https:\/\//, '') : null;
const csp = [
  "default-src 'self'",
  `script-src 'self' ${hashes.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${sbHost ? ` https://${sbHost} wss://${sbHost}` : ''} https://api.pwnedpasswords.com`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');
html = replaceOnce(html, '<meta charset="utf-8">\n', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n`, 'charset meta');
fs.writeFileSync(path.join(DIST, 'index.html'), html);

const manifest = {
  name: NAME, short_name: SHORT, description: 'Log lifting sessions, track progress and plan training. Works offline.',
  id: './', start_url: './', scope: './', display: 'standalone', orientation: 'portrait',
  background_color: '#08090b', theme_color: '#08090b', categories: ['health', 'fitness', 'sports'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
};
fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// Everything the app needs, precached. The cache name carries a hash of the
// contents, so any change ships as a new cache and the old one is dropped.
const files = ['./', 'index.html', 'manifest.webmanifest', 'fonts/fonts.css',
  ...fs.readdirSync(path.join(DIST, 'fonts')).filter(f => f.endsWith('.woff2')).map(f => 'fonts/' + f),
  'vendor/chart.umd.js', 'vendor/Sortable.min.js', 'vendor/three.module.min.js', ...(cloudCfg ? ['vendor/supabase.js', 'cloud.js'] : []), ...ICONS.map(f => 'icons/' + f)];
const h = crypto.createHash('sha256');
for (const f of files) if (f !== './') h.update(fs.readFileSync(path.join(DIST, f)));
const cacheName = `${CACHE_PREFIX}${version}-${h.digest('hex').slice(0, 10)}`;
const sw = `/* Ironlog service worker. Generated by scripts/build.js; do not edit. */
const CACHE=${JSON.stringify(cacheName)};
const FILES=${JSON.stringify(files)};
/* A first install takes over at once. An update installs and then waits until
   the page says the lifter tapped Reload (or every window of the app has
   closed), so a version never changes under a session in progress.
   Files are fetched past the browser's HTTP cache: GitHub Pages lets a file be
   cached for 10 minutes, so a plain fetch right after a publish could store
   the previous index.html under the new version's name. */
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))));});
self.addEventListener('message',e=>{if(e.data==='skipWaiting')self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith(${JSON.stringify(CACHE_PREFIX)})&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
/* Same-site files come from this version's cache, so the app opens instantly
   and offline, and the page always matches the files cached with it. A new
   version arrives only as a new worker with its own cache (the name carries a
   hash of every file), never by rewriting this one. Other sites (the CDN
   fallbacks) go to the network untouched, and so does the preview build under
   preview/: it has its own worker, which the preview page can only install
   if this one lets the page load. */
const OWN=new URL('./',self.registration.scope).pathname;
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(u.origin!==location.origin)return;
  ${PREVIEW ? '' : "if(u.pathname.startsWith(OWN+'preview/'))return;"}
  if(r.mode==='navigate'){
    e.respondWith(caches.open(CACHE).then(async c=>(await c.match('index.html'))||fetch(r).catch(()=>new Response('Offline',{status:503}))));
    return;
  }
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>hit||fetch(r)));
});
`;
fs.writeFileSync(path.join(DIST, 'sw.js'), sw);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
fs.writeFileSync(path.join(DIST, '404.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=./"><title>${NAME}</title>`);

console.log(`built ${path.basename(DIST)}/ for ${version} (${cacheName})`);
for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', ...files.filter(f => f !== './' && f !== 'index.html' && f !== 'manifest.webmanifest')]) {
  console.log('  ' + f.padEnd(52) + fs.statSync(path.join(DIST, f)).size.toLocaleString() + ' B');
}
