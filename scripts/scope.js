// The scope-aware reading of a declaration (r49, from scripts/depmap.js, the
// legacy script's dependency map, deleted with that script in r63): which
// names a piece of code reads that it does not bind itself (a local that
// shadows a name is not counted), and which it writes. tests/hygiene.js reads
// the typed modules with it: what a function of the model reaches, and what a
// screen writes outside act.
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
// Scope-aware walk: the names a piece of code reads that it does not bind itself.
function hoisted(stmts, out) { // var and function declarations hoisted to a function scope
  for (const s of stmts || []) {
    if (!s) continue;
    if (s.type === 'FunctionDeclaration') out.push(s.id.name);
    else if (s.type === 'VariableDeclaration') for (const d of s.declarations) patNames(d.id, out);
    else if (s.type === 'ClassDeclaration') out.push(s.id.name);
  }
  return out;
}
// refs: every free name read; writes: every free name assigned, or whose
// object is written through (ui.x = 1, state.sessions.push(...)).
function scan(node) {
  const refs = new Set(), writes = new Set();
  function walk(n, scope) {
    if (!n || typeof n.type !== 'string') return;
    switch (n.type) {
      case 'Identifier': if (!scope.has(n.name)) refs.add(n.name); return;
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
        if (t && t.type === 'Identifier' && !scope.has(t.name)) writes.add(t.name);
        // A property written through an outer object (ui.x = 1, state.sessions[i].w = 2) mutates that object.
        while (t && t.type === 'MemberExpression') t = t.object;
        if (t && t.type === 'Identifier' && !scope.has(t.name) && t !== (n.left || n.argument)) writes.add(t.name);
        break; }
      case 'CallExpression': {
        // Mutating array and map methods called on an outer object (state.sessions.push(...), CACHE.set(...)).
        let c = n.callee;
        if (c.type === 'MemberExpression' && !c.computed && /^(push|pop|shift|unshift|splice|sort|reverse|fill|set|delete|clear|add)$/.test(c.property.name)) {
          let t = c.object; while (t && t.type === 'MemberExpression') t = t.object;
          if (t && t.type === 'Identifier' && !scope.has(t.name)) writes.add(t.name);
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
  return { refs, writes };
}
const freeNames = node => scan(node).refs;
// The names a piece of code assigns or writes through, that it does not bind itself.
const scanWrites = node => scan(node).writes;

module.exports = { freeNames, scanWrites };
