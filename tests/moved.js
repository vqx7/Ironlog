// Code moved out of the legacy script into src/app/ is the same code
// (ARCHITECTURE.md, the phases). For every declaration a phase moved, this
// compares the module's version with the same declaration in the published
// build the phase started from, after both go through esbuild's printer:
// TypeScript types, formatting and comments do not count, every expression,
// operator, literal and statement does, and so does the kind of declaration
// (const, let, var or function). So a move can type the code and lay it out
// to be read, and this suite still proves the logic did not change by a
// single token.
//
// Equal text is not enough on its own: the same text can mean something else
// if a name in it now points elsewhere (the r50 review planted five such
// changes and each passed the text comparison). So, in a moved module:
// - the top level holds only imports and exported declarations: no private
//   helper, no statement that runs on load, nothing that could change an
//   export after it is made;
// - an import keeps its name (`import { a as b }` would let `b` mean `a`);
// - every name a moved declaration uses resolves as it did in the build it
//   came from: a name that was a legacy declaration is a moved export of this
//   move (in this module, or imported under its own name from a module of the
//   move), a name that was imported from config still is, and a name that was
//   a browser or JavaScript global is not declared or imported in the module
//   (a `declare` in TypeScript leaves no trace in the code, and that is how
//   it is caught).
// And no module outside a move exports a name the move's baseline had as a
// legacy declaration, so moved code cannot sit somewhere this suite does not
// look.
//
// A declaration changed on purpose in a move, or added by one, is listed in
// `changed` or `added` with the release and the reason, and is held to the
// exact code and names its entry states and to an executable check.
const fs = require('fs'); const path = require('path');
const acorn = require('acorn'); const esbuild = require('esbuild');
const { freeNames, scanWrites } = require('../scripts/depmap');
const ROOT = path.join(__dirname, '..'); const APP = path.join(ROOT, 'src', 'app');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', m); };

const MOVES = [
  // Phase 2 (r50): the bottom layers, from r49's legacy script.
  { release: 'r50', baseline: 'baselines/r49.html', modules: ['util', 'units', 'library', 'routines', 'formulas'], changed: {} },
  // Phase 3a (r51): the rest of the self-contained code, from r50's (ARCHITECTURE.md). Four modules grow.
  // The store owns the shared state: ui, cloud, acct and acctWait move unchanged;
  // state is declared there without a value, and the legacy script's one
  // assignment at start, like every later one, goes through setState.
  { release: 'r51', baseline: 'baselines/r50.html', modules: ['util', 'library', 'routines', 'formulas', 'format', 'layout', 'icons', 'profile', 'records', 'gym', 'chunks', 'merge', 'session', 'loads', 'prs', 'trend', 'volume', 'goals', 'charts', 'importing', 'feedback', 'store'],
    changed: { state: { why: 'r51: declared in the store with no value; the save is put in it by setState(load()) where `let state=load();` stood', code: 'let state = undefined;', uses: [], check: m => m.state === undefined } },
    added: { setState: { why: 'r51: an import cannot be assigned to, so the legacy script replaces the log through this; it returns the value as the assignment did', code: 'function setState(next) { return state = next; }', uses: ['state'], check: m => { const a = { sessions: [] }, b = { sessions: [1] }; return m.setState(a) === a && m.state === a && m.setState(b) === b && m.state === b && m.setState.length === 1; } } },
    // The legacy script left behind must be r50's, statement for statement,
    // once each setState(x) is read back as the assignment it replaced.
    legacy: { calls: { setState: 'state' }, statements: { 'state = load();': 'let state = load();' } },
    // The one change on the page outside the app script (two iPhone users,
    // 2026-10-17): the installed app's page is held to the screen's height on
    // iOS 26 (src/02-style.css says why; tests/ios-bar.js holds it).
    page: { why: 'the tab bar on iOS 26 home-screen apps (tests/ios-bar.js)', adds: [{ after: "html{scroll-padding-top:calc(var(--head-h) + env(safe-area-inset-top,0px));-webkit-text-size-adjust:100%}\n", text: "/* iOS 26's home-screen app (r51; two iPhone users, 2026-10-17: the tab bar\n   rises and the page shrinks when tapping through the tabs, on History,\n   Settings and sometimes Plan). With viewport-fit=cover and the translucent\n   status bar, iOS 26 gives a page shorter than the screen a viewport shorter\n   by the status bar's height, so the fixed tab bar stops above the bottom\n   edge (frappe-ui pull requests 1284 and 1289). With a real log, Plan (about\n   780 px) is shorter than every current iPhone and Today (about 860 to 920)\n   than the larger ones, while Stats, History and Settings are taller; Plan\n   comes before those three in the bar, so the short viewport may begin on\n   Plan and carry over. That is a reading, not a proof (PENDING 303). In the installed\n   app no page is shorter than the screen now, and none is taller for it:\n   100lvh caps it where iOS has no such bug. Browsers without lvh drop it. */\n@media (display-mode:standalone){html{min-height:min(100lvh,calc(100% + env(safe-area-inset-top,0px)))}}\n" }] } },
  // Phase 3b (r52): the engine and the analytics, from r51's
  // (ARCHITECTURE.md, Phase 3b in detail). Each function that read the log,
  // the date or a cache takes the model as its first parameter, M, and gains
  // In; the read-back below turns it into r51's code before the comparison,
  // and allows no other use of the model.
  { release: 'r52', baseline: 'baselines/r51.html', modules: ['model', 'units', 'routines', 'gym', 'format', 'loads', 'analytics', 'time', 'weeks', 'coach', 'engine', 'live'],
    changed: {},
    model: {
      // The model's parts under the names r51 read them by: the log and the date.
      state: 'state', today: 'today',
      // The caches leave the legacy script; freshCaches gives their starting values.
      retired: ['EXMAP', '_idx', '_dix', '_cal', '_rirUse', '_bwRef', '_pace'],
    },
    // The declarations TypeScript's noUnusedLocals refuses as written, and
    // what is dropped from each on r51's side before the comparison; each is
    // verified below.
    prunes: {
      sgEasy: { from: 'C', drop: ['exId', 'opts', 'T', 'all', 'every', 'exps', 'seen', 'inRR', 'injM', 'last', 'ws', 'stx', 'abW', 'cap', 'fl', 'tp'] },
      sgPastRange: { from: 'C', drop: ['exId', 'opts', 'T', 'all', 'every', 'exps', 'seen', 'inRR', 'injM', 'last', 'ws', 'stx', 'abW', 'cap', 'fl', 'tp'] },
      sgBelowRange: { from: 'C', drop: ['exId', 'opts', 'T', 'all', 'every', 'seen', 'injM', 'last', 'ws', 'stx', 'abW', 'cap', 'atCap', 'capW', 'early', 'fl', 'tp'] },
      sgNoStep: { from: 'C', drop: ['ex', 'exId', 'opts', 'T', 'all', 'every', 'exps', 'seen', 'inRR', 'injM', 'last', 'ws', 'stx', 'cap', 'capW', 'tgtRir', 'early', 'fl'] },
      sgTopOfRange: { from: 'C', drop: ['exId', 'opts', 'T', 'all', 'every', 'exps', 'seen', 'inRR', 'injM', 'last', 'ws', 'stx', 'step', 'noAdd', 'abW', 'atCap', 'early', 'fl'] },
      sgBadDay: { from: 'C', drop: ['ex', 'exId', 'opts', 'T', 'all', 'every', 'seen', 'inRR', 'injM', 'last', 'ws', 'stx', 'step', 'noAdd', 'abW', 'cap', 'atCap', 'capW', 'tgtRir', 'early', 'fl', 'tp'] },
      sgReps: { from: 'C', drop: ['exId', 'opts', 'T', 'all', 'every', 'exps', 'seen', 'inRR', 'injM', 'last', 'ws', 'step', 'noAdd', 'abW', 'cap', 'atCap', 'capW', 'tgtRir', 'early', 'fl'] },
      idxLift: { from: 'sc', drop: ['exWin'] },
      // A date suggest computes and never reads. Dropping it changes nothing
      // only if reading opts.before and calling isDate and today do nothing:
      // the functions are held to their exact code here, and every caller
      // passes plain data (below).
      suggest: { statement: 'const T=opts.before&&isDate(opts.before)?opts.before:today();', reads: { isDate: 'const isDate = (v) => typeof v === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(v);', today: 'const today = () => iso(new Date());', iso: 'const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;', pad: 'const pad = (n) => String(n).padStart(2, "0");' }, passes: { suggest: 2, newBlock: 2 } },
    },
    added: {
      freshCaches: { why: "r52: the caches' starting values, as r51 declared them (every one null but _bwRef, which bwRef tests for undefined)", code: 'function freshCaches() { return { EXMAP: null, _idx: null, _dix: null, _cal: null, _rirUse: null, _bwRef: undefined, _pace: null }; }', uses: [],
        check: m => { const a = m.freshCaches(), b = m.freshCaches(); return a !== b && JSON.stringify(Object.keys(a)) === JSON.stringify(['EXMAP', '_idx', '_dix', '_cal', '_rirUse', '_bwRef', '_pace']) && Object.keys(a).every(k => (k === '_bwRef' ? a[k] === undefined : a[k] === null)); } },
      modelOf: { why: 'r52: a model of a given log and date, with fresh caches, for a test', code: 'function modelOf(s, today) { return { s, today, c: freshCaches() }; }', uses: ['freshCaches'],
        check: m => { const s = { sessions: [] }, t = () => '2026-01-05'; const A = m.modelOf(s, t), B = m.modelOf(s, t); return JSON.stringify(Object.keys(A)) === JSON.stringify(['s', 'today', 'c']) && A.s === s && A.today === t && A.c !== B.c && A.c._bwRef === undefined && '_bwRef' in A.c && A.c._idx === null; } },
      LIVE: { why: "r52: the model the app runs on: the store's log read at every use, util's today, and the caches", code: 'const LIVE = { get s() { return state; }, today, c: freshCaches() };', uses: ['freshCaches', 'state', 'today'], with: ['util', 'store'],
        check: (m, w) => { const L = m.LIVE, d = Object.getOwnPropertyDescriptor(L, 's'); if (!d || typeof d.get !== 'function' || d.set !== undefined) return false; if (JSON.stringify(Object.keys(L)) !== JSON.stringify(['s', 'today', 'c']) || L.today !== w.util.today || L.s !== w.store.state) return false; const a = { sessions: [] }, b = { sessions: [1] }; w.store.setState(a); if (L.s !== a) return false; w.store.setState(b); if (L.s !== b) return false; const c = L.c; return JSON.stringify(Object.keys(c)) === JSON.stringify(['EXMAP', '_idx', '_dix', '_cal', '_rirUse', '_bwRef', '_pace']) && Object.keys(c).every(k => (k === '_bwRef' ? c[k] === undefined : c[k] === null)); } },
      live: { why: 'r52: a function of the model as the app calls it, with LIVE and then every argument as given', code: 'function live(f) { return (...args) => f(LIVE, ...args); }', uses: ['LIVE'],
        check: m => { const seen = []; const f = function () { seen.push([...arguments]); return 'r'; }; const g = m.live(f); return g.length === 0 && g(1, 2, 3) === 'r' && g() === 'r' && g(undefined) === 'r' && seen.length === 3 && seen[0].length === 4 && seen[0][0] === m.LIVE && seen[0][1] === 1 && seen[0][3] === 3 && seen[1].length === 1 && seen[1][0] === m.LIVE && seen[2].length === 2 && seen[2][1] === undefined; } },
    },
    // Every other export of live.ts is `const X = live(XIn);`, for exactly the
    // names the legacy script imports from it.
    adapters: { module: 'live', fn: 'live', imports: 'src/09-imports.js' },
    // What the move reads back and compares, counted (ARCHITECTURE.md): the
    // functions taking the model (96 and invalidate), the 16 moved unchanged,
    // the adapters and the caches retired.
    expect: { model: 97, unchanged: 16, adapters: 74, retired: 7 },
    // The legacy script left behind is r51's, less the moved declarations and
    // the caches, once the 22 names the test hook gained are read back.
    legacy: { calls: {}, statements: {}, hook: ['U', 'toD', 'fromD', 'loadLabel', 'exName', 'planCredit', 'gymOf', 'isDeloadWeek', 'freeMode', 'injuredSet', 'prLoad', 'statsUpTo', 'readiness', 'bwRef', 'weekRoutine', 'easierText', 'barKg', 'suggestCore', 'loadOf', 'bwLoad', 'hardCredit', 'rirHalfOn'] } },
];

