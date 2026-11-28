// The app's words, measured where a lifter reads them (2.78.2; V, 2026-11-25: "trim the paragraphs or hide them"). A
// feature suite (CLAUDE.md, Tests). Screens and the sheets a lifter opens most are drawn on a phone (390 px) and read
// as they show; what a tip or a fold hides is not read there, since a lifter opens it on purpose, and the Guide is
// reading on purpose too. Questions, messages and the names in them are read from the source (scripts/copy.js, the
// app and the account script), since they come from more states than a walk can reach. There a placeholder counts as
// one word: a name, a number or a list from the lifter's log is the lifter's, not the app's; app words a placeholder
// picks (such as "on another device") are not seen, so a message built that way is counted by hand when written.
//   1  No paragraph a screen shows on its own runs past WORDS.block words, and no paragraph of a question (a blank line
//      starts one): past that it is a paragraph to read, not a line to glance at, and goes behind an i or into the Guide.
//   2  A routine's line in the picker says who it is for in a few words (WORDS.who), over the name and its time; the
//      picker's own line above them is one short sentence.
//   3  No message runs past WORDS.toast words: whatever the app says in the toast, a tap's answer, a once-note, a
//      sign-in's or a sync's news, written in place or as a named constant handed to one of them, and the account
//      script's sentences.
//   4  Nothing a lifter reads says "sync" or "cloud": the account is "your account", and a log is saved to it (V,
//      2026-11-25: "there has to be something that makes more sense than sync"). A logged error's own words (an Error
//      handed to the error log) are the app's diagnostics for a report, not the lifter's.
//   5  The names of buttons and screens inside the app's words are bold (W-2, V 2026-11-25: bold): a message, a tip, a
//      question or a help line that names one carries it marked; a message, a question in paragraphs and a tip draw the
//      marks as bold; no screen or attribute shows them as stars.
// On the build before (`node tests/wording.js baselines/r126.html`) sections 1, 2 and 5's drawn checks read the page
// given; the source-read checks read this checkout, so the build before is checked by running the suite from its
// checkout. Every section fails on 2.78.1 that way.
// WORDING_ONLY=1,3 runs some sections; WORDING_LIST=1 prints every block measured.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 2400) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.WORDING_ONLY ? process.env.WORDING_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
/** The most words: a paragraph a screen shows on its own, a routine's line in the picker, a message. */
const WORDS = { block: 22, who: 5, toast: 15 };

// The paragraphs shown: each block of text a lifter sees without opening anything, by its words.
const blocks = P => P.page.evaluate(() => {
  const seen = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.hidden) return false; if (e.tagName === 'DETAILS' && !e.open && !el.closest('summary')) return false; } return el.getClientRects().length > 0; };
  const out = [];
  // An open sheet is what is read; the page under it is dimmed.
  const m = document.getElementById('modal');
  const sel = m && !m.hidden ? '#modal p, #modal li, #modal .tpl-w' : '#view p, #view li, #view .hint, #obPage p, .acctbar span.small';
  for (const el of document.querySelectorAll(sel)) {
    if (!seen(el) || el.closest('#guide, .guide, [data-guide]')) continue;
    // A block inside another is read once, as the outer one.
    if (el.parentElement && el.parentElement.closest('#view p, #view li, #modal p, #modal li')) continue;
    const t = el.innerText.replace(/\s+/g, ' ').trim();
    const words = t.split(' ').filter(w => /[A-Za-z]/.test(w)).length;
    out.push({ t, words });
  }
  return out;
});

async function phone(seed) {
  const P = await open(FILE, { w: 390, h: 844, clock: '2026-11-25T10:00:00', realStarter: true });
  await P.page.evaluate(seed);
  await wait(200);
  return P;
}
const demo = () => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); for (const x of L.state.sessions) delete x.demo; localStorage.setItem(L.KEY + '.tipWake', '1'); L.saveNow(); L.invalidate(); L.ui.tab = 'today'; L.render(); };

