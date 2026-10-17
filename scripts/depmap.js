// The dependency map of the legacy script (r49, ARCHITECTURE.md): every
// top-level declaration in src/10-*.js to src/29-*.js, which top-level names
// it uses (scope-aware: a local that shadows one is not counted), which names
// are shared mutable state, and which declarations are pure (no browser, no
// shared state, transitively), the ones that can move to a module as they are.
// Since r50 it also reads src/09-imports.js: which imported names the legacy
// script uses, and which names it uses that nothing declares or imports (the
// browser's globals, and nothing else: tests/hygiene.js checks that none of
// them is a module's export, which would fail only when the line runs).
//   node scripts/depmap.js            summary
//   node scripts/depmap.js --json f   the full map written to f
// tests/hygiene.js reads `count()` for the ratchet in ARCHITECTURE.md.
const fs = require('fs'), path = require('path');
const acorn = require('acorn');
function map(SRC) {
const files = fs.readdirSync(SRC).filter(f => /^[12]\d-.+\.js$/.test(f)).sort();
let code = '', spans = [];
for (const f of files) { const t = fs.readFileSync(path.join(SRC, f), 'utf8'); spans.push([code.length, code.length + t.length, f]); code += t; }
const fileAt = p => (spans.find(s => p >= s[0] && p < s[1]) || [, , '?'])[2];
const ast = acorn.parse(code, { ecmaVersion: 2023, sourceType: 'script', allowAwaitOutsideFunction: true });
// The script is one IIFE: (function(){ ... })();
const body = ast.body[0].expression.callee.body.body;

// Collect names bound by a pattern.
function patNames(p, out) {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.push(p.name); break;
    case 'ObjectPattern': for (const q of p.properties) patNames(q.type === 'RestElement' ? q.argument : q.value, out); break;
    case 'ArrayPattern': for (const q of p.elements) patNames(q, out); break;
    case 'RestElement': patNames(p.argument, out); break;
    case 'AssignmentPattern': patNames(p.left, out); break;
  }
  return out;
}
// Top-level declarations.
const decls = []; // {name, kind, node, file, start, end}
const topStmts = [];
for (const st of body) {
  if (st.type === 'FunctionDeclaration') decls.push({ name: st.id.name, kind: 'function', node: st, file: fileAt(st.start), lines: code.slice(st.start, st.end).split('\n').length });
  else if (st.type === 'ClassDeclaration') decls.push({ name: st.id.name, kind: 'class', node: st, file: fileAt(st.start), lines: code.slice(st.start, st.end).split('\n').length });
  else if (st.type === 'VariableDeclaration') for (const d of st.declarations) for (const n of patNames(d.id, [])) decls.push({ name: n, kind: st.kind, node: d, file: fileAt(st.start), lines: code.slice(d.start, d.end).split('\n').length });
  else topStmts.push({ node: st, file: fileAt(st.start) });
}
const TOP = new Set(decls.map(d => d.name));
// The names src/09-imports.js brings in from src/app/, which the legacy parts read as their own.
const IMP_FILE = path.join(SRC, '09-imports.js');
const imports = fs.existsSync(IMP_FILE) ? acorn.parse(fs.readFileSync(IMP_FILE, 'utf8'), { ecmaVersion: 2023, sourceType: 'module' }).body
  .filter(s => s.type === 'ImportDeclaration').flatMap(s => s.specifiers.map(x => ({ name: x.local.name, from: s.source.value }))) : [];
const IMPORTED = new Set(imports.map(x => x.name));

