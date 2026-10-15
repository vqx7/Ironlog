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

// The build this one replaces is kept as a baseline and read by the
// migration and seams suites (r45: CLAUDE.md asked for it, nothing checked).
{
  const ver = (fs.readFileSync(path.join(ROOT, 'src', '12-storage.js'), 'utf8').match(/const APP_VERSION='[^']*-r(\d+)(?:\.(\d+))?'/) || []).slice(1).map(Number);
  const base = fs.readdirSync(path.join(ROOT, 'baselines')).filter(f => /^r\d+(-\d+)?\.html$/.test(f));
  const num = f => f.replace('.html', '').slice(1).split('-').map(Number);
  const older = base.filter(f => { const [a, b] = num(f); return a < ver[0] || (a === ver[0] && (b || 0) < (ver[1] || 0)); });
  const newest = older.sort((a, b) => { const x = num(a), y = num(b); return x[0] - y[0] || (x[1] || 0) - (y[1] || 0); }).pop();
  ok(ver.length && newest && num(newest)[0] >= ver[0] - 1, `the build before r${ver[0]} is in baselines/ (${newest})`);
  const mig = fs.readFileSync(path.join(__dirname, 'migration.js'), 'utf8');
  const unread = base.filter(f => !mig.includes(`'baselines/${f}'`));
  ok(unread.length === 0, 'every baseline is loaded by tests/migration.js', unread);
}

// The documents against the repository (r46). CLAUDE.md called the Claude
// artifact a shipping channel for 17 days after OWNER.md recorded it retired,
// and 147 lines of its code stayed in src/ because of it. Prose cannot be
// checked by a machine, but the things prose names can be.
{
  const docs = ['CLAUDE.md', 'tests/SUITES.md', 'OWNER.md', 'FEEDBACK.md', 'SUPABASE.md'].filter(f => fs.existsSync(path.join(ROOT, f)));
  const pathish = /`([A-Za-z0-9_.\-]+\/[A-Za-z0-9_.\-\/]+\.[a-z]{2,4})`/g;
  const missing = [];
  for (const d of docs) {
    const txt = fs.readFileSync(path.join(ROOT, d), 'utf8');
    for (const m of txt.matchAll(pathish)) {
      const rel = m[1];
      if (/^(https?|node_modules|data\/)/.test(rel)) continue;
      if (!fs.existsSync(path.join(ROOT, rel))) missing.push(`${d}: ${rel}`);
    }
  }
  ok(missing.length === 0, 'every repo file the documents name exists', missing);

  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const back = ['/*ai{', '/*}ai', 'debriefPrompt', 'aiDigest', 'AI_STYLE', 'exProjection', 'loadAskCard', 'SIMPLE_HIDE'].filter(w => src.includes(w));
  ok(back.length === 0, 'nothing the documents record as removed is back in the source', back);

  const cm = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  ok(!/ships two ways|as a Claude artifact \(a hosted/.test(cm), 'CLAUDE.md does not call the retired artifact a shipping channel');
  const ver = (fs.readFileSync(path.join(ROOT, 'src', '12-storage.js'), 'utf8').match(/APP_VERSION='[^']*-r([0-9.]+)'/) || [])[1];
  ok(ver && cm.includes(`Build r${ver},`), `CLAUDE.md says the build it is (r${ver})`, (cm.match(/Build r[0-9.]+/) || [])[0]);
}

console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