(async () => {
  const all = [];
  const look = async (P, where) => { for (const b of await blocks(P)) all.push({ where, ...b }); };
  if (run(1) || run(2)) {
    // A new lifter: the first pages and the routine picker.
    const N = await phone(() => {});
    await wait(800);
    await look(N, 'first page');
    await N.page.click('[data-act="obAcctLater"]').catch(() => {}); await wait(300);
    await look(N, 'Set up');
    await N.page.click('[data-act="obSample"]').catch(() => {}); await wait(400);
    await look(N, 'Pick a routine');
    const who = await N.page.evaluate(() => [...document.querySelectorAll('#modal .tpl-w')].map(e => e.innerText.trim()));
    const intro = await N.page.evaluate(() => { const p = document.querySelector('#modal .sheet > p'); return p ? p.innerText.trim() : ''; });
    if (run(2)) {
      // Who it is for, before its time (" · 45 to 50 min").
      const longWho = who.filter(t => t.split(' · ')[0].split(/\s+/).length > WORDS.who);
      ok(who.length > 0 && !longWho.length, `2. each routine says who it is for in ${WORDS.who} words at most`, longWho);
      ok(intro.split(/\s+/).length <= 8, '2. the picker\'s line above the routines is one short sentence', intro);
    }
    await N.page.click('[data-act="tplPick"]').catch(() => {}); await wait(500);
    await N.page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await wait(200);
    await look(N, 'first Today');
    await N.browser.close();
    // A lifter with a log: every tab, its sections open, and a workout.
    const P = await phone(demo);
    for (const tab of ['today', 'program', 'dash', 'history', 'settings']) {
      await P.page.evaluate(t => { const L = window.__ironlog; L.ui.tab = t; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); }, tab);
      await wait(300);
      await look(P, tab);
    }
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); }); await wait(150);
    await P.page.click('.hero [data-act="startSession"]'); await wait(400);
    await look(P, 'workout');
    await P.page.click('[data-act="finish"]').catch(() => {}); await wait(300);
    await look(P, 'Finish');
    // The sheets a lifter opens most, as the app opens them (the full list of states is tests/r62.js's).
    const SHEETS = [
      ['the menu', { kind: 'menu' }], ['the calendar', { kind: 'calendar', ym: '2026-11' }], ['install', { kind: 'install', how: 'menu' }],
      ['install, Safari 26', { kind: 'install', how: 'ios-safari26' }], ['flag an injury', { kind: 'injury' }], ['log cardio', { kind: 'cardio' }],
      ['a lift goal', { kind: 'goal', exId: 'bench' }], ['the routine templates', { kind: 'templates', from: 'plan' }], ['a new routine', { kind: 'routineNew' }],
      ['the app icon', { kind: 'icon' }], ['sign in', { kind: 'account', mode: 'signin', email: '', pw: '' }], ['create account', { kind: 'account', mode: 'signup', email: '', pw: '' }],
      ['an exercise\'s history', { kind: 'exhist', exId: 'bench' }], ['import', { kind: 'imp', step: 'input', text: '', err: '' }], ['pick for me', { kind: 'pickToday' }]
    ];
    for (const [name, m] of SHEETS) {
      await P.page.evaluate(m => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.openModal(m); }, m); await wait(250);
      await look(P, name);
    }
    await P.page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ui.tab = 'today'; L.render(); }); await wait(150);
    for (const [name, act, ds] of [['the exercise menu', 'bMenu', { b: '0' }], ['short on time', 'shortOpen', {}], ['a past workout', 'pastOpen', { date: '2026-11-20' }], ['report a problem', 'fbOpen', {}], ['limited equipment', 'eqOpen', { day: '0' }], ['a rest week', 'restWkOpen', {}]]) {
      await P.page.evaluate(([act, ds]) => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); try { L.ACT[act]({ dataset: ds }); } catch (e) { /* a sheet this state cannot open */ } }, [act, ds]); await wait(250);
      await look(P, name);
    }
    await P.browser.close();
    if (process.env.WORDING_LIST) for (const b of all.sort((a, b) => b.words - a.words)) console.log(String(b.words).padStart(3), b.where.padEnd(14), b.t.slice(0, 220));
    if (run(1)) {
      const long = all.filter(b => b.words > WORDS.block);
      ok(!long.length, `1. no paragraph a screen shows on its own runs past ${WORDS.block} words (${all.length} read)`, long.map(b => `${b.where}: ${b.words}: ${b.t.slice(0, 140)}`));
    }
  }
  if (run(1) || run(3) || run(4) || run(5)) {
    // The app's own words, read from its source as scripts/copy.js lists them: every message, tip and question.
    const list = JSON.parse(require('child_process').execFileSync(process.execPath, [require('path').join(__dirname, '..', 'scripts', 'copy.js')], { encoding: 'utf8', maxBuffer: 64 << 20 }));
    // The words only, not the code that picks between them (a template's ${...}: each counts as one word), nor the error
    // log's area names.
    const words = t => {
      // Innermost braces first, so a placeholder holding code with its own braces or templates is one word.
      let s = t;
      for (let i = 0; i < 12; i++) { const n = s.replace(/\{[^{}]*\}/g, ' x '); if (n === s) break; s = n; }
      return s.replace(/\$\s*x/g, ' x ');
    };
    if (run(1)) {
      // Every question's paragraphs, as the question sheet draws them (a blank line starts one): questions are many and
      // open from many states, so they are read from the source, each placeholder one word.
      const long = list.filter(e => /confirmBox|\bask\b/.test(e.kind)).flatMap(e => e.text.split('\n\n').map(p => ({ e, n: words(p).split(/\s+/).filter(w => /[A-Za-z]/.test(w)).length, p })))
        .filter(x => x.n > WORDS.block);
      ok(!long.length, `1. no question's paragraph runs past ${WORDS.block} words`, long.map(x => `${x.e.file}:${x.e.line}: ${x.n}: ${x.p.slice(0, 120)}`));
    }
    if (run(3)) {
      // A message is whatever the app says in the toast: a toast, a once-note, a sign-in's or a sync's news, and a named
      // constant the source hands to one of them (a sign-in refused, an update asked for).
      const fs = require('fs'), path = require('path'), APP = path.join(__dirname, '..', 'src', 'app');
      const src = fs.readdirSync(APP).filter(f => f.endsWith('.ts')).map(f => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n');
      const named = new Set([...src.matchAll(/\b(?:toast|noteOnce|syncAndSay)\(\s*([A-Z][A-Z0-9_]+)\b|setCloud\(\s*'[a-z]+',\s*([A-Z][A-Z0-9_]+)\b/g)].map(m => m[1] || m[2]));
      // The account script's sentences are the account's messages, shown as they come (Settings, the account sheets).
      const says = e => /toast|noteOnce|syncAndSay|setCloud/.test(e.kind) || (e.kind === 'text' && named.has(e.in)) || (e.file === 'scripts/cloud-supabase.js' && /[.!?]$/.test(e.text.trim()));
      const long = list.filter(e => says(e) && words(e.text).split(/\s+/).filter(w => /[A-Za-z]/.test(w)).length > WORDS.toast);
      ok(!long.length, `3. no message runs past ${WORDS.toast} words`, long.map(e => `${e.file}:${e.line}: ${e.text.slice(0, 140)}`));
    }
    if (run(4)) {
      // A logged error's own words (an Error handed to the error log) are the app's diagnostics for a report, listed
      // under Settings > More for the owner; every other text is the lifter's.
      const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
      const lines = {};
      const lineAt = e => (lines[e.file] = lines[e.file] || fs.readFileSync(path.join(ROOT, e.file), 'utf8').split('\n'))[e.line - 1] || '';
      const logged = e => /\blog\([^,]+,\s*new Error\(|throw new Error\(/.test(lineAt(e));
      const said = list.filter(e => /\bsync|\bcloud\b/i.test(words(e.text)) && !/^(sync|cloud)[-.]/.test(e.text) && !logged(e));
      ok(!said.length, '4. nothing a lifter reads says "sync" or "cloud"', said.map(e => `${e.file}:${e.line}: ${e.text.slice(0, 120)}`));
    }
    if (run(5)) {
      // A message drawn with a marked name shows it bold, the marks gone.
      const P = await phone(demo);
      const m = await P.page.evaluate(() => { const L = window.__ironlog; L.toast('Hidden. **Install** stays in the menu.'); const t = document.getElementById('toast'); return { text: t.innerText, bold: [...t.querySelectorAll('b')].map(b => b.textContent) }; });
      ok(m.bold.join() === 'Install' && !/\*/.test(m.text), '5. a message that marks a name draws it bold, the marks gone', m);
      // No mark drawn as stars: every tab with its sections open, a question and a tip opened, read in their text and
      // in every attribute a lifter or a screen reader meets (a tip's own data-tip holds its marks until it is drawn).
      const stars = [];
      const scan = where => P.page.evaluate(where => {
        const out = [];
        if (/\*\*/.test(document.body.innerText)) out.push(where + ': text ' + (document.body.innerText.match(/.{0,40}\*\*.{0,40}/) || [''])[0]);
        for (const el of document.querySelectorAll('*')) for (const a of el.attributes) if (a.name !== 'data-tip' && /\*\*/.test(a.value)) out.push(`${where}: ${el.tagName.toLowerCase()} ${a.name}="${a.value.slice(0, 60)}"`);
        return out;
      }, where);
      for (const tab of ['today', 'program', 'dash', 'history', 'settings']) {
        await P.page.evaluate(t => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ui.tab = t; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); }, tab);
        await wait(250);
        stars.push(...(await scan(tab)));
      }
      await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); L.ACT.resetAll(); }); await wait(250);
      stars.push(...(await scan('Erase everything?')));
      const q = await P.page.evaluate(() => { const m = document.querySelector('#modal .sheet'); return m ? m.querySelectorAll('p').length : 0; });
      ok(q >= 2, '5. a question with a blank line in it is drawn in paragraphs (Erase everything?)', q);
      await P.page.evaluate(() => { const L = window.__ironlog; L.ACT.mClose(); L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); }); await wait(200);
      // Tapped as a lifter taps it.
      const has = await P.page.evaluate(() => { const b = [...document.querySelectorAll('.tipi[data-tip*="**"]')].find(e => e.getClientRects().length); if (!b) return false; b.setAttribute('data-wtip', '1'); b.scrollIntoView({ block: 'center' }); return true; });
      if (has) { await wait(200); await P.page.click('[data-wtip]'); await wait(300); }
      const tipped = has ? await P.page.evaluate(() => { const t = document.getElementById('tip'); return t && !t.hidden ? { text: t.innerText, bold: t.querySelectorAll('b').length } : null; }) : null;
      ok(tipped && tipped.bold > 0 && !/\*/.test(tipped.text), '5. a tip that marks a name draws it bold, the marks gone', tipped);
      ok(!stars.length, '5. no mark is drawn as stars, in any text or attribute', stars);
      await P.browser.close();
    }
    if (run(5)) {
      // The names of the app's screens and buttons, marked wherever the app's words name them in a message, a question,
      // a tip or a help line (W-2). Read from the source; a name that opens its text is a label or a title, not a mention,
      // and so is a text of three words or fewer, or a short title ending in a question mark.
      const NAMES = ['Plan', 'Stats', 'History', 'Settings', 'Undo', 'Discard', 'Resume', 'Finish', 'Recently deleted', 'Weekly set targets', 'Default targets', 'Set a target', 'Your training', 'Save now', 'Export backup', 'Change photo', 'Create account', 'Save for later', 'Short on time', 'Make it lighter', 'New from a template', 'Your data and backups', 'Add to Home Screen', 'Guide', 'Muscle map', 'More options', 'Measurements', 'Apply', 'Copy diagnostics', 'Report a problem', 'Log a past workout', 'Type or dictate sets'];
      const KINDS = /toast|confirmBox|\bask\b|tip|help|howText|noteOnce|syncAndSay|setCloud|text \((msg|why)\)/;
      const bare = t => t.replace(/\*\*[^*]+\*\*/g, m => ' '.repeat(m.length)).replace(/<b>.*?<\/b>/g, m => ' '.repeat(m.length));
      const plain = [];
      for (const e of list) {
        if (!KINDS.test(e.kind)) continue;
        const n = words(e.text).split(/\s+/).filter(w => /[A-Za-z]/.test(w)).length;
        if (n <= 3 || (n <= 6 && /\?$/.test(e.text.trim()))) continue;
        for (const name of NAMES) {
          const re = new RegExp(`(?<![A-Za-z*])${name.replace(/ /g, ' ')}(?![A-Za-z])`, 'g');
          for (const m of bare(e.text).matchAll(re)) if (m.index > 0) plain.push(`${e.file}:${e.line}: ${name}`);
        }
      }
      ok(!plain.length, '5. every screen or button name in a message, question, tip or help line is marked bold', [...new Set(plain)]);
    }
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
