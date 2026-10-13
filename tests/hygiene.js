// Source hygiene (r42, V: "clean up and optimize what we have", "don't
// hardcode"). Reads the repo, not the page, so it fails at the first sign of
// the kinds of cruft that slipped through earlier sweeps:
// 1. Every file in tests/ is a suite tests/run.js runs, or a helper one of them
//    requires. One-off debug scripts (two sat on main until r42) fail here.
// 2. No CSS selector is defined twice in the same block of src/02-style.css
//    (top level, or inside one @media). A second copy silently overrides the
//    first and hides what a rule really does; eight sat there until r42.
// 3. Estimated minutes are worded in one place, `estMin`. A "~N min" or an
//    "about N min" typed into any other template is how r42's first build
//    missed one spot ("About 40 min after the change").
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x === undefined ? '' : JSON.stringify(x)); } else console.log('ok  ', m); };

// 1. Orphaned test files.
{
  const run = fs.readFileSync(path.join(__dirname, 'run.js'), 'utf8');
  const listed = new Set(); for (const m of run.matchAll(/const (?:suites|distSuites)=\[([^\]]*)\]/g)) for (const n of m[1].matchAll(/'([^']+)'/g)) listed.add(n[1]);
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
  const required = new Set(['run']);
  for (const f of files) { const src = fs.readFileSync(path.join(__dirname, f + '.js'), 'utf8'); for (const m of src.matchAll(/require\('\.\/([^'.]+)(?:\.js)?'\)/g)) required.add(m[1]); }
  const orphans = files.filter(f => !listed.has(f) && !required.has(f));
  ok(orphans.length === 0, 'every file in tests/ is a suite run.js runs or a helper a suite requires', orphans);
  const missing = [...listed].filter(n => !files.includes(n));
  ok(missing.length === 0, 'every suite run.js names exists', missing);
  // r44: the suite table moved to tests/SUITES.md; it keeps a row for every suite.
  const md = fs.readFileSync(path.join(__dirname, 'SUITES.md'), 'utf8'); const rows = new Set([...md.matchAll(/^\| ([\w-]+) \|/gm)].map(m => m[1]));
  const noRow = [...listed].filter(n => !rows.has(n));
  ok(noRow.length === 0, 'every suite has a row in tests/SUITES.md', noRow);
  // r44: suites run side by side, so none runs scripts/build.js itself (it deletes dist/ first); h.js build() does, only when a suite runs alone.
  const direct = files.filter(f => f !== 'h' && f !== 'run' && /scripts', 'build\.js'|build\.js'\]/.test(fs.readFileSync(path.join(__dirname, f + '.js'), 'utf8')));
  ok(direct.length === 0, 'no suite runs the build itself; they call build() from tests/h.js', direct);
}

// 2. Duplicated selectors, per block.
{
  const css = fs.readFileSync(path.join(ROOT, 'src/02-style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [{ name: 'top', sels: new Map() }]; let buf = ''; const dups = [];
  for (const ch of css) {
    if (ch === '{') {
      const head = buf.trim().replace(/\s+/g, ' '); buf = '';
      if (head.startsWith('@')) { stack.push({ name: head, sels: new Map(), at: true }); continue; }
      const blk = stack[stack.length - 1];
      if (blk.sels.has(head)) dups.push(`${blk.name} > ${head}`); else blk.sels.set(head, 1);
      stack.push({ name: head, rule: true });
    } else if (ch === '}') { buf = ''; stack.pop(); }
    else if (ch === ';' && !stack[stack.length - 1].rule) buf = '';
    else buf += ch;
  }
  ok(stack.length === 1, 'the stylesheet\'s braces balance');
  ok(dups.length === 0, 'no selector is defined twice in the same block of the stylesheet', dups);
}

// 3. Minutes wording only from estMin.
{
  const hits = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js'))) {
    fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').split('\n').forEach((line, i) => {
      if (/const estMin=/.test(line)) return;
      // "about" before a number that ends the text or is followed by min or minutes;
      // "about ${load} for", "about ${n} reps" and the like are not minutes.
      if (/~\$\{/.test(line) || /[Aa]bout \$\{[^}]*\}\)?(\s*min\b|\s*minutes\b|`)/.test(line)) hits.push(`${f}:${i + 1}`);
    });
  }
  ok(hits.length === 0, 'estimated minutes are worded only by estMin ("~N min"), nowhere by hand', hits);
  const defs = fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')).filter(f => /const estMin=/.test(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')));
  ok(defs.length === 1, 'estMin is defined once', defs);
}

console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