// One declaration as a normalized statement: a function as written, a
// variable as `<kind> name = init;`, both printed by esbuild with its local
// names (parameters and variables inside the declaration) renamed by the
// minifier, which names them by structure alone. The bundle renames a local
// that shadows a top-level name (r49 printed e1's `load` as `load2`, since
// the script has a function `load`), and that is not a change in logic.
// Every name that reaches outside the declaration keeps its own name, so a
// call to a different function still fails here.
// Whitespace is minified too: esbuild keeps an array or object literal's line
// breaks when it reprints, so without it a reformatted list read as a change
// (found in r51, when the new modules were formatted).
const norm = text => esbuild.transformSync(text, { loader: 'js', legalComments: 'none', minifyIdentifiers: true, minifyWhitespace: true }).code.trim();
// `kind` prints every variable with that keyword instead of its own, for a
// comparison where the keyword is the bundler's choice, not the code's: the
// minifier picks local names from the whole statement, keyword included.
function decls(code, statements, kind) {
  const out = new Map();
  for (const st of statements) {
    const s = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
    if (!s) continue;
    if (s.type === 'FunctionDeclaration') out.set(s.id.name, { code: norm(code.slice(s.start, s.end)), node: s });
    // The initializer is taken from after the name to the end of the declarator, so a parenthesized one keeps its parentheses (a sequence in them made esbuild stop, the r51 mutation test).
    else if (s.type === 'VariableDeclaration') for (const d of s.declarations) if (d.id.type === 'Identifier') out.set(d.id.name, { code: norm(`${kind || s.kind} ${d.id.name}${d.init ? code.slice(d.id.end, d.end) : ' = undefined'};`), node: d, kind: s.kind });
  }
  return out;
}
const declared = statements => new Set(statements.flatMap(st => {
  const s = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
  if (!s) return [];
  if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') return [s.id.name];
  if (s.type === 'VariableDeclaration') return s.declarations.filter(d => d.id.type === 'Identifier').map(d => d.id.name);
  return [];
}));
// The legacy script in a built page, found by the shape scripts/join.js gives
// the bundle, never by what the code looks like: before r49 the page's app
// script is the legacy function called at once, `(function(){'use strict';
// ...})();`, and from r49 esbuild's wrapper `(() => { ... })();` (after a
// "use strict" line from r50) holds the modules' code and then, as its last
// statement, that same call, since esbuild writes the entry's own code after
// the modules it imports. Anything else stops the suite. Until r51 this took
// the largest function that starts with "use strict", and the review showed a
// copy of the legacy body in a module was then read in its place, so a change
// to the real one went unseen. `outer` is what the bundle declared outside the
// legacy wrapper: the modules' code.
function legacyIn(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const app = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => (b.length > a.length ? b : a), '');
  const ast = acorn.parse(app, { ecmaVersion: 'latest' });
  const top = ast.body.filter(s => !(s.type === 'ExpressionStatement' && s.directive === 'use strict'));
  const call = s => s && s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression' && !s.expression.arguments.length ? s.expression.callee : null;
  const isLegacy = s => { const f = call(s); return !!f && f.type === 'FunctionExpression' && !f.params.length && f.body.body.length > 0 && f.body.body[0].directive === 'use strict'; };
  let wrap = null, outer = [];
  if (top.length === 1 && isLegacy(top[0])) wrap = call(top[0]);
  else if (top.length === 1 && call(top[0]) && call(top[0]).type === 'ArrowFunctionExpression' && call(top[0]).body.type === 'BlockStatement') {
    const inner = call(top[0]).body.body;
    if (inner.length && isLegacy(inner[inner.length - 1])) { wrap = call(inner[inner.length - 1]); outer = inner.slice(0, -1); }
  }
  if (!wrap) throw new Error(`${file}: the app script is not in the shape scripts/join.js builds, so its legacy script cannot be found`);
  // There is one legacy script, and it is the one found: a second call of
  // the same shape anywhere in the script (a copy of the legacy body
  // appended to it, the r51 mutation test) stops the suite.
  let shaped = 0;
  (function count(n) { if (!n || typeof n.type !== 'string') return; if (isLegacy(n)) shaped++; for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(count); else if (v && typeof v.type === 'string') count(v); } })(ast);
  if (shaped !== 1) throw new Error(`${file}: ${shaped} scripts of the legacy script's shape, where there is one`);
  return { app, ast, body: wrap.body.body, outer: [...ast.body.filter(s => s !== top[0]), ...outer], strict: ast.body[0] && ast.body[0].directive === 'use strict' };
}
// The legacy script's top-level declarations, and the names declared outside it.
function legacyOf(file) {
  const { app, body, outer } = legacyIn(file);
  return { decls: decls(app, body), outer: declared(outer), outerDecls: decls(app, outer, 'var'), app, body };
}
// Every file under src/app/, at any depth, named by its path from src/app/
// without `.ts` (`util`, `screens/today`). Anything that is not a `.ts` file
// is refused: the bundler would take `util.tsx` before `util.ts`, and no
// check reads it (the r51 mutation test).
function appFiles(dir = APP, rel = '') {
  const out = { ids: [], other: [] };
  for (const f of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? `${rel}/${f.name}` : f.name;
    if (f.isDirectory()) { const sub = appFiles(path.join(dir, f.name), r); out.ids.push(...sub.ids); out.other.push(...sub.other); }
    else if (f.name.endsWith('.ts')) out.ids.push(r.slice(0, -3));
    else out.other.push(r);
  }
  return out;
}
const FILES = appFiles();
ok(FILES.other.length === 0, 'src/app/ holds .ts files only', FILES.other);
// An import's target as a module id, resolved from the importing file's own
// place, never by its base name (a `./sub/util` matched `util` before, the
// r51 mutation test); `fromApp` says it is a module of src/app/.
function resolveImport(fromId, spec) {
  const abs = path.resolve(path.dirname(path.join(APP, fromId + '.ts')), spec);
  const rel = path.relative(APP, abs).split(path.sep).join('/');
  const fromApp = !rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(abs + '.ts');
  return { from: rel, fromApp, spec };
}
// A module's code as esbuild compiles it on its own, with its syntax tree.
// Characters outside ASCII are kept as written, as scripts/join.js builds the
// page (charset utf8): the minifier picks local names by how often each
// character occurs, so `×` written as `\xD7` on one side named the locals of
// suggestCore differently on the page and in its module (found in r52).
const TS = { loader: 'ts', format: 'esm', charset: 'utf8' };
const compiled = mod => { const js = esbuild.transformSync(fs.readFileSync(path.join(APP, mod + '.ts'), 'utf8'), TS).code; return { js, ast: acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' }) }; };
// A module as esbuild leaves it for the browser: what it imports (local name
// to source and imported name), its top-level statements, and its exports.
function moduleOf(name) {
  const ts = fs.readFileSync(path.join(APP, name + '.ts'), 'utf8');
  const js = esbuild.transformSync(ts, TS).code;
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  const imports = new Map(), odd = [], exported = new Set();
  const top = declared(ast.body);
  for (const s of ast.body) {
    if (s.type === 'ImportDeclaration') {
      // An import with no names (`import './x'`) runs a module for its effects: nothing a move may bring (the r51 review).
      if (!s.specifiers.length) odd.push(`import '${s.source.value}' (run for its effects)`);
      for (const sp of s.specifiers) {
        if (sp.type !== 'ImportSpecifier' || sp.imported.name !== sp.local.name) odd.push(`import ${js.slice(sp.start, sp.end)} from ${s.source.value}`);
        imports.set(sp.local.name, { ...resolveImport(name, s.source.value), name: sp.imported ? sp.imported.name : null });
      }
      continue;
    }
    if (s.type === 'ExportNamedDeclaration' && !s.source) {
      // esbuild prints `export function f` as `function f` plus `export { f }`,
      // so the exported names come from either form.
      for (const sp of s.specifiers || []) { if (sp.exported.name !== sp.local.name || !top.has(sp.local.name)) odd.push(`export ${js.slice(sp.start, sp.end)}`); exported.add(sp.exported.name); }
      if (s.declaration && s.declaration.type === 'VariableDeclaration' && s.declaration.declarations.some(d => d.id.type !== 'Identifier')) odd.push(`a destructured export: ${js.slice(s.start, Math.min(s.end, s.start + 80))}`);
      if (s.declaration) for (const n of declared([s])) exported.add(n);
      continue;
    }
    // A binding made by destructuring is a top-level name too, and one that
    // can take a global's name or run code on load (`const { Math } = ...`,
    // `const [] = [...]`, the r51 mutation test); only plain names pass.
    if (s.type === 'VariableDeclaration' && s.declarations.some(d => d.id.type !== 'Identifier')) odd.push(`a destructured top-level binding: ${js.slice(s.start, Math.min(s.end, s.start + 80))}`);
    if (s.type === 'FunctionDeclaration' || s.type === 'VariableDeclaration') continue; // checked below: every one must be exported
    odd.push(js.slice(s.start, Math.min(s.end, s.start + 80)));
  }
  for (const n of top) if (!exported.has(n)) odd.push(`a private top-level name: ${n}`);
  const all = decls(js, ast.body);
  // A function taking the model is known by its first parameter, M (phase
  // 3b), never by its name; its name is the r51 name with In added.
  const modelFns = new Map();
  for (const [n, d] of all) { const f = fnOf(d.node); if (f && f.params.length && f.params[0].type === 'Identifier' && f.params[0].name === MODEL) modelFns.set(n, n.endsWith('In') ? n.slice(0, -2) : null); }
  return { js, ast, imports, odd, modelFns, exported: new Map([...exported].map(n => [n, all.get(n)])) };
}
// The function a top-level declaration is: a function declaration, or a
// variable bound to a function or arrow expression.
const fnOf = node => node.type === 'FunctionDeclaration' ? node : node.type === 'VariableDeclarator' && node.init && /^(FunctionExpression|ArrowFunctionExpression)$/.test(node.init.type) ? node.init : null;
const MODEL = 'M';
// Every identifier in a piece of code, with the chain of nodes above it.
function idents(node) {
  const out = [];
  (function walk(n, up) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'Identifier') { out.push({ n, up }); return; }
    const next = [...up, n];
    for (const k in n) { if (k === 'type' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(x => walk(x, next)); else if (v && typeof v.type === 'string') walk(v, next); }
  })(node, []);
  return out;
}
// Whether an identifier names something rather than being a property name
// (`x.M`, `{ M: 1 }`) or a label.
function isRef({ n, up }) {
  const p = up[up.length - 1];
  if (!p) return true;
  if (p.type === 'MemberExpression' && p.property === n && !p.computed) return false;
  if ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key === n && !p.computed && !(p.type === 'Property' && p.shorthand && p.value === n)) return false;
  if ((p.type === 'LabeledStatement' || p.type === 'BreakStatement' || p.type === 'ContinueStatement') && p.label === n) return false;
  if (p.type === 'MetaProperty') return false;
  return true;
}
// A function taking the model read back as the r51 code it came from (phase
// 3b's five rules, ARCHITECTURE.md): the declaration loses In and its first
// parameter M; M.s is state, M.today is today and M.c.X is the cache X; a call
// fIn(M, ...) of a function taking the model is f(...); and `p => fIn(M, p)`
// is f where r51's f takes that one parameter. Any other use of M, or of a
// function taking the model, is a problem: M nested, indexed or passed whole,
// a spread, a call without M, a reader used as a value. `model(name)` says
// whether a name, as this module binds it, is a function taking the model, and
// gives its r51 name; `oneParam(name)` whether r51's declaration of it takes
// exactly one parameter. Returns the read-back code, the names the read-back
// produced (each resolved by the rule that produced it, not by an import), and
// the problems.
function readBack(js, d, base, spec, model, oneParam) {
  const node = d.node, f = fnOf(node), problems = [], produced = new Set(), edits = [];
  const own = f.params[0];
  const handled = new Set([own, node.id]);
  const at = n => js.slice(n.start, Math.min(n.end, n.start + 60));
  const all = idents(f);
  // Calls of a function taking the model, and the one-parameter arrows of rule 5.
  for (const r of all) {
    if (handled.has(r.n) || !isRef(r)) continue;
    const m = model(r.n.name);
    if (m === undefined) continue;
    if (m === null) { problems.push(`${r.n.name} takes the model but is not named for an r51 declaration with In`); continue; }
    const p = r.up[r.up.length - 1], g = r.up[r.up.length - 2];
    const firstIsM = p && p.type === 'CallExpression' && p.callee === r.n && p.arguments.length && p.arguments[0].type === 'Identifier' && p.arguments[0].name === MODEL;
    if (!firstIsM) { problems.push(`${r.n.name} used other than called with M first: ${at(p || r.n)}`); continue; }
    if (g && g.type === 'ArrowFunctionExpression' && g.body === p && g.params.length === 1 && g.params[0].type === 'Identifier' && p.arguments.length === 2 && p.arguments[1].type === 'Identifier' && p.arguments[1].name === g.params[0].name && oneParam(m)) {
      edits.push([g.start, g.end, m]); produced.add(m); handled.add(r.n); handled.add(p.arguments[0]); handled.add(p.arguments[1]); handled.add(g.params[0]);
      continue;
    }
    edits.push([r.n.start, r.n.end, m]); produced.add(m); handled.add(r.n); handled.add(p.arguments[0]);
    edits.push([p.arguments[0].start, p.arguments.length > 1 ? p.arguments[1].start : p.arguments[0].end, '']);
  }
  // M itself: the log, the date and the caches.
  for (const r of all) {
    if (handled.has(r.n) || r.n.name !== MODEL) continue;
    if (!isRef(r)) continue;
    const p = r.up[r.up.length - 1], g = r.up[r.up.length - 2];
    const prop = p && p.type === 'MemberExpression' && p.object === r.n && !p.computed ? p.property.name : null;
    if (prop === 's') { edits.push([p.start, p.end, spec.state]); produced.add(spec.state); }
    else if (prop === 'today') { edits.push([p.start, p.end, spec.today]); produced.add(spec.today); }
    else if (prop === 'c' && g && g.type === 'MemberExpression' && g.object === p && !g.computed && spec.retired.includes(g.property.name)) { edits.push([g.start, g.end, g.property.name]); produced.add(g.property.name); }
    else problems.push(`M used other than as M.s, M.today, M.c.<cache> or a first argument: ${at(p || r.n)}`);
  }
  // The declaration: its r51 name, and no M parameter.
  edits.push([node.id.start, node.id.end, base]);
  if (f.params.length === 1 && js[own.start - 1] !== '(') edits.push([own.start, own.end, '()']);
  else edits.push([own.start, f.params.length > 1 ? f.params[1].start : own.end, '']);
  // Apply, last first; overlapping edits mean a rule matched twice.
  const sorted = edits.sort((a, b) => b[0] - a[0]);
  for (let i = 1; i < sorted.length; i++) if (sorted[i][1] > sorted[i - 1][0]) problems.push(`two read-back rules overlap at ${js.slice(sorted[i][0], sorted[i][0] + 40)}`);
  let text = js.slice(node.start, node.end);
  for (const [a, b, rep] of sorted) text = text.slice(0, a - node.start) + (rep || '') + text.slice(b - node.start);
  const code = node.type === 'FunctionDeclaration' ? text : `${d.kind} ${text};`;
  // After the read-back no M and no function taking the model may remain.
  let back = null;
  try { const st = acorn.parse(code, { ecmaVersion: 'latest' }).body[0]; back = st.type === 'VariableDeclaration' ? st.declarations[0] : st; }
  catch (e) { problems.push(`the read-back does not parse: ${String(e.message)}`); }
  if (back) for (const r of idents(back)) if (isRef(r) && (r.n.name === MODEL || model(r.n.name) !== undefined)) problems.push(`${r.n.name} remains after the read-back`);
  return { code, node: back, produced, problems };
}

