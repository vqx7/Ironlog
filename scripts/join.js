// Builds index.html from src/ (r36 split, r49 modules, r63 modules only). The
// page parts (01 to 03 and 99, HTML and CSS) are joined in name order, their
// {{NAME}} placeholders filled from src/app/config.ts. The script is the
// typed modules in src/app/, bundled by esbuild from the page's start,
// src/app/main.ts (the legacy parts that started it until r63 are gone).
//
// The output stays one inline classic script on purpose: every suite opens
// index.html as a file, where module scripts are refused, and the standalone
// build fingerprints each inline script for its Content Security Policy.
//
//   node scripts/join.js            writes index.html
//   node scripts/join.js --stdout   prints the page instead
//   node scripts/join.js --check    exits 1 when index.html is not what src/ builds to
//   require('./join').build({ override: { 'app/normalize.ts': text } })
//                                   the page built with some modules or page parts replaced,
//                                   for a suite that needs a different build (tests/r43.js)
const fs = require('fs'); const path = require('path'); const os = require('os');
const esbuild = require('esbuild');
const root = path.join(__dirname, '..'); const dir = path.join(root, 'src');
// The bundle's entry: the page's start, which imports every module it runs.
const ENTRY = "import './app/main';\n";

// Every placeholder must be known and filled, so the page title and heading
// are never a second copy of the name. A list of addresses (the library
// loader's, r51) is written only as the items of an array in an inline
// script: the script around it is parsed with the placeholder standing for
// one name, which must be an array's only item, the array a value of its own
// (so not inside a string, a comment, a template, markup, or the key of a
// property access). Each item goes in single quotes,
// and an item holding a quote, a backslash, a line break or a < (which
// could end the script) stops the build. tests/hygiene.js reads the style
// sheet through this too, as the page holds it.
function inScriptArray(t, at, len) {
  for (const s of t.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const a = s.index + '<script>'.length, z = a + s[1].length;
    if (at < a || at + len > z) continue;
    const SENT = '__IRONLOG_LIST__';
    const js = (s[1].slice(0, at - a) + SENT + s[1].slice(at - a + len)).replace(/\{\{\w+\}\}/g, '0');
    let ast; try { ast = require('acorn').parse(js, { ecmaVersion: 'latest' }); } catch (e) { return false; }
    let found = false;
    // The array is a value of its own: not the key of a property access, and not inside a template.
    const walk = (n, up, inTpl) => { if (!n || typeof n.type !== 'string') return; const tpl = inTpl || n.type === 'TemplateLiteral'; if (n.type === 'ArrayExpression' && n.elements.length === 1 && n.elements[0] && n.elements[0].type === 'Identifier' && n.elements[0].name === SENT && !tpl && !(up && up.type === 'MemberExpression' && up.computed && up.property === n)) found = true; for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(x => walk(x, n, tpl)); else if (v && typeof v.type === 'string') walk(v, n, tpl); } };
    walk(ast, null, false);
    return found && js.split(SENT).length === 2;
  }
  return false;
}
function fill(t) {
  const cfg = require('./config');
  return t.replace(/\{\{(\w+)\}\}/g, (m, k, at) => {
    const v = Object.prototype.hasOwnProperty.call(cfg, k) ? cfg[k] : undefined;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      if (!inScriptArray(t, at, m.length)) throw new Error(`join: the list ${m} goes only as an array's only item, in an inline script`);
      if (!v.length || !v.every(x => typeof x === 'string' && !/['\\\r\n<\u2028\u2029]/.test(x))) throw new Error(`join: ${m} must be addresses with no quote, backslash, line break or <`);
      return v.map(x => `'${x}'`).join(',');
    }
    throw new Error(`join: unknown placeholder ${m}`);
  });
}

function build({ override = {} } = {}) {
  const page = fs.readdirSync(dir).filter(f => /^\d\d-.+\.(html|css)$/.test(f)).sort();
  // A script part beside the page parts would be one the build leaves out (the legacy script's, r63).
  const stray = fs.readdirSync(dir).filter(f => /\.js$/.test(f));
  if (stray.length) throw new Error(`join: src/ holds scripts the page does not build from: ${stray.join(', ')}; the script is src/app/`);
  // A replaced module (app/<name>.ts, r56) is written into a copy of src/ that
  // the bundle reads instead, because the bundler takes the modules from disk
  // (its synchronous build, which the --check and the suites need, takes no plugin).
  const mods = Object.keys(override).filter(f => /^app\/[\w-]+\.ts$/.test(f));
  for (const f of Object.keys(override)) if (!mods.includes(f) && !page.includes(f)) throw new Error(`join: no part ${f} to override`);
  for (const f of mods) if (!fs.existsSync(path.join(dir, f))) throw new Error(`join: no module ${f} to override`);
  const read = f => (f in override ? override[f] : fs.readFileSync(path.join(dir, f), 'utf8'));
  let srcDir = dir, copy = null;
  if (mods.length) {
    copy = fs.mkdtempSync(path.join(os.tmpdir(), 'join-'));
    fs.cpSync(dir, copy, { recursive: true });
    for (const f of mods) fs.writeFileSync(path.join(copy, f), override[f]);
    srcDir = copy;
  }
  let out;
  try {
    out = esbuild.buildSync({
      stdin: { contents: ENTRY, sourcefile: 'entry.js', resolveDir: srcDir, loader: 'js' },
      bundle: true, format: 'iife', target: 'esnext', platform: 'browser',
      // An import resolves to a .ts or .js file by its path and nothing else:
      // never a .tsx beside a module (the r51 mutation test put one there, and
      // the bundle took it first while every check read the .ts).
      resolveExtensions: ['.ts', '.js'],
      // A package (lit-html, r57) resolves from the repo's node_modules, also
      // when the bundle reads a copy of src/ (a suite's override, above).
      nodePaths: [path.join(root, 'node_modules')],
      // A linked node_modules (a second worktree's, r62) is read as the folder
      // it stands for, so the bundle's path comments, and index.html, are the
      // same in every checkout: resolved through the link they named
      // ../ironlog/node_modules and tests/r36.js found index.html 77
      // characters off GitHub's.
      preserveSymlinks: true,
      // Nothing is removed beyond what bundling needs, so window.__ironlog and
      // the tests see every module whole.
      treeShaking: false, minify: false, charset: 'utf8', legalComments: 'none',
      // ES modules always run in strict mode, but the wrapper esbuild puts
      // around the bundle does not declare it, so the modules' code would run
      // in sloppy mode on the page (the r50 review). The directive at the top
      // of the script makes all of it strict.
      banner: { js: '"use strict";' },
      write: false, logLevel: 'silent',
    });
  } finally {
    if (copy) fs.rmSync(copy, { recursive: true, force: true });
  }
  const script = escapeMarkup(pageConfig(out.outputFiles[0].text));

  const parts = [];
  for (const f of page) {
    parts.push(fill(read(f)));
    if (f === '03-body.html') parts.push(script);
  }
  return { html: parts.join(''), parts: { page: page.length } };
}

/* config.ts's values that only the build and the markup read (the library
   addresses and versions, the fonts, the password check's origin, the
   preview's label) are left out of the page's script (r65, PENDING 304; the
   outside review of r51 found them riding in the bundle, read by nothing on
   the page). The bundle keeps every other declaration whole (treeShaking is
   off, above), so this reads config.ts's part of it only: a declaration there
   that nothing else in the script names is dropped, and again until none is,
   so a constant only a dropped one used goes with it. config.ts stays the
   one place each value is defined; scripts/config.js reads all of them. */
function pageConfig(js) {
  const acorn = require('acorn');
  const at = js.indexOf('// src/app/config.ts\n');
  if (at < 0) throw new Error('join: config.ts\'s part of the bundle not found');
  const next = js.indexOf('\n  // src/', at + 1);
  const end = next < 0 ? js.length : next;
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'script' });
  const iife = ast.body.find(st => st.type === 'ExpressionStatement' && st.expression.type === 'CallExpression');
  const body = iife ? iife.expression.callee.body.body : [];
  const decls = body.filter(st => st.type === 'VariableDeclaration' && st.start >= at && st.end <= end && st.declarations.every(d => d.id.type === 'Identifier'));
  // The script with some statements left out, to ask whether anything else still names a declaration.
  const without = list => {
    let t = '', p = 0;
    for (const st of [...list].sort((x, y) => x.start - y.start)) { t += js.slice(p, st.start); p = st.end; }
    return t + js.slice(p);
  };
  const dropped = [];
  for (let more = true; more; ) {
    more = false;
    for (const st of decls) {
      if (dropped.includes(st)) continue;
      const rest = without([...dropped, st]);
      if (st.declarations.every(d => !new RegExp(`\\b${d.id.name}\\b`).test(rest))) { dropped.push(st); more = true; }
    }
  }
  for (const st of dropped.sort((a, b) => b.start - a.start)) {
    const lineStart = js.lastIndexOf('\n', st.start) + 1;
    const lineEnd = js.indexOf('\n', st.end);
    js = js.slice(0, lineStart) + js.slice(lineEnd + 1);
  }
  return js;
}

