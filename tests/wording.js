// The app's words, measured where a lifter reads them (2.78.2; V, 2026-11-25: "trim the paragraphs or hide them"). A
// feature suite (CLAUDE.md, Tests). Every screen and sheet a lifter meets is drawn on a phone (390 px) in the states a
// lifter meets it in, and the text shown on it is read as the screen shows it: what a tip or a fold hides is not read,
// since a lifter opens it on purpose, and the Guide is reading on purpose too.
//   1  No paragraph a screen shows on its own runs past WORDS.block words: past that it is a paragraph to read, not a
//      line to glance at, and goes behind an i or into the Guide.
//   2  A routine's line in the picker says who it is for in a few words (WORDS.who), over the name and its time; the
//      picker's own line above them is one short sentence.
//   3  No message runs past WORDS.toast words: whatever the app says in the toast, a tap's answer, a once-note, a
//      sign-in's or a sync's news, written in place or as a named constant handed to one of them.
//   4  Nothing a lifter reads says "sync" or "cloud": the account is "your account", and a log is saved to it (V,
//      2026-11-25: "there has to be something that makes more sense than sync").
//   5  The names of buttons and screens inside the app's words are bold (W-2, V 2026-11-25: bold): a message, a tip or
//      a question that names one carries it marked, and draws it bold.
// Sections 1, 2 and 5 read the page given (`node tests/wording.js baselines/r126.html`); 3 and 4 read this checkout's
// source through scripts/copy.js, so the build before is checked by running the suite from its checkout. Every section
// fails on 2.78.1 that way.
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
  if (run(3) || run(4) || run(5)) {
    // The app's own words, read from its source as scripts/copy.js lists them: every message, tip and question.
    const list = JSON.parse(require('child_process').execFileSync(process.execPath, [require('path').join(__dirname, '..', 'scripts', 'copy.js')], { encoding: 'utf8', maxBuffer: 64 << 20 }));
    // The words only, not the code that picks between them (a template's ${...}: each counts as one word), nor the error
    // log's area names.
    const words = t => t.replace(/\$\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, ' x ');
    if (run(3)) {
      // A message is whatever the app says in the toast: a toast, a once-note, a sign-in's or a sync's news, and a named
      // constant the source hands to one of them (a sign-in refused, an update asked for).
      const fs = require('fs'), path = require('path'), APP = path.join(__dirname, '..', 'src', 'app');
      const src = fs.readdirSync(APP).filter(f => f.endsWith('.ts')).map(f => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n');
      const named = new Set([...src.matchAll(/\b(?:toast|noteOnce|syncAndSay)\(\s*([A-Z][A-Z0-9_]+)\b|setCloud\(\s*'[a-z]+',\s*([A-Z][A-Z0-9_]+)\b/g)].map(m => m[1] || m[2]));
      const says = e => /toast|noteOnce|syncAndSay|setCloud/.test(e.kind) || (e.kind === 'text' && named.has(e.in));
      const long = list.filter(e => says(e) && words(e.text).split(/\s+/).filter(w => /[A-Za-z]/.test(w)).length > WORDS.toast);
      ok(!long.length, `3. no message runs past ${WORDS.toast} words`, long.map(e => `${e.file}:${e.line}: ${e.text.slice(0, 140)}`));
    }
    if (run(4)) {
      const said = list.filter(e => /\bsync|\bcloud\b/i.test(words(e.text)) && !/^(sync|cloud)[-.]/.test(e.text) && !/sync notes?\b|store cannot|logged error/.test(e.text));
      ok(!said.length, '4. nothing a lifter reads says "sync" or "cloud"', said.map(e => `${e.file}:${e.line}: ${e.text.slice(0, 120)}`));
    }
    if (run(5)) {
      // A message drawn with a marked name shows it bold, the marks gone.
      const P = await phone(demo);
      const m = await P.page.evaluate(() => { const L = window.__ironlog; L.toast('Hidden. **Install** stays in the menu.'); const t = document.getElementById('toast'); return { text: t.innerText, bold: [...t.querySelectorAll('b')].map(b => b.textContent) }; });
      ok(m.bold.join() === 'Install' && !/\*/.test(m.text), '5. a message that marks a name draws it bold, the marks gone', m);
      await P.browser.close();
    }
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