// Scope-aware walk: identifiers that resolve to a top-level name.
function hoisted(stmts, out) { // var and function declarations hoisted to a function scope
  for (const s of stmts || []) {
    if (!s) continue;
    if (s.type === 'FunctionDeclaration') out.push(s.id.name);
    else if (s.type === 'VariableDeclaration') for (const d of s.declarations) patNames(d.id, out);
    else if (s.type === 'ClassDeclaration') out.push(s.id.name);
  }
  return out;
}
function refs(node) {
  const used = new Set(), writes = new Set(), usedImp = new Set(), free = new Set();
  function walk(n, scope) {
    if (!n || typeof n.type !== 'string') return;
    switch (n.type) {
      case 'Identifier': if (scope.has(n.name)) return; if (TOP.has(n.name)) used.add(n.name); else if (IMPORTED.has(n.name)) usedImp.add(n.name); else free.add(n.name); return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        const s = new Set(scope);
        if (n.id && n.type !== 'FunctionDeclaration') s.add(n.id.name);
        for (const p of n.params) patNames(p, []).forEach(x => s.add(x));
        for (const p of n.params) walkPat(p, s);
        if (n.body.type === 'BlockStatement') { hoisted(n.body.body, []).forEach(x => s.add(x)); for (const b of n.body.body) walk(b, s); }
        else walk(n.body, s);
        return; }
      case 'BlockStatement': case 'Program': case 'StaticBlock': {
        const s = new Set(scope); hoisted(n.body, []).forEach(x => s.add(x)); for (const b of n.body) walk(b, s); return; }
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const s = new Set(scope); const init = n.init || n.left;
        if (init && init.type === 'VariableDeclaration') for (const d of init.declarations) patNames(d.id, []).forEach(x => s.add(x));
        for (const k of ['init', 'left', 'test', 'update', 'right', 'body']) walk(n[k], s); return; }
      case 'CatchClause': { const s = new Set(scope); if (n.param) patNames(n.param, []).forEach(x => s.add(x)); walk(n.body, s); return; }
      case 'VariableDeclarator': walkPat(n.id, scope); walk(n.init, scope); return;
      case 'ClassDeclaration': case 'ClassExpression': walk(n.superClass, scope); walk(n.body, scope); return;
      case 'MemberExpression': walk(n.object, scope); if (n.computed) walk(n.property, scope); return;
      case 'Property': case 'PropertyDefinition': case 'MethodDefinition': if (n.computed) walk(n.key, scope); walk(n.value, scope); return;
      case 'LabeledStatement': walk(n.body, scope); return;
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'AssignmentExpression': case 'UpdateExpression': case 'UnaryExpression': {
        if (n.type === 'UnaryExpression' && n.operator !== 'delete') break;
        let t = n.left || n.argument;
        if (t && t.type === 'Identifier' && TOP.has(t.name) && !scope.has(t.name)) writes.add(t.name);
        // A property written through a top-level object (ui.x = 1, state.sessions[i].w = 2) mutates that object.
        while (t && t.type === 'MemberExpression') t = t.object;
        if (t && t.type === 'Identifier' && TOP.has(t.name) && !scope.has(t.name) && t !== (n.left || n.argument)) writes.add(t.name);
        break; }
      case 'CallExpression': {
        // Mutating array and map methods called on a top-level object (state.sessions.push(...), CACHE.set(...)).
        let c = n.callee;
        if (c.type === 'MemberExpression' && !c.computed && /^(push|pop|shift|unshift|splice|sort|reverse|fill|set|delete|clear|add)$/.test(c.property.name)) {
          let t = c.object; while (t && t.type === 'MemberExpression') t = t.object;
          if (t && t.type === 'Identifier' && TOP.has(t.name) && !scope.has(t.name)) writes.add(t.name);
        }
        break; }
    }
    for (const k in n) { if (k === 'type' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(x => walk(x, scope)); else if (v && typeof v.type === 'string') walk(v, scope); }
  }
  function walkPat(p, scope) { // defaults and computed keys inside patterns
    if (!p) return;
    if (p.type === 'AssignmentPattern') { walkPat(p.left, scope); walk(p.right, scope); }
    else if (p.type === 'ObjectPattern') for (const q of p.properties) { if (q.computed) walk(q.key, scope); walkPat(q.type === 'RestElement' ? q.argument : q.value, scope); }
    else if (p.type === 'ArrayPattern') p.elements.forEach(q => walkPat(q, scope));
  }
  walk(node, new Set());
  return { used, writes, usedImp, free };
}
for (const d of decls) { const r = refs(d.node); r.used.delete(d.name); d.uses = r.used; d.writes = r.writes; d.usedImp = r.usedImp; d.free = r.free; }
const topRefs = topStmts.map(t => ({ ...t, ...refs(t.node) }));
const impUsed = new Set([...decls, ...topRefs].flatMap(d => [...d.usedImp]));
const freeNames = new Set([...decls, ...topRefs].flatMap(d => [...d.free]));

// Mutable shared state: top-level let names written anywhere other than their declaration.
const written = new Map();
for (const d of decls) for (const w of d.writes) written.set(w, (written.get(w) || new Set()).add(d.file));
for (const t of topRefs) for (const w of t.writes) written.set(w, (written.get(w) || new Set()).add(t.file));

// Browser-touching: a declaration that names document/window/navigator/localStorage etc. directly in its code.
const BROWSER = /\b(document|window|navigator|localStorage|sessionStorage|indexedDB|location|history|requestAnimationFrame|setTimeout|setInterval|fetch|matchMedia|getComputedStyle|Chart|Sortable|alert|confirm)\b/;
const byName = new Map(decls.map(d => [d.name, d]));
for (const d of decls) d.browser = BROWSER.test(code.slice(d.node.start, d.node.end));
// A declaration is pure if neither it nor anything it uses touches the browser or a written top-level let.
const MUT = new Set([...written.keys()]);
const memo = new Map();
function impure(n, stack = new Set()) {
  if (memo.has(n)) return memo.get(n);
  if (stack.has(n)) return false; stack.add(n);
  const d = byName.get(n); let r = d.browser || MUT.has(n) || [...d.uses].some(u => MUT.has(u));
  if (!r) for (const u of d.uses) if (impure(u, stack)) { r = true; break; }
  memo.set(n, r); return r;
}
for (const d of decls) d.pure = !impure(d.name);

// File to file edges.
const edges = {};
for (const d of decls) for (const u of d.uses) { const to = byName.get(u).file; if (to !== d.file) { const k = d.file + ' -> ' + to; edges[k] = (edges[k] || 0) + 1; } }

const out = { imports: imports.map(x => ({ ...x, used: impUsed.has(x.name) })), free: [...freeNames].sort(), files: {}, mutable: {}, edges, decls: decls.map(d => ({ name: d.name, kind: d.kind, file: d.file, lines: d.lines, pure: d.pure, browser: d.browser, uses: [...d.uses] })) };
for (const f of files) {
  const ds = decls.filter(d => d.file === f);
  out.files[f] = { decls: ds.length, functions: ds.filter(d => d.kind === 'function').length, pure: ds.filter(d => d.pure).length, lines: fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').length - 1 };
}
for (const [n, fs2] of written) out.mutable[n] = { declaredIn: byName.get(n).file, kind: byName.get(n).kind, writtenIn: [...fs2] };
  return out;
}

module.exports = { map, count: () => map(path.join(__dirname, '..', 'src')).decls.length };
if (require.main === module) {
  const m = map(path.join(__dirname, '..', 'src'));
  const j = process.argv.indexOf('--json');
  if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify(m, null, 1));
  const pure = m.decls.filter(d => d.pure).length;
  console.log(`legacy top-level declarations: ${m.decls.length}`);
  console.log(`  pure (movable as they are): ${pure}`);
  console.log(`  shared mutable names: ${Object.keys(m.mutable).length}`);
  console.log(`  legacy lines: ${Object.values(m.files).reduce((a, f) => a + f.lines, 0)}`);
}