// Chromium's look-ahead scanner can read "<img" inside an inline script as
// markup and fetch it (r29), and "</script" would end the script. The source
// writes them as \x3cimg, but esbuild prints strings decoded, so the escape is
// put back here, in string, template and regular expression tokens only (found
// by acorn's tokenizer), where \x3c means "<" exactly as "<" did. A "<"
// already escaped as "\<" is replaced whole, so the backslash is not doubled;
// one preceded by an escaped backslash ("\\<") keeps that backslash. Anywhere
// outside such a token the build stops.
function escapeMarkup(js) {
  const acorn = require('acorn');
  const LIT = new Set([acorn.tokTypes.string, acorn.tokTypes.template, acorn.tokTypes.regexp]);
  const edits = [];
  for (const t of acorn.tokenizer(js, { ecmaVersion: 'latest' })) {
    if (!LIT.has(t.type)) continue;
    const raw = js.slice(t.start, t.end);
    if (!/<(img|\/script)/i.test(raw)) continue;
    const fixed = raw.replace(/(\\*)<(img|\/script)/gi, (m, bs, x) => (bs.length % 2 ? bs.slice(1) : bs) + '\\x3c' + x);
    edits.push([t.start, t.end, fixed]);
  }
  for (const [a, b, s] of edits.reverse()) js = js.slice(0, a) + s + js.slice(b);
  const left = js.search(/<(img|\/script)/i);
  if (left >= 0) throw new Error(`join: "<img" or "</script" outside a string, template or pattern in the bundled script, near: ${JSON.stringify(js.slice(Math.max(0, left - 60), left + 20))}`);
  return js;
}

module.exports = { build, escapeMarkup, fill };

if (require.main === module) {
  try {
    const { html, parts } = build();
    const target = path.join(root, 'index.html');
    if (process.argv.includes('--stdout')) process.stdout.write(html);
    else if (process.argv.includes('--check')) {
      const same = fs.readFileSync(target, 'utf8') === html;
      console.log(same ? 'index.html matches src/' : 'index.html differs from src/: edit src/ and run npm run join');
      process.exit(same ? 0 : 1);
    } else { fs.writeFileSync(target, html); console.log(`index.html written from ${parts.page} page parts and src/app/`); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
