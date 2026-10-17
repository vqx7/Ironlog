// Code moved out of the legacy script into src/app/ is the same code
// (ARCHITECTURE.md, the phases). For every declaration a phase moved, this
// compares the module's version with the same declaration in the published
// build the phase started from, after both go through esbuild's printer:
// TypeScript types, formatting and comments do not count, every expression,
// operator, literal and statement does. So a move can type the code and lay it
// out to be read, and this suite still proves the logic did not change by a
// single token.
//
// A declaration changed on purpose after its move is listed in `changed` with
// the release and the reason, and is then held by the suites for its
// behaviour instead.
const fs = require('fs'); const path = require('path');
const acorn = require('acorn'); const esbuild = require('esbuild');
const ROOT = path.join(__dirname, '..');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', m); };

const MOVES = [
  // Phase 2 (r50): the bottom layers, from r49's legacy script.
  { release: 'r50', baseline: 'baselines/r49.html', modules: ['util', 'units', 'library', 'routines', 'formulas'], changed: {} },
];

// One declaration as a normalized statement: a function as written, a
// variable as `const name = init;`, both printed by esbuild with its local
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
    if (s.type === 'FunctionDeclaration') out.set(s.id.name, norm(code.slice(s.start, s.end)));
    else if (s.type === 'VariableDeclaration') for (const d of s.declarations) if (d.id.type === 'Identifier') out.set(d.id.name, norm(`const ${d.id.name} = ${d.init ? code.slice(d.init.start, d.init.end) : 'undefined'};`));
  }
  return out;
}
// The legacy script's top-level declarations in a built page: the body of the
// function that starts with "use strict" inside the bundle (r49 on), or the
// page's whole app script (before r49).
function legacyOf(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const app = scripts.reduce((a, b) => (b.length > a.length ? b : a), '');
  const ast = acorn.parse(app, { ecmaVersion: 'latest' });
  let body = null;
  (function find(n) {
    if (body || !n || typeof n.type !== 'string') return;
    if (/Function/.test(n.type) && n.body && n.body.type === 'BlockStatement' && n.body.body[0] && n.body.body[0].directive === 'use strict') { body = n.body.body; return; }
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(find); else if (v && typeof v.type === 'string') find(v); }
  })(ast);
  return decls(app, body || []);
}
function moduleOf(name) {
  const ts = fs.readFileSync(path.join(ROOT, 'src', 'app', name + '.ts'), 'utf8');
  const js = esbuild.transformSync(ts, { loader: 'ts', format: 'esm' }).code;
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  // esbuild prints `export function f` as `function f` plus `export { f }`, so
  // the exported names come from either form, and the code from the declaration.
  const names = new Set();
  for (const s of ast.body) if (s.type === 'ExportNamedDeclaration') {
    for (const sp of s.specifiers || []) names.add(sp.exported.name);
    if (s.declaration) for (const n of decls(js, [s]).keys()) names.add(n);
  }
  const all = decls(js, ast.body);
  return new Map([...names].map(n => [n, all.get(n)]));
}

for (const mv of MOVES) {
  const base = legacyOf(mv.baseline);
  ok(base.size > 500, `${mv.release}: the legacy declarations of ${mv.baseline} are read (${base.size})`);
  let n = 0;
  for (const mod of mv.modules) {
    const file = path.join(ROOT, 'src', 'app', mod + '.ts');
    if (!fs.existsSync(file)) { ok(false, `${mv.release}: src/app/${mod}.ts exists`); continue; }
    const exported = moduleOf(mod);
    const missing = [], differ = [];
    for (const [name, code] of exported) {
      if (mv.changed[name]) continue;
      const was = base.get(name);
      if (was == null) missing.push(name);
      else if (was !== code) differ.push({ name, was: was.slice(0, 300), now: code.slice(0, 300) });
      else n++;
    }
    ok(missing.length === 0, `${mv.release}: every export of src/app/${mod}.ts was a declaration in ${mv.baseline} (nothing new slipped into a move)`, missing);
    ok(differ.length === 0, `${mv.release}: every export of src/app/${mod}.ts is the same code as in ${mv.baseline}, types and layout aside`, differ.slice(0, 3));
  }
  ok(n > 0, `${mv.release}: ${n} moved declarations compared token for token`);
}

console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
