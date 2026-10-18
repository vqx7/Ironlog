// Builds index.html from src/ (r36 split, r49 modules). The page parts
// (01 to 03 and 99, HTML and CSS) are joined in name order as before, their
// {{NAME}} placeholders filled from src/app/config.ts. The script is bundled by
// esbuild: the legacy parts (10 to 29), one script in one scope since the
// Claude artifact days, are joined as one module that starts with
// src/09-imports.js, the real imports from the typed modules in src/app/. Each
// phase of ARCHITECTURE.md moves code from the legacy parts into src/app/
// until the legacy parts are gone.
//
// The output stays one inline classic script on purpose: every suite opens
// index.html as a file, where module scripts are refused, and the standalone
// build fingerprints each inline script for its Content Security Policy.
//
//   node scripts/join.js            writes index.html
//   node scripts/join.js --stdout   prints the page instead
//   node scripts/join.js --check    exits 1 when index.html is not what src/ builds to
//   require('./join').build({ override: { '16-engine.js': text } })
//                                   the page built with some parts replaced, for a
//                                   suite that needs a different build (tests/r43.js)
const fs = require('fs'); const path = require('path');
const esbuild = require('esbuild');
const root = path.join(__dirname, '..'); const dir = path.join(root, 'src');
const IMPORTS = '09-imports.js';
const isLegacy = f => /^[12]\d-.+\.js$/.test(f);
// The legacy parts are one IIFE, kept as written: inside it every const and
// let stays a const and a let (bundling would turn top-level ones into var,
// so a reassigned constant or a read before its line would stop failing).
// The imports sit outside the wrapper, in the module's scope, and the
// wrapper's code sees them as it sees its own names.
const OPEN = "(function(){\n'use strict';\n", CLOSE = '})();\n';

// Every placeholder must be known and filled, so the page title and heading
// are never a second copy of the name. A list of addresses (the library
// loader's, r51) is written only as the items of an array in an inline
// script: the script around it is parsed with the placeholder standing for
// one name, which must be an array's only item (so not inside a string, a
// comment, a property access or markup). Each item goes in single quotes,
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
    const walk = n => { if (!n || typeof n.type !== 'string') return; if (n.type === 'ArrayExpression' && n.elements.length === 1 && n.elements[0] && n.elements[0].type === 'Identifier' && n.elements[0].name === SENT) found = true; for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); } };
    walk(ast);
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
  const all = fs.readdirSync(dir).filter(f => /^\d\d-.+\.(html|css|js)$/.test(f)).sort();
  for (const f of Object.keys(override)) if (!all.includes(f)) throw new Error(`join: no part ${f} to override`);
  const read = f => (f in override ? override[f] : fs.readFileSync(path.join(dir, f), 'utf8'));
  const legacy = all.filter(isLegacy);
  const page = all.filter(f => !isLegacy(f) && f !== IMPORTS);

  const body = legacy.map(read).join('');
  if (!body.startsWith(OPEN)) throw new Error(`join: ${legacy[0]} must start with the wrapper ${JSON.stringify(OPEN)}`);
  if (!body.endsWith(CLOSE)) throw new Error(`join: ${legacy[legacy.length - 1]} must end with ${JSON.stringify(CLOSE)}`);
  // The parts are that one call and nothing after it: a second script
  // appended inside a part would otherwise ride along (the r51 mutation test).
  const parsed = require('acorn').parse(body, { ecmaVersion: 'latest', sourceType: 'script' });
  if (parsed.body.length !== 1) throw new Error(`join: the legacy parts must be one statement, the wrapper's call; they are ${parsed.body.length}`);
  const out = esbuild.buildSync({
    stdin: { contents: read(IMPORTS) + body, sourcefile: 'legacy.js', resolveDir: dir, loader: 'js' },
    bundle: true, format: 'iife', target: 'esnext', platform: 'browser',
    // An import resolves to a .ts or .js file by its path and nothing else:
    // never a .tsx beside a module (the r51 mutation test put one there, and
    // the bundle took it first while every check read the .ts).
    resolveExtensions: ['.ts', '.js'],
    // Nothing is removed beyond what bundling needs: the legacy code keeps
    // every function, so window.__ironlog and the tests see it whole.
    treeShaking: false, minify: false, charset: 'utf8', legalComments: 'none',
    // ES modules always run in strict mode, and the legacy script declares it
    // itself, but the wrapper esbuild puts around the bundle does not, so the
    // modules' code would run in sloppy mode on the page (the r50 review).
    // The directive at the top of the script makes all of it strict.
    banner: { js: '"use strict";' },
    write: false, logLevel: 'silent',
  });
  const script = escapeMarkup(out.outputFiles[0].text);

  const parts = [];
  for (const f of page) {
    parts.push(fill(read(f)));
    if (f === '03-body.html') parts.push(script);
  }
  return { html: parts.join(''), parts: { page: page.length, legacy: legacy.length } };
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
    } else { fs.writeFileSync(target, html); console.log(`index.html written from ${parts.page} page parts and ${parts.legacy} script parts`); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
