// Every piece of text a lifter can read, listed with the module and line it comes from, for a wording pass (CA-3 in
// PENDING.md; V, 2026-11-10). The text stays beside the screen that draws it; this reads the source and changes nothing.
//   node scripts/copy.js            the list as JSON on stdout
//   node scripts/copy.js --md FILE  the list as Markdown, grouped by module
// What it reads: the page's markup (src/03-body.html), and in src/app/ the text and the tip, label, placeholder and title
// attributes of every lit-html template, and every other string or template of two or more words (messages, toasts,
// confirm boxes, the Guide, help and tip constants). What it leaves out: class lists, data-act names, error-log areas,
// selectors, ids, addresses and code, which no lifter reads. A string built from parts lists each part with ${...} kept.
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'src', 'app');
const ATTRS = /\b(data-tip|aria-label|placeholder|title|data-h-label)\s*=\s*"([^"]*)"/g;

// Text of markup: tags and lit-html's markers out, entities read, spacing collapsed.
function textOf(markup) {
  return markup
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Words a lifter reads: at least one run of three letters, not a bare identifier, class list, selector, address or code.
function readable(s) {
  const t = s.trim();
  if (!/[A-Za-z]{3}/.test(t)) return false;
  if (/^(https?:|mailto:|\.\/|\/|#|data:|blob:)/.test(t)) return false;
  if (/^[a-z][A-Za-z0-9]*$/.test(t)) return false; // an identifier: a key, an id, a data-act name
  if (/^[a-z0-9_\-:.#\[\]= ]+$/.test(t) && !/ [a-z]+ [a-z]+ /.test(' ' + t + ' ')) return false; // class lists and selectors
  if (/^[\w-]+(\s*[:;{}][\s\w-]*)+$/.test(t)) return false; // CSS
  if (/[{};]\s*$/.test(t) && /[=(]/.test(t)) return false; // code
  return true;
}

// The call or attribute a string is handed to, to leave out what is not shown.
function context(node) {
  const p = node.parent;
  if (!p) return '';
  if (ts.isCallExpression(p)) return p.expression.getText();
  if (ts.isPropertyAssignment(p) && p.initializer === node) return 'prop:' + p.name.getText();
  if (ts.isBinaryExpression(p)) return context(p);
  if (ts.isConditionalExpression(p)) return context(p);
  return '';
}
const SKIP_CALLS =
  /^(log|console\.\w+|document\.\w+|\w+\.(querySelector|querySelectorAll|getElementById|closest|getAttribute|setAttribute|matches|classList\.\w+|startsWith|endsWith|includes|split|replace|test|match|padStart|join)|require|new RegExp|RegExp|parseJson|prefGet|prefSet|keyOf|storeKey|fetch|withTimeout|Symbol)$/;
const SKIP_PROPS = /^prop:(id|key|kind|act|cls|class|className|sk|k|type|mode|code|area|tab|sec|unit|icon|name)$/;

function fromSource(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const out = [];
  const at = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const fnOf = n => {
    for (let p = n.parent; p; p = p.parent) {
      if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) return p.name.getText();
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && !p.parent.parent.parent.parent) return p.name.text;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && ts.isSourceFile(p.parent.parent.parent))
        return p.name.text;
    }
    return '';
  };
  const add = (n, kind, s) => {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t && readable(t)) out.push({ file: path.relative(ROOT, file), line: at(n), in: fnOf(n), kind, text: t });
  };
  const visit = n => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    // lit-html templates: the markup between the values, read for its text and its readable attributes.
    if (ts.isTaggedTemplateExpression(n) && n.tag.getText() === 'html') {
      const t = n.template;
      const parts = ts.isNoSubstitutionTemplateLiteral(t)
        ? [t.text]
        : [t.head.text, ...t.templateSpans.map(s => s.literal.text)];
      const joined = parts.join('${…}');
      for (const m of joined.matchAll(ATTRS))
        if (m[2]) add(n, m[1] === 'placeholder' ? 'placeholder' : m[1] === 'data-tip' ? 'tip' : 'label', m[2]);
      // Attribute values set by a value (${…}) are found where that value is written.
      const body = textOf(
        joined
          .replace(ATTRS, ' ')
          .replace(/\s[\w-]+=\$\{…\}/g, ' ')
          .replace(/[.?@]?[\w-]+=\$\{…\}/g, ' ')
      );
      if (body.replace(/\$\{…\}/g, '').trim()) add(n, 'screen', body);
      if (!ts.isNoSubstitutionTemplateLiteral(t)) for (const s of t.templateSpans) visit(s.expression);
      return;
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
      const c = context(n);
      if (SKIP_CALLS.test(c) || SKIP_PROPS.test(c)) return;
      const s = ts.isTemplateExpression(n)
        ? n.head.text + n.templateSpans.map(x => '${' + x.expression.getText() + '}' + x.literal.text).join('')
        : n.text;
      if (/\s/.test(s.trim()) || /[.!?]$/.test(s.trim())) add(n, c ? `text (${c.replace(/^prop:/, '')})` : 'text', s);
      if (ts.isTemplateExpression(n)) for (const x of n.templateSpans) visit(x.expression);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function fromMarkup(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = [];
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    for (const m of l.matchAll(ATTRS))
      if (readable(m[2]))
        out.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          in: '',
          kind: m[1] === 'placeholder' ? 'placeholder' : m[1] === 'data-tip' ? 'tip' : 'label',
          text: m[2]
        });
    const t = textOf(l.replace(ATTRS, ' '));
    if (t && readable(t)) out.push({ file: path.relative(ROOT, file), line: i + 1, in: '', kind: 'screen', text: t });
  });
  return out;
}

const all = [
  ...fromMarkup(path.join(ROOT, 'src', '03-body.html')),
  ...fs
    .readdirSync(APP)
    .filter(f => f.endsWith('.ts'))
    .sort()
    .flatMap(f => fromSource(path.join(APP, f)))
];

const i = process.argv.indexOf('--md');
if (i > 0) {
  const by = new Map();
  for (const x of all) (by.get(x.file) || by.set(x.file, []).get(x.file)).push(x);
  const md = [
    `# The app's text`,
    '',
    `Every piece of text a lifter can read, by module and line (\`node scripts/copy.js --md\`). ${all.length} entries. ${'${…}'} marks a value filled in as the screen is drawn.`,
    ''
  ];
  for (const [f, xs] of by) {
    md.push(`## ${f}`, '');
    for (const x of xs) md.push(`- ${f.split('/').pop()}:${x.line}${x.in ? ` (${x.in})` : ''}, ${x.kind}: ${x.text}`);
    md.push('');
  }
  fs.writeFileSync(process.argv[i + 1], md.join('\n'));
  console.log(`${all.length} entries written to ${process.argv[i + 1]}`);
} else process.stdout.write(JSON.stringify(all, null, 1));