// A module can take declarations from more than one move (r51 added to four
// of r50's), so each export is compared with the baseline of the move that
// moved it: the latest move listing its module whose baseline still had it
// as a legacy declaration.
const bases = new Map(MOVES.map(mv => [mv.release, legacyOf(mv.baseline)]));
const listed = [...new Set(MOVES.flatMap(mv => mv.modules))];
const mods = new Map();
for (const mod of listed) {
  if (!FILES.ids.includes(mod)) { ok(false, `src/app/${mod}.ts exists`); continue; }
  mods.set(mod, moduleOf(mod));
}
// The names a module exports from its own declarations (re-exports never count).
const ownCache = new Map();
const ownExports = mod => { if (!ownCache.has(mod)) ownCache.set(mod, mods.get(mod) ? new Set(mods.get(mod).exported.keys()) : FILES.ids.includes(mod) ? new Set(moduleOf(mod).exported.keys()) : new Set()); return ownCache.get(mod); };
// The name an export moved under: a function taking the model is its r51
// name with In added (null when it is not named so).
const baseName = (mod, name) => { const m = mods.get(mod); return m && m.modelFns.has(name) ? m.modelFns.get(name) : name; };
// The adapters' module holds no moved code: its exports are held by the adapter rule below.
const adapterMod = mod => MOVES.some(mv => mv.adapters && mv.adapters.module === mod);
// A function taking the model is moved only by a move that reads the model back.
const homeOf = (mod, name) => {
  if (adapterMod(mod)) return null;
  const b = baseName(mod, name); if (b == null) return null;
  for (const mv of [...MOVES].reverse()) if (mv.modules.includes(mod) && bases.get(mv.release).decls.has(b)) return b !== name && !mv.model ? null : mv;
  return null;
};
// r51's code of a declaration with a listed prune applied (phase 3b): the
// names dropped from a destructuring, or the statement dropped, and a check
// that nothing left in the declaration reads what was dropped.
function pruned(mv, name) {
  const B = bases.get(mv.release), d = B.decls.get(name), spec = mv.prunes[name], f = d && fnOf(d.node), problems = [];
  if (!f || f.body.type !== 'BlockStatement') return { code: null, problems: [`${name} is not a function with a body in ${mv.baseline}`] };
  const top = f.body.body; let edit = null, dropped = [];
  if (spec.from) {
    const st = top.find(x => x.type === 'VariableDeclaration' && x.declarations.length === 1 && x.declarations[0].id.type === 'ObjectPattern' && x.declarations[0].init && x.declarations[0].init.type === 'Identifier' && x.declarations[0].init.name === spec.from);
    if (!st) problems.push(`${name} has no top-level destructuring of ${spec.from}`);
    else {
      const props = st.declarations[0].id.properties;
      const names = props.map(q => (q.type === 'Property' && q.shorthand && !q.computed && q.value.type === 'Identifier' ? q.value.name : null));
      if (names.includes(null)) problems.push(`${name}'s destructuring of ${spec.from} is not plain names`);
      for (const x of spec.drop) if (!names.includes(x)) problems.push(`${x} is not destructured in ${name}`);
      const keep = props.filter((q, i) => !spec.drop.includes(names[i]));
      edit = [st.declarations[0].id.start, st.declarations[0].id.end, `{${keep.map(q => B.app.slice(q.start, q.end)).join(',')}}`]; dropped = spec.drop;
    }
  } else if (spec.statement) {
    const st = top.find(x => norm(B.app.slice(x.start, x.end)) === norm(spec.statement));
    if (!st) problems.push(`${name} has no top-level statement ${spec.statement}`);
    else { edit = [st.start, st.end, '']; dropped = declNames(st); }
  }
  if (!edit) return { code: null, problems };
  const at = d.node.start; let text = B.app.slice(at, d.node.end);
  text = text.slice(0, edit[0] - at) + edit[2] + text.slice(edit[1] - at);
  const code = d.node.type === 'FunctionDeclaration' ? text : `${d.kind} ${text};`;
  const st = acorn.parse(code, { ecmaVersion: 'latest' }).body[0];
  const free = freeNames(st.type === 'VariableDeclaration' ? st.declarations[0] : st);
  for (const x of dropped) if (free.has(x)) problems.push(`${name} still reads ${x} once it is dropped`);
  return { code: norm(code), problems };
}
const declNames = st => st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' ? [st.id.name] : st.type === 'VariableDeclaration' ? st.declarations.filter(d => d.id.type === 'Identifier').map(d => d.id.name) : [];
const counted = Object.fromEntries(MOVES.map(mv => [mv.release, 0]));
const tally = { model: 0, unchanged: 0 };
for (const mv of MOVES) ok(bases.get(mv.release).decls.size > 500, `${mv.release}: the legacy declarations of ${mv.baseline} are read (${bases.get(mv.release).decls.size})`);
for (const [mod, m] of mods) {
  ok(m.odd.length === 0, `src/app/${mod}.ts holds only imports under their own names and exported declarations`, m.odd);
  const missing = [], differ = [], astray = [];
  // As this module binds a name: a function taking the model, by its r51
  // name (null when misnamed or not from a module of the move), or undefined.
  const modelOfName = mv => u => {
    const imp = m.imports.get(u);
    let b;
    if (imp) { if (!imp.fromApp || !mods.has(imp.from) || !mods.get(imp.from).modelFns.has(imp.name)) return undefined; b = mods.get(imp.from).modelFns.get(imp.name); if (b == null || homeOf(imp.from, imp.name) !== mv) return null; }
    else { if (!m.modelFns.has(u)) return undefined; b = m.modelFns.get(u); if (b == null || homeOf(mod, u) !== mv) return null; }
    return b;
  };
  for (const [name, d] of m.exported) {
    const mv = homeOf(mod, name);
    if (!mv && adapterMod(mod) && !(MOVES.find(x => x.adapters && x.adapters.module === mod).added || {})[name]) continue; // the adapter rule below
    // Code added or changed on purpose is held to the exact code its entry
    // states and to the names it states it uses (the r51 review: without
    // this, any body passed as long as the executable check did).
    const spec = mv && mv.changed[name] ? mv.changed[name] : !mv ? (MOVES.find(x => x.modules.includes(mod) && x.added && x.added[name]) || { added: {} }).added[name] : null;
    if (spec) {
      const uses = [...freeNames(d.node)].filter(u => u !== name).sort();
      if (!spec.code || norm(spec.code) !== d.code) differ.push({ name, release: 'stated', was: spec.code ? norm(spec.code) : '(no code stated)', now: d.code.slice(0, 300) });
      else if (JSON.stringify(uses) !== JSON.stringify([...(spec.uses || [])].sort()) || uses.some(u => !m.exported.has(u) && !m.imports.has(u))) astray.push(`${name} uses ${uses.join(', ') || 'nothing'}, its entry states ${(spec.uses || []).join(', ') || 'nothing'}`);
      continue;
    }
    const base = mv && bases.get(mv.release);
    const bname = mv ? baseName(mod, name) : name;
    const was = base && base.decls.get(bname);
    if (!was || d == null) { missing.push(name); continue; }
    // A function taking the model is read back to r51's code first (phase 3b).
    const isModel = m.modelFns.has(name);
    let now = d, produced = new Set();
    if (isModel) {
      const rb = readBack(m.js, d, bname, mv.model, modelOfName(mv), u => { const w = base.decls.get(u); const f = w && fnOf(w.node); return !!f && f.params.length === 1; });
      if (rb.problems.length) { differ.push({ name, release: mv.release, was: 'the read-back', now: rb.problems.slice(0, 3) }); continue; }
      now = { code: norm(rb.code), node: rb.node }; produced = rb.produced;
    }
    let wasCode = was.code;
    if (mv.prunes && mv.prunes[bname]) { const p = pruned(mv, bname); if (p.problems.length || !p.code) { differ.push({ name, release: mv.release, was: 'the listed prune', now: p.problems }); continue; } wasCode = p.code; }
    if (wasCode !== now.code) { differ.push({ name, release: mv.release, was: wasCode.slice(0, 300), now: now.code.slice(0, 300) }); continue; }
    counted[mv.release]++;
    if (mv.model) tally[isModel ? 'model' : 'unchanged']++;
    // Each name the declaration uses resolves as it did in that baseline. A
    // name the read-back produced resolves by the rule that produced it, so
    // the module may not also bind it.
    for (const u of freeNames(now.node)) {
      if (u === bname) continue;
      const imp = m.imports.get(u);
      const fromApp = imp && imp.fromApp;
      let good;
      if (produced.has(u)) good = !imp && !m.exported.has(u) && (u === mv.model.state ? base.outer.has(u) : u === mv.model.today ? base.outer.has(u) : base.decls.has(u));
      else if (base.decls.has(u)) good = imp ? (fromApp && mods.has(imp.from) && mods.get(imp.from).exported.has(u) && !!homeOf(imp.from, u)) : m.exported.has(u) && !!homeOf(mod, u);
      // A module's name must come from the module that declares it, under the
      // same name: a re-export elsewhere could hand over another value with
      // the same name (the r51 review: APP_NAME from types meant PREVIEW_NAME).
      else if (base.outer.has(u)) good = imp ? !!fromApp && ownExports(imp.from).has(u) : m.exported.has(u);
      else good = !imp && !m.exported.has(u);
      if (!good) astray.push(`${name} uses ${u}: ${produced.has(u) ? 'from the read-back' : base.decls.has(u) ? 'a legacy declaration' : base.outer.has(u) ? 'a module export' : 'a global'} in ${mv.baseline}, ${imp ? `imported here from ${imp.spec}` : m.exported.has(u) ? 'declared here' : 'unbound here'}`);
    }
  }
  ok(missing.length === 0, `every export of src/app/${mod}.ts was a declaration in the baseline of the move that moved it (nothing new slipped into a move)`, missing);
  ok(differ.length === 0, `every export of src/app/${mod}.ts is the same code as in that baseline, types and layout aside${MOVES.some(mv => mv.model && mv.modules.includes(mod)) ? ', once read back from the model' : ''}`, differ.slice(0, 3));
  ok(astray.length === 0, `every name the moved code in src/app/${mod}.ts uses points where it pointed in that baseline`, astray.slice(0, 5));
}
for (const mv of MOVES) ok(counted[mv.release] > 0, `${mv.release}: ${counted[mv.release]} moved declarations compared token for token`);
for (const mv of MOVES) if (mv.expect) ok(tally.model === mv.expect.model && tally.unchanged === mv.expect.unchanged, `${mv.release}: ${tally.model} functions taking the model read back and ${tally.unchanged} moved unchanged, compared token for token (${mv.expect.model} and ${mv.expect.unchanged} expected)`);
// What makes each listed prune change nothing (phase 3b), checked on the
// baseline's code: a name dropped from a destructuring of an object of plain
// values, or of an object a function returns as a literal, has no getter to
// run; the statement dropped from suggest reads plain data and calls
// functions held here to their exact code, which change nothing.
for (const mv of MOVES) if (mv.prunes) {
  const B = bases.get(mv.release), problems = [];
  // Every identifier in the legacy script that names `name`, with the declaration it sits in.
  const refsIn = name => { const out = []; for (const st of B.body) for (const r of idents(st)) if (r.n.name === name && isRef(r)) out.push({ ...r, st }); return out; };
  const plainObj = o => o && o.type === 'ObjectExpression' && o.properties.every(q => q.type === 'Property' && q.kind === 'init' && !q.method && !q.computed);
  for (const [name, spec] of Object.entries(mv.prunes)) {
    const d = B.decls.get(name), f = d && fnOf(d.node);
    if (!f) { problems.push(`${name}: not a function in ${mv.baseline}`); continue; }
    if (spec.from === 'C') {
      // C is suggestCore's object of shorthand names, and suggestCore is the only caller of each case, passing C alone.
      const sc = B.decls.get('suggestCore'), scf = sc && fnOf(sc.node);
      const decl = scf && scf.body.body.find(x => x.type === 'VariableDeclaration' && x.declarations.length === 1 && x.declarations[0].id.type === 'Identifier' && x.declarations[0].id.name === 'C');
      const init = decl && decl.declarations[0].init;
      if (!(decl && decl.kind === 'const' && plainObj(init) && init.properties.every(q => q.shorthand))) problems.push(`${name}: C is not a constant object of shorthand names in suggestCore`);
      for (const r of refsIn(name)) {
        const p = r.up[r.up.length - 1];
        if (r.n === d.node.id) continue;
        if (!(r.st === sc.node && p.type === 'CallExpression' && p.callee === r.n && p.arguments.length === 1 && p.arguments[0].type === 'Identifier' && p.arguments[0].name === 'C')) problems.push(`${name}: referred to other than as suggestCore's call with C`);
      }
      // In the modules, the case is called only from suggestCore's moved form.
      // (Import and export lists name it without using it.)
      for (const [mod, m] of mods) for (const st of m.ast.body) {
        const s2 = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
        if (!s2 || !/^(FunctionDeclaration|VariableDeclaration)$/.test(s2.type)) continue;
        for (const r of idents(s2)) {
          if (!isRef(r) || baseName(mod, r.n.name) !== name || (m.imports.has(r.n.name) ? false : !m.exported.has(r.n.name))) continue;
          const own = s2 && (s2.id === r.n || (s2.declarations || []).some(x => x.id === r.n));
          const host = s2 && s2.type === 'FunctionDeclaration' ? s2.id.name : s2 && s2.declarations ? s2.declarations[0].id.name : null;
          if (!own && baseName(mod, host || '') !== 'suggestCore') problems.push(`${name}: referred to in src/app/${mod}.ts outside suggestCore`);
        }
      }
    } else if (spec.from === 'sc') {
      // sc is trendScope's result, and trendScope returns an object literal of plain values.
      const st = f.body.body.find(x => x.type === 'VariableDeclaration' && x.declarations.length === 1 && x.declarations[0].id.type === 'Identifier' && x.declarations[0].id.name === 'sc');
      const call = st && st.declarations[0].init;
      const ts = B.outerDecls.get('trendScope'), tf = ts && fnOf(ts.node);
      const rets = []; if (tf) (function walk(n, top) { if (!n || typeof n.type !== 'string') return; if (!top && /Function/.test(n.type)) return; if (n.type === 'ReturnStatement') rets.push(n); for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(x => walk(x, false)); else if (v && typeof v.type === 'string') walk(v, false); } })(tf, true);
      if (!(st && st.kind === 'const' && call.type === 'CallExpression' && call.callee.type === 'Identifier' && call.callee.name === 'trendScope' && !B.decls.has('trendScope') && rets.length && rets.every(r => plainObj(r.argument)))) problems.push(`${name}: sc is not trendScope's object literal`);
    } else if (spec.statement) {
      // The statement reads suggest's options and calls functions held to their exact code here.
      const st = f.body.body.find(x => norm(B.app.slice(x.start, x.end)) === norm(spec.statement));
      const params = f.params.map(p => p.type === 'Identifier' ? p.name : null);
      const reads = st ? [...freeNames(st)].filter(u => !declNames(st).includes(u)) : [];
      const allowed = new Set([...Object.keys(spec.reads), ...params]);
      if (!st || reads.some(u => !allowed.has(u))) problems.push(`${name}: the dropped statement reads ${reads.join(', ')}`);
      for (const [fn, code] of Object.entries(spec.reads)) {
        // The bundle writes a module's const as var, so the keyword is the bundler's (decls, above).
        const o = B.outerDecls.get(fn);
        if (!o || o.code !== norm(code.replace(/^(const|let) /, 'var '))) problems.push(`${name}: ${fn} is not ${code}`);
        // Each calls only the others listed, and the two JavaScript globals that read nothing of the page.
        else for (const u of freeNames(o.node)) if (u !== fn && !spec.reads[u] && !['Date', 'String'].includes(u)) problems.push(`${name}: ${fn} uses ${u}`);
      }
      // Every caller passes plain data, or newBlock's own options, which its callers pass as plain data.
      for (const [callee, at] of Object.entries(spec.passes)) for (const r of refsIn(callee)) {
        const p = r.up[r.up.length - 1];
        if (r.n === (B.decls.get(callee) || { node: {} }).node.id) continue;
        const hook = r.st.type === 'ExpressionStatement' && r.st.expression.type === 'AssignmentExpression' && B.app.slice(r.st.expression.left.start, r.st.expression.left.end) === 'window.__ironlog';
        if (hook && p.type === 'Property' && p.shorthand) continue; // the test hook hands it to the suites
        if (!(p.type === 'CallExpression' && p.callee === r.n)) { problems.push(`${callee}: referred to other than called`); continue; }
        const a = p.arguments[at];
        if (!a || plainObj(a)) continue;
        const host = r.st.type === 'FunctionDeclaration' ? r.st : null;
        const viaParam = a.type === 'Identifier' && host && spec.passes[host.id.name] === at && host.params[at] && host.params[at].type === 'Identifier' && host.params[at].name === a.name && !scanWrites(host).has(a.name);
        if (!viaParam) problems.push(`${callee}: a call passes ${B.app.slice(a.start, Math.min(a.end, a.start + 60))}`);
      }
    }
  }
  ok(problems.length === 0, `${mv.release}: each of the ${Object.keys(mv.prunes).length} listed prunes drops only what nothing reads and nothing runs for`, problems.slice(0, 5));
}

