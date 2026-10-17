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
// A declaration changed on purpose after its move is listed in `changed` with
// the release and the reason, and is then held by the suites for its
// behaviour instead.
const fs = require('fs'); const path = require('path');
const acorn = require('acorn'); const esbuild = require('esbuild');
const { freeNames } = require('../scripts/depmap');
const ROOT = path.join(__dirname, '..'); const APP = path.join(ROOT, 'src', 'app');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', m); };

const MOVES = [
  // Phase 2 (r50): the bottom layers, from r49's legacy script.
  { release: 'r50', baseline: 'baselines/r49.html', modules: ['util', 'units', 'library', 'routines', 'formulas'], changed: {} },
];

// One declaration as a normalized statement: a function as written, a
// variable as `<kind> name = init;`, both printed by esbuild with its local
// names (parameters and variables inside the declaration) renamed by the
// minifier, which names them by structure alone. The bundle renames a local
// that shadows a top-level name (r49 printed e1's `load` as `load2`, since
// the script has a function `load`), and that is not a change in logic.
// Every name that reaches outside the declaration keeps its own name, so a
// call to a different function still fails here.
const norm = text => esbuild.transformSync(text, { loader: 'js', legalComments: 'none', minifyIdentifiers: true }).code.trim();
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
// The legacy script's top-level declarations in a built page: the body of the
// function that starts with "use strict" inside the bundle (r49 on), or the
// page's whole app script (before r49). `outer` is what the bundle declared
// outside the legacy wrapper: the modules' code (config's names, in r49).
function legacyOf(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const app = scripts.reduce((a, b) => (b.length > a.length ? b : a), '');
  const ast = acorn.parse(app, { ecmaVersion: 'latest' });
  let body = null, outer = [];
  (function find(n, up) {
    if (body || !n || typeof n.type !== 'string') return;
    if (/Function/.test(n.type) && n.body && n.body.type === 'BlockStatement') {
      if (n.body.body[0] && n.body.body[0].directive === 'use strict') { body = n.body.body; outer = up; return; }
      up = [...up, ...n.body.body];
    }
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(x => find(x, up)); else if (v && typeof v.type === 'string') find(v, up); }
  })(ast, ast.body);
  return { decls: decls(app, body || []), outer: declared(outer) };
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

for (const mv of MOVES) {
  const base = legacyOf(mv.baseline);
  ok(base.decls.size > 500, `${mv.release}: the legacy declarations of ${mv.baseline} are read (${base.decls.size})`);
  const mods = new Map();
  for (const mod of mv.modules) {
    if (!fs.existsSync(path.join(APP, mod + '.ts'))) { ok(false, `${mv.release}: src/app/${mod}.ts exists`); continue; }
    mods.set(mod, moduleOf(mod));
  }
  let n = 0;
  for (const [mod, m] of mods) {
    ok(m.odd.length === 0, `${mv.release}: src/app/${mod}.ts holds only imports under their own names and exported declarations`, m.odd);
    const missing = [], differ = [], astray = [];
    for (const [name, d] of m.exported) {
      if (mv.changed[name]) continue;
      const was = base.decls.get(name);
      if (was == null || d == null) { missing.push(name); continue; }
      if (was.code !== d.code) { differ.push({ name, was: was.code.slice(0, 300), now: d.code.slice(0, 300) }); continue; }
      n++;
      // Each name the declaration uses resolves as it did in the baseline.
      for (const u of freeNames(d.node)) {
        if (u === name) continue;
        const imp = m.imports.get(u);
        let good;
        if (base.decls.has(u)) good = imp ? (imp.rel.startsWith('./') && mods.has(imp.from) && mods.get(imp.from).exported.has(u)) : m.exported.has(u);
        else if (base.outer.has(u)) good = !!imp && imp.rel.startsWith('./') && !mods.has(imp.from) && fs.existsSync(path.join(APP, imp.from + '.ts'));
        else good = !imp && !m.exported.has(u);
        if (!good) astray.push(`${name} uses ${u}: ${base.decls.has(u) ? 'a legacy declaration in the baseline' : base.outer.has(u) ? 'a config import in the baseline' : 'a global in the baseline'}, ${imp ? `imported here from ${imp.rel}` : m.exported.has(u) ? 'declared here' : 'unbound here'}`);
      }
    }
    ok(missing.length === 0, `${mv.release}: every export of src/app/${mod}.ts was a declaration in ${mv.baseline} (nothing new slipped into a move)`, missing);
    ok(differ.length === 0, `${mv.release}: every export of src/app/${mod}.ts is the same code as in ${mv.baseline}, types and layout aside`, differ.slice(0, 3));
    ok(astray.length === 0, `${mv.release}: every name the moved code in src/app/${mod}.ts uses points where it pointed in ${mv.baseline}`, astray.slice(0, 5));
  }
  ok(n > 0, `${mv.release}: ${n} moved declarations compared token for token`);
}
// Moved code lives only in the modules a move lists, where it is compared.
{
  const listed = new Set(MOVES.flatMap(mv => mv.modules));
  const legacyNames = new Set(MOVES.flatMap(mv => [...legacyOf(mv.baseline).decls.keys()]));
  const stray = [];
  for (const f of fs.readdirSync(APP).filter(f => f.endsWith('.ts'))) {
    const mod = f.slice(0, -3); if (listed.has(mod)) continue;
    for (const name of moduleOf(mod).exported.keys()) if (legacyNames.has(name)) stray.push(`src/app/${f}: ${name}`);
  }
  ok(stray.length === 0, 'no module outside a move exports a name that was a legacy declaration in a move\'s baseline', stray);
}

console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
