// Draft of the hygiene check for the numbers rule (PENDING 350): in src/app, a numeric literal is 0, 1 or 2, a
// literal type, or part of a module's named constant (an UPPER_CASE const declared at the top of the module: its
// value, or a table it holds, built by a function called in its initialiser included). Prints the offenders.
const root = process.argv[2] || process.cwd();
const ts = require(root + '/node_modules/typescript'), fs = require('fs'), path = require('path');
const dir = path.join(root, 'src/app');
const SMALL = new Set(['0', '1', '2']);
const NAMED = /^[A-Z][A-Z0-9_]*$/;
const out = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.ts')).sort()) {
  const file = path.join(dir, f), text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  // The named constant a node is part of: a top-level UPPER_CASE const, reached through its initialiser, a function
  // called there (an IIFE building a table) included, but not a function merely stored in it.
  const topNamed = d => ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && NAMED.test(d.name.text) && ts.isVariableDeclarationList(d.parent) && (d.parent.flags & ts.NodeFlags.Const) !== 0 && ts.isVariableStatement(d.parent.parent) && ts.isSourceFile(d.parent.parent.parent);
  const called = fn => { let p = fn.parent; while (p && ts.isParenthesizedExpression(p)) p = p.parent; return !!p && ts.isCallExpression(p) && (p.expression === fn || ts.isParenthesizedExpression(p.expression)); };
  const inNamed = node => {
    for (let p = node.parent; p; p = p.parent) {
      if (topNamed(p)) return true;
      if (ts.isFunctionLike(p) && !called(p)) return false;
      if (ts.isSourceFile(p)) return false;
    }
    return false;
  };
  const typePos = node => ts.isLiteralTypeNode(node.parent) || (ts.isPrefixUnaryExpression(node.parent) && ts.isLiteralTypeNode(node.parent.parent));
  const visit = node => {
    if (ts.isNumericLiteral(node) && !SMALL.has(node.text) && !typePos(node) && !inNamed(node)) {
      const ln = sf.getLineAndCharacterOfPosition(node.getStart()).line;
      out.push(`${f}:${ln + 1} ${node.text}: ${text.split('\n')[ln].trim().slice(0, 120)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
console.log(out.length ? out.join('\n') : 'none');
console.log('total', out.length);