// The adapters (phase 3b): every export of the adapters' module other than
// what the move added is `const X = live(XIn);`, XIn a function taking the
// model, moved by this move and imported under its own name, and X its r51
// name; and they are exactly the names the legacy script imports from it.
for (const mv of MOVES) if (mv.adapters) {
  const m = mods.get(mv.adapters.module), problems = [], names = [];
  for (const [name, d] of m ? m.exported : []) {
    if (mv.added[name]) continue;
    const imp = m.imports.get(name + 'In');
    const src = imp && imp.fromApp && mods.get(imp.from);
    if (!d || d.code !== norm(`const ${name} = ${mv.adapters.fn}(${name}In);`)) { problems.push(`${name} is not ${mv.adapters.fn}(${name}In)`); continue; }
    if (!src || !src.modelFns.has(name + 'In') || src.modelFns.get(name + 'In') !== name || homeOf(imp.from, name + 'In') !== mv) { problems.push(`${name}In is not a function taking the model that this move moved`); continue; }
    names.push(name);
  }
  const imp = acorn.parse(fs.readFileSync(path.join(ROOT, mv.adapters.imports), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' }).body.filter(st => st.type === 'ImportDeclaration' && st.source.value === `./app/${mv.adapters.module}`).flatMap(st => st.specifiers.map(sp => sp.imported.name));
  const a = [...names].sort(), b = [...imp].sort();
  ok(problems.length === 0 && JSON.stringify(a) === JSON.stringify(b) && a.length === mv.expect.adapters, `${mv.release}: ${a.length} adapters, each ${mv.adapters.fn}(XIn) under the r51 name, exactly the names the legacy script imports from src/app/${mv.adapters.module}.ts (${mv.expect.adapters} expected)`, problems.length ? problems.slice(0, 5) : { only_here: a.filter(x => !b.includes(x)), only_imported: b.filter(x => !a.includes(x)) });
}

// M is the model's name (phase 3b): in every module it appears only inside a
// top-level function whose first parameter it is, so it can never name
// anything else (the read-back refuses any other use inside those).
{
  const bad = [];
  for (const id of FILES.ids) {
    const m = mods.get(id) || moduleOf(id);
    const hosts = m.ast.body.map(st => (st.type === 'ExportNamedDeclaration' ? st.declaration : st)).filter(Boolean).flatMap(s2 => s2.type === 'FunctionDeclaration' ? [s2] : s2.type === 'VariableDeclaration' ? s2.declarations.map(x => fnOf(x)).filter(Boolean) : []).filter(f => f.params.length && f.params[0].type === 'Identifier' && f.params[0].name === MODEL);
    for (const r of idents(m.ast)) if (r.n.name === MODEL && isRef(r) && !hosts.some(f => r.n.start >= f.start && r.n.end <= f.end)) bad.push(`src/app/${id}.ts: ${m.js.slice(Math.max(0, r.n.start - 30), r.n.end + 30)}`);
  }
  ok(bad.length === 0, 'the name M appears only inside a function taking the model as its first parameter', bad.slice(0, 5));
}

// Code a move adds or changes on purpose has no baseline to be compared
// with, so each entry carries a check that runs against the module itself,
// bundled on its own and loaded fresh: a declaration with no check fails. An
// entry whose check needs other modules (r52: LIVE reads the store's log and
// util's today) names them in `with`, and they are bundled with it, so the
// check sees the same instances the module does.
{
  const os = require('os');
  const load = (mod, withMods) => {
    const all = [mod, ...(withMods || [])];
    const entry = all.map((x, i) => `export * as m${i} from './${x}';`).join('\n');
    const out = esbuild.buildSync({ stdin: { contents: entry, resolveDir: APP, loader: 'ts' }, bundle: true, format: 'cjs', platform: 'neutral', write: false, logLevel: 'silent' }).outputFiles[0].text;
    const file = path.join(os.tmpdir(), `ironlog-moved-${mod}-${process.pid}.js`); fs.writeFileSync(file, out);
    let ns; try { delete require.cache[file]; ns = require(file); } finally { fs.unlinkSync(file); }
    return { main: ns.m0, with: Object.fromEntries((withMods || []).map((x, i) => [x, ns[`m${i + 1}`]])) };
  };
  for (const mv of MOVES) for (const kind of ['changed', 'added']) for (const [name, spec] of Object.entries(mv[kind] || {})) {
    const mod = mv.modules.find(x => mods.has(x) && mods.get(x).exported.has(name));
    let good = false, why = 'no check';
    if (mod && spec && typeof spec.check === 'function') { try { const L = load(mod, spec.with); good = spec.check(L.main, L.with) === true; why = good ? '' : 'the check failed'; } catch (e) { why = String(e); } }
    else if (!mod) why = 'not exported by a module of the move';
    ok(good, `${mv.release}: ${name}, ${kind} on purpose, does what its entry says (${spec && spec.why ? spec.why.split(':')[0] : '?'})`, why || undefined);
  }
}

// The legacy script a move leaves behind is the baseline's, statement for
// statement and in order, less the declarations the move took out, once the
// rewrites the move lists are read back (r51: setState(x) for state = x). So
// nothing but the move and its listed rewrites can change in the legacy
// script, which the comparison of moved code alone does not show.
const legacyStatements = file => legacyIn(file);
{
  const mv = MOVES[MOVES.length - 1];
  const rw = mv.legacy || { calls: {}, statements: {} };
  const movedNames = new Set();
  // By the name each had in the baseline (a function taking the model less its In), with the caches the move retired.
  for (const [mod, m] of mods) for (const name of m.exported.keys()) { const h = homeOf(mod, name); if (h === mv && !mv.changed[name]) movedNames.add(baseName(mod, name)); }
  for (const x of (mv.model && mv.model.retired) || []) movedNames.add(x);
  if (mv.expect) ok((mv.model.retired || []).length === mv.expect.retired && mv.model.retired.every(x => bases.get(mv.release).decls.has(x)), `${mv.release}: the ${mv.expect.retired} caches retired were legacy declarations in ${mv.baseline}`);
  const was = legacyStatements(mv.baseline);
  const before = was.body.filter(st => { const n = declNames(st); return !(n.length && n.every(x => movedNames.has(x))); }).map(st => norm(was.app.slice(st.start, st.end)));
  const now = legacyStatements('index.html');
  // Read each listed call back as the assignment it replaced, then the
  // statement as the one it replaced. Names the test hook gained (r52) are
  // read back by taking them off its end, where they must stand in order as
  // plain names; a hook that did not gain them, or gained them elsewhere,
  // stays as it is and differs.
  let hookRead = 0;
  const legacyBack = (code, st) => {
    let text = code.slice(st.start, st.end); const edits = [];
    const add = rw.hook || [];
    const e = st.type === 'ExpressionStatement' && st.expression.type === 'AssignmentExpression' ? st.expression : null;
    if (add.length && e && e.left.type === 'MemberExpression' && !e.left.computed && e.left.object.type === 'Identifier' && e.left.object.name === 'window' && e.left.property.name === '__ironlog' && e.right.type === 'ObjectExpression') {
      const ps = e.right.properties, tail = ps.slice(-add.length);
      if (ps.length > add.length && tail.every((q, i) => q.type === 'Property' && q.shorthand && q.key.name === add[i])) { edits.push([ps[ps.length - add.length - 1].end - st.start, ps[ps.length - 1].end - st.start, '']); hookRead++; }
    }
    (function walk(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && rw.calls[n.callee.name] && n.arguments.length === 1) edits.push([n.start - st.start, n.end - st.start, `(${rw.calls[n.callee.name]} = (${code.slice(n.arguments[0].start, n.arguments[0].end)}))`]);
      for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
    })(st);
    for (const [a, b, r] of edits.sort((x, y) => y[0] - x[0])) text = text.slice(0, a) + r + text.slice(b);
    const t = norm(text); const alias = Object.entries(rw.statements).find(([k]) => norm(k) === t); return alias ? norm(alias[1]) : t;
  };
  const after = now.body.map(st => legacyBack(now.app, st));
  if (rw.hook) ok(hookRead === 1, `${mv.release}: the test hook gained the ${rw.hook.length} listed names, at its end and in order`);
  let i = 0; while (i < before.length && i < after.length && before[i] === after[i]) i++;
  ok(before.length === after.length && i === before.length, `${mv.release}: every statement left in the legacy script is ${mv.baseline}'s, in order, once the listed rewrites are read back (${after.length} statements)`, i < Math.max(before.length, after.length) ? { at: i, was: (before[i] || '').slice(0, 200), now: (after[i] || '').slice(0, 200) } : { counts: [before.length, after.length] });
}

// The page is what src/ builds, and the module code on it is the modules'
// code (the r51 mutation test: a build script that injected a file, a
// package.json field that swapped a module in, a replace on the bundle's
// text, a module in a subfolder under a known name, and an index.html edited
// by hand each passed every check, since nothing compared the bundled module
// code with src/app/). So: scripts/join.js builds index.html exactly; the
// script starts strict; outside the legacy script the page holds only
// declarations, each one module's by name and code (types and layout set
// aside, and every variable printed as `var`, which the bundler writes for a
// module's `const` and `let`), every module
// declaration is on the page once, and the page's other inline scripts are
// the baseline's.
{
  let built = null, why = '';
  try { built = require('../scripts/join').build().html; } catch (e) { why = String(e.message).split('\n')[0]; }
  ok(built !== null && built === fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), 'index.html is what scripts/join.js builds from src/', why || undefined);
  const page = legacyIn('index.html');
  ok(page.strict, 'the page\'s script starts with "use strict", so the modules run strict as modules do');
  const stmts = page.outer.filter(s => !(s.type === 'ExpressionStatement' && s.directive));
  const odd = stmts.filter(s => s.type !== 'VariableDeclaration' && s.type !== 'FunctionDeclaration').map(s => page.app.slice(s.start, Math.min(s.end, s.start + 80)));
  ok(odd.length === 0, 'outside the legacy script the page holds declarations only', odd);
  const onPage = decls(page.app, stmts.filter(s => s.type === 'VariableDeclaration' || s.type === 'FunctionDeclaration'), 'var');
  const inMods = new Map(), twice = [];
  for (const id of FILES.ids) { const c = compiled(id); for (const [n, d] of decls(c.js, c.ast.body, 'var')) { if (inMods.has(n)) twice.push(`${n} (${inMods.get(n).id}, ${id})`); inMods.set(n, { id, code: d.code }); } }
  ok(twice.length === 0, 'no two modules declare the same top-level name, so the bundler renames nothing', twice);
  const notOnPage = [...inMods.keys()].filter(n => !onPage.has(n)), notInMods = [...onPage.keys()].filter(n => !inMods.has(n));
  ok(notOnPage.length === 0 && notInMods.length === 0, `the declarations on the page outside the legacy script are the modules' (${onPage.size})`, { notOnPage, notInMods });
  const differ = [...onPage].filter(([n, d]) => inMods.has(n) && d.code !== inMods.get(n).code).map(([n, d]) => ({ name: n, page: d.code.slice(0, 200), module: inMods.get(n).code.slice(0, 200) }));
  ok(differ.length === 0, 'every declaration on the page outside the legacy script is its module\'s code', differ.slice(0, 3));
  // A move changes nothing a lifter sees, so the page around the app script
  // (markup, styles, the loader, and with them any handler attribute, which
  // is a script the check above does not see) is the baseline's once the
  // build id is set aside. A release that changes the page says so in its
  // move entry (`page: { why, adds: [{ after, text }] }`): the page must then
  // be the baseline's with each text inserted directly after its anchor, a
  // run of the baseline's own text found there exactly once, and nothing
  // else (the second r51 review moved an addition into a comment, where it
  // dropped a rule, and the text alone still matched).
  const mvLast = MOVES[MOVES.length - 1];
  const around = (f, id) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(legacyIn(f).app, '{{APP}}').split(id).join('{{APP_VERSION}}');
  const idOf = f => (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/<meta name="app-build" content="([^"]+)"/) || [])[1];
  const adds = mvLast.page ? mvLast.page.adds : [];
  const base = around(mvLast.baseline, idOf(mvLast.baseline));
  let want = base; const bad = [];
  for (const a of Array.isArray(adds) ? adds : []) {
    if (!a || typeof a.after !== 'string' || !a.after || typeof a.text !== 'string' || !a.text || base.split(a.after).length !== 2) { bad.push(a && a.after ? a.after.slice(0, 60) : a); continue; }
    want = want.replace(a.after, () => a.after + a.text);
  }
  if (mvLast.page) console.log(`note ${mvLast.release} adds to the page outside the app script: ${mvLast.page.why}`);
  ok(!mvLast.page || (typeof mvLast.page.why === 'string' && Array.isArray(adds) && adds.length > 0 && bad.length === 0), 'a move entry that changes the page says why and gives each addition an anchor found once in the baseline', bad.length ? { bad } : undefined);
  ok(around('index.html', idOf('index.html')) === want, `the page outside the app script is ${mvLast.baseline}'s, the build id set aside${adds.length ? `, with exactly the ${adds.length} listed addition${adds.length > 1 ? 's' : ''}, each at its anchor` : ''}`);
}

