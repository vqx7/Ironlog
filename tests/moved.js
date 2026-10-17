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
const { freeNames } = require('../scripts/depmap');
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
    legacy: { calls: { setState: 'state' }, statements: { 'state = load();': 'let state = load();' } } },
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
function decls(code, statements) {
  const out = new Map();
  for (const st of statements) {
    const s = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
    if (!s) continue;
    if (s.type === 'FunctionDeclaration') out.set(s.id.name, { code: norm(code.slice(s.start, s.end)), node: s });
    else if (s.type === 'VariableDeclaration') for (const d of s.declarations) if (d.id.type === 'Identifier') out.set(d.id.name, { code: norm(`${s.kind} ${d.id.name} = ${d.init ? code.slice(d.init.start, d.init.end) : 'undefined'};`), node: d });
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
  return { app, body: wrap.body.body, outer: [...ast.body, ...outer] };
}
// The legacy script's top-level declarations, and the names declared outside it.
function legacyOf(file) {
  const { app, body, outer } = legacyIn(file);
  return { decls: decls(app, body), outer: declared(outer) };
}
// A module as esbuild leaves it for the browser: what it imports (local name
// to source and imported name), its top-level statements, and its exports.
function moduleOf(name) {
  const ts = fs.readFileSync(path.join(APP, name + '.ts'), 'utf8');
  const js = esbuild.transformSync(ts, { loader: 'ts', format: 'esm' }).code;
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  const imports = new Map(), odd = [], exported = new Set();
  const top = declared(ast.body);
  for (const s of ast.body) {
    if (s.type === 'ImportDeclaration') {
      // An import with no names (`import './x'`) runs a module for its effects: nothing a move may bring (the r51 review).
      if (!s.specifiers.length) odd.push(`import '${s.source.value}' (run for its effects)`);
      for (const sp of s.specifiers) {
        if (sp.type !== 'ImportSpecifier' || sp.imported.name !== sp.local.name) odd.push(`import ${js.slice(sp.start, sp.end)} from ${s.source.value}`);
        imports.set(sp.local.name, { from: path.basename(s.source.value), name: sp.imported ? sp.imported.name : null, rel: s.source.value });
      }
      continue;
    }
    if (s.type === 'ExportNamedDeclaration' && !s.source) {
      // esbuild prints `export function f` as `function f` plus `export { f }`,
      // so the exported names come from either form.
      for (const sp of s.specifiers || []) { if (sp.exported.name !== sp.local.name || !top.has(sp.local.name)) odd.push(`export ${js.slice(sp.start, sp.end)}`); exported.add(sp.exported.name); }
      if (s.declaration) for (const n of declared([s])) exported.add(n);
      continue;
    }
    if (s.type === 'FunctionDeclaration' || s.type === 'VariableDeclaration') continue; // checked below: every one must be exported
    odd.push(js.slice(s.start, Math.min(s.end, s.start + 80)));
  }
  for (const n of top) if (!exported.has(n)) odd.push(`a private top-level name: ${n}`);
  const all = decls(js, ast.body);
  return { imports, odd, exported: new Map([...exported].map(n => [n, all.get(n)])) };
}

// A module can take declarations from more than one move (r51 added to four
// of r50's), so each export is compared with the baseline of the move that
// moved it: the latest move listing its module whose baseline still had it
// as a legacy declaration.
const bases = new Map(MOVES.map(mv => [mv.release, legacyOf(mv.baseline)]));
const listed = [...new Set(MOVES.flatMap(mv => mv.modules))];
const mods = new Map();
for (const mod of listed) {
  if (!fs.existsSync(path.join(APP, mod + '.ts'))) { ok(false, `src/app/${mod}.ts exists`); continue; }
  mods.set(mod, moduleOf(mod));
}
// The names a module exports from its own declarations (re-exports never count).
const ownCache = new Map();
const ownExports = mod => { if (!ownCache.has(mod)) ownCache.set(mod, mods.get(mod) ? new Set(mods.get(mod).exported.keys()) : fs.existsSync(path.join(APP, mod + '.ts')) ? new Set(moduleOf(mod).exported.keys()) : new Set()); return ownCache.get(mod); };
const homeOf = (mod, name) => { for (const mv of [...MOVES].reverse()) if (mv.modules.includes(mod) && bases.get(mv.release).decls.has(name)) return mv; return null; };
const counted = Object.fromEntries(MOVES.map(mv => [mv.release, 0]));
for (const mv of MOVES) ok(bases.get(mv.release).decls.size > 500, `${mv.release}: the legacy declarations of ${mv.baseline} are read (${bases.get(mv.release).decls.size})`);
for (const [mod, m] of mods) {
  ok(m.odd.length === 0, `src/app/${mod}.ts holds only imports under their own names and exported declarations`, m.odd);
  const missing = [], differ = [], astray = [];
  for (const [name, d] of m.exported) {
    const mv = homeOf(mod, name);
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
    const was = base && base.decls.get(name);
    if (!was || d == null) { missing.push(name); continue; }
    if (was.code !== d.code) { differ.push({ name, release: mv.release, was: was.code.slice(0, 300), now: d.code.slice(0, 300) }); continue; }
    counted[mv.release]++;
    // Each name the declaration uses resolves as it did in that baseline.
    for (const u of freeNames(d.node)) {
      if (u === name) continue;
      const imp = m.imports.get(u);
      const fromApp = imp && imp.rel.startsWith('./') && fs.existsSync(path.join(APP, imp.from + '.ts'));
      let good;
      if (base.decls.has(u)) good = imp ? (fromApp && mods.has(imp.from) && mods.get(imp.from).exported.has(u) && !!homeOf(imp.from, u)) : m.exported.has(u);
      // A module's name must come from the module that declares it, under the
      // same name: a re-export elsewhere could hand over another value with
      // the same name (the r51 review: APP_NAME from types meant PREVIEW_NAME).
      else if (base.outer.has(u)) good = imp ? !!fromApp && ownExports(imp.from).has(u) : m.exported.has(u);
      else good = !imp && !m.exported.has(u);
      if (!good) astray.push(`${name} uses ${u}: ${base.decls.has(u) ? 'a legacy declaration' : base.outer.has(u) ? 'a module export' : 'a global'} in ${mv.baseline}, ${imp ? `imported here from ${imp.rel}` : m.exported.has(u) ? 'declared here' : 'unbound here'}`);
    }
  }
  ok(missing.length === 0, `every export of src/app/${mod}.ts was a declaration in the baseline of the move that moved it (nothing new slipped into a move)`, missing);
  ok(differ.length === 0, `every export of src/app/${mod}.ts is the same code as in that baseline, types and layout aside`, differ.slice(0, 3));
  ok(astray.length === 0, `every name the moved code in src/app/${mod}.ts uses points where it pointed in that baseline`, astray.slice(0, 5));
}
for (const mv of MOVES) ok(counted[mv.release] > 0, `${mv.release}: ${counted[mv.release]} moved declarations compared token for token`);
// Code a move adds or changes on purpose has no baseline to be compared
// with, so each entry carries a check that runs against the module itself,
// bundled on its own and loaded fresh: a declaration with no check fails.
{
  const os = require('os');
  const load = mod => {
    const out = esbuild.buildSync({ entryPoints: [path.join(APP, mod + '.ts')], bundle: true, format: 'cjs', platform: 'neutral', write: false, logLevel: 'silent' }).outputFiles[0].text;
    const file = path.join(os.tmpdir(), `ironlog-moved-${mod}-${process.pid}.js`); fs.writeFileSync(file, out);
    try { delete require.cache[file]; return require(file); } finally { fs.unlinkSync(file); }
  };
  for (const mv of MOVES) for (const kind of ['changed', 'added']) for (const [name, spec] of Object.entries(mv[kind] || {})) {
    const mod = mv.modules.find(x => mods.has(x) && mods.get(x).exported.has(name));
    let good = false, why = 'no check';
    if (mod && spec && typeof spec.check === 'function') { try { good = spec.check(load(mod)) === true; why = good ? '' : 'the check failed'; } catch (e) { why = String(e); } }
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
const declNames = st => st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' ? [st.id.name] : st.type === 'VariableDeclaration' ? st.declarations.filter(d => d.id.type === 'Identifier').map(d => d.id.name) : [];
{
  const mv = MOVES[MOVES.length - 1];
  const rw = mv.legacy || { calls: {}, statements: {} };
  const movedNames = new Set();
  for (const [mod, m] of mods) for (const name of m.exported.keys()) { const h = homeOf(mod, name); if (h === mv && !mv.changed[name]) movedNames.add(name); }
  const was = legacyStatements(mv.baseline);
  const before = was.body.filter(st => { const n = declNames(st); return !(n.length && n.every(x => movedNames.has(x))); }).map(st => norm(was.app.slice(st.start, st.end)));
  const now = legacyStatements('index.html');
  // Read each listed call back as the assignment it replaced, then the statement as the one it replaced.
  const readBack = (code, st) => {
    let text = code.slice(st.start, st.end); const edits = [];
    (function walk(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && rw.calls[n.callee.name] && n.arguments.length === 1) edits.push([n.start - st.start, n.end - st.start, `(${rw.calls[n.callee.name]} = (${code.slice(n.arguments[0].start, n.arguments[0].end)}))`]);
      for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
    })(st);
    for (const [a, b, r] of edits.sort((x, y) => y[0] - x[0])) text = text.slice(0, a) + r + text.slice(b);
    const t = norm(text); const alias = Object.entries(rw.statements).find(([k]) => norm(k) === t); return alias ? norm(alias[1]) : t;
  };
  const after = now.body.map(st => readBack(now.app, st));
  let i = 0; while (i < before.length && i < after.length && before[i] === after[i]) i++;
  ok(before.length === after.length && i === before.length, `${mv.release}: every statement left in the legacy script is ${mv.baseline}'s, in order, once the listed rewrites are read back (${after.length} statements)`, i < Math.max(before.length, after.length) ? { at: i, was: (before[i] || '').slice(0, 200), now: (after[i] || '').slice(0, 200) } : { counts: [before.length, after.length] });
}

// Every module is either in a move, so this suite compares it, or written new
// on purpose and held by tests of its own (the r51 review: a module in
// neither list was compared by nothing). A module written new is also held to
// what it may contain, since nothing compares it with a baseline (the second
// r51 review put `Math.round = x => Math.floor(x)` in types.ts and in
// config.ts, and a copy of the legacy body in config.ts, and each passed).
const compiled = mod => { const js = esbuild.transformSync(fs.readFileSync(path.join(APP, mod + '.ts'), 'utf8'), { loader: 'ts', format: 'esm' }).code; return { js, ast: acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' }) }; };
// Each value config defines is a constant made from literals and config's own
// constants: no import, no function, no assignment, nothing that runs, except
// the string methods FILE_PREFIX is made with and the two page flags the build
// sets on window (IRONLOG_APP picks the installed app's own three.js).
function configRules() {
  const { ast } = compiled('config'), bad = [], own = new Set();
  const CALLS = new Set(['toLowerCase', 'replace']), FLAGS = new Set(['IRONLOG_APP', 'IRONLOG_ENV']);
  const NODES = new Set(['Literal', 'TemplateLiteral', 'TemplateElement', 'ArrayExpression', 'ObjectExpression', 'Property', 'SpreadElement', 'Identifier', 'MemberExpression', 'ConditionalExpression', 'LogicalExpression', 'BinaryExpression', 'UnaryExpression', 'CallExpression']);
  const okCall = n => n.callee.type === 'MemberExpression' && !n.callee.computed && CALLS.has(n.callee.property.name) && ((n.callee.object.type === 'Identifier' && own.has(n.callee.object.name)) || (n.callee.object.type === 'CallExpression' && okCall(n.callee.object)));
  const walk = (n, up) => {
    if (!n || typeof n.type !== 'string') return;
    if (!NODES.has(n.type)) { bad.push(n.type); return; }
    if (n.type === 'CallExpression' && !okCall(n)) bad.push('a call other than toLowerCase or replace on a config value');
    if (n.type === 'UnaryExpression' && n.operator === 'delete') bad.push('delete');
    if (n.type === 'Identifier' && !(up && ((up.type === 'MemberExpression' && up.property === n && !up.computed) || (up.type === 'Property' && up.key === n && !up.computed)))) {
      const flag = up && up.type === 'MemberExpression' && up.object === n && !up.computed && FLAGS.has(up.property.name);
      const tof = up && up.type === 'UnaryExpression' && up.operator === 'typeof';
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
    for (const x of d.declarations) { if (x.id.type !== 'Identifier' || !x.init) { bad.push('a const with no name or value'); continue; } walk(x.init, null); own.add(x.id.name); }
  }
  for (const st of tail) for (const sp of st.specifiers) if (sp.local.name !== sp.exported.name || !own.has(sp.local.name)) bad.push(`export ${sp.local.name} as ${sp.exported.name}`);
  return bad;
}
const NEW_MODULES = {
  config: { why: 'r49: the app\'s name, version, address and storage id, written new; held by tests/hygiene.js and tests/r49.js', rules: configRules },
  types: { why: 'types only: nothing of it exists at run time', rules: () => { const { js } = compiled('types'); return js.trim() === '' || js.trim() === 'export {};' ? [] : [js.trim().slice(0, 200)]; } },
};
{
  const loose = fs.readdirSync(APP).filter(f => f.endsWith('.ts')).map(f => f.slice(0, -3)).filter(m => !listed.includes(m) && !NEW_MODULES[m]);
  ok(loose.length === 0, 'every module in src/app/ is in a move or listed as written new, with the tests that hold it', loose);
  for (const [mod, spec] of Object.entries(NEW_MODULES)) { let bad; try { bad = spec.rules(); } catch (e) { bad = [String(e)]; } ok(bad.length === 0, `src/app/${mod}.ts holds only what a module written new may (${spec.why.split(':')[0]})`, bad); }
}
// Moved code lives only in the modules a move lists, where it is compared.
{
  const legacyNames = new Set(MOVES.flatMap(mv => [...legacyOf(mv.baseline).decls.keys()]));
  const stray = [];
  for (const f of fs.readdirSync(APP).filter(f => f.endsWith('.ts'))) {
    const mod = f.slice(0, -3); if (listed.includes(mod)) continue;
    for (const name of moduleOf(mod).exported.keys()) if (legacyNames.has(name)) stray.push(`src/app/${f}: ${name}`);
  }
  ok(stray.length === 0, 'no module outside a move exports a name that was a legacy declaration in a move\'s baseline', stray);
}

console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