// Every module is either in a move, so this suite compares it, or written new
// on purpose and held by tests of its own (the r51 review: a module in
// neither list was compared by nothing). A module written new is also held to
// what it may contain, since nothing compares it with a baseline (the second
// r51 review put `Math.round = x => Math.floor(x)` in types.ts and in
// config.ts, and a copy of the legacy body in config.ts, and each passed).
// Each value config defines is a constant made from literals and config's own
// constants: no import, no function, no assignment, nothing that runs, except
// the string methods FILE_PREFIX is made with and, in THREE_URLS alone, the
// page flag the build sets on window (IRONLOG_APP picks the installed app's
// own three.js). Nothing else may differ between the page and Node (a
// STORAGE_ID that read the flag passed, the r51 mutation test: the installed
// app would have lost its log while every check saw the other branch).
function configRules() {
  const { ast } = compiled('config'), bad = [], own = new Set();
  const CALLS = new Set(['toLowerCase', 'replace']), FLAGS = new Set(['IRONLOG_APP']), FLAGGED = new Set(['THREE_URLS']);
  let current = null;
  const NODES = new Set(['Literal', 'TemplateLiteral', 'TemplateElement', 'ArrayExpression', 'ObjectExpression', 'Property', 'SpreadElement', 'Identifier', 'MemberExpression', 'ConditionalExpression', 'LogicalExpression', 'BinaryExpression', 'UnaryExpression', 'CallExpression']);
  const okCall = n => n.callee.type === 'MemberExpression' && !n.callee.computed && CALLS.has(n.callee.property.name) && ((n.callee.object.type === 'Identifier' && own.has(n.callee.object.name)) || (n.callee.object.type === 'CallExpression' && okCall(n.callee.object)));
  const walk = (n, up) => {
    if (!n || typeof n.type !== 'string') return;
    if (!NODES.has(n.type)) { bad.push(n.type); return; }
    if (n.type === 'CallExpression' && !okCall(n)) bad.push('a call other than toLowerCase or replace on a config value');
    if (n.type === 'UnaryExpression' && n.operator === 'delete') bad.push('delete');
    if (n.type === 'Identifier' && !(up && ((up.type === 'MemberExpression' && up.property === n && !up.computed) || (up.type === 'Property' && up.key === n && !up.computed)))) {
      const flag = FLAGGED.has(current) && up && up.type === 'MemberExpression' && up.object === n && !up.computed && FLAGS.has(up.property.name);
      const tof = FLAGGED.has(current) && up && up.type === 'UnaryExpression' && up.operator === 'typeof';
      if (n.name === 'window' ? !(flag || tof) : !own.has(n.name)) bad.push(`the name ${n.name}`);
    }
    if (n.type === 'MemberExpression' && n.computed) bad.push('a computed property');
    for (const k in n) { if (k === 'type') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(x => walk(x, n)); else if (v && typeof v.type === 'string') walk(v, n); }
  };
  // esbuild writes the exports as one `export { a, b }` at the end.
  const tail = ast.body.filter(st => st.type === 'ExportNamedDeclaration' && !st.source && !st.declaration);
  for (const st of ast.body) {
    if (tail.includes(st)) continue;
    const d = st.type === 'ExportNamedDeclaration' && !st.source && !st.specifiers.length ? st.declaration : st;
    if (!d || d.type !== 'VariableDeclaration' || d.kind !== 'const') { bad.push(`a top-level ${st.type}${st.source ? ' from ' + st.source.value : ''}`); continue; }
    for (const x of d.declarations) { if (x.id.type !== 'Identifier' || !x.init) { bad.push('a const with no name or value'); continue; } current = x.id.name; walk(x.init, null); own.add(x.id.name); }
  }
  for (const st of tail) for (const sp of st.specifiers) if (sp.local.name !== sp.exported.name || !own.has(sp.local.name)) bad.push(`export ${sp.local.name} as ${sp.exported.name}`);
  return bad;
}
const NEW_MODULES = {
  config: { why: 'r49: the app\'s name, version, address and storage id, written new; held by tests/hygiene.js and tests/r49.js', rules: configRules },
  types: { why: 'types only: nothing of it exists at run time', rules: () => { const { js } = compiled('types'); return js.trim() === '' || js.trim() === 'export {};' ? [] : [js.trim().slice(0, 200)]; } },
};
{
  const loose = FILES.ids.filter(m => !listed.includes(m) && !NEW_MODULES[m]);
  ok(loose.length === 0, 'every module in src/app/ is in a move or listed as written new, with the tests that hold it', loose);
  for (const [mod, spec] of Object.entries(NEW_MODULES)) { let bad; try { bad = spec.rules(); } catch (e) { bad = [String(e)]; } ok(bad.length === 0, `src/app/${mod}.ts holds only what a module written new may (${spec.why.split(':')[0]})`, bad); }
}
// Moved code lives only in the modules a move lists, where it is compared.
{
  const legacyNames = new Set(MOVES.flatMap(mv => [...legacyOf(mv.baseline).decls.keys()]));
  const stray = [];
  for (const mod of FILES.ids) {
    if (listed.includes(mod)) continue;
    for (const name of moduleOf(mod).exported.keys()) if (legacyNames.has(name)) stray.push(`src/app/${mod}.ts: ${name}`);
  }
  ok(stray.length === 0, 'no module outside a move exports a name that was a legacy declaration in a move\'s baseline', stray);
}

console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
