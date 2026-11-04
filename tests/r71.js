// r71 (PENDING.md's tracker, rows 364 b-1, 385 and 364 b-5), built from the pictures V approved on 2026-11-03 (the
// drafts' rest card, the exercise's Done and Lifts moving's card on the real app), each written as what a lifter
// expects and run first on r70 (`node tests/r71.js` on r70's page), where each section fails:
//   1  364 b-1: the rest as a card floating above the tabs, inset from the edges: the ring, the time, "Rest · next
//      set 2" (or the next lift's name once the lift is done), round -15 and +15 and Skip in the accent; -15 and +15
//      work; done, the ring fills and the time reads Go; the last row of a session still scrolls clear of it; the
//      compact pill stays (a guard).
//   2  385: an exercise's ✓ Done stands out: the accent's outline and colour, at the right of its row, 44 px tall.
//   3  364 b-5: Lifts moving's rows in a card of their own, each 54 px, its line 80 by 24 at 2.5 px, its set in bold.
//   4  364 b-1: a reload mid-rest brings the card back with its time and what comes next; Skip forgets both, so the
//      next session's rest names its own next.
// R71_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R71_ONLY ? process.env.R71_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const TODAY = '2026-11-03';

// A session on demo data at 390 by 844, by touch, with the first lift's first set ticked so the rest runs.
async function session(o = {}) {
  const theme = o.theme || 'dark';
  const T = await open(FILE, { touch: true, w: 390, h: 844, clock: TODAY + 'T18:00:00', dark: theme === 'dark' });
  const pg = T.page;
  await pg.evaluate(([c, th]) => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.theme = th; S.settings.timerCompact = c; S.settings.rirAsk = false; L.makeDemo(); for (const x of S.sessions) delete x.demo; localStorage.setItem('ironlog.v1.tipWake', '1'); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); }, [!!o.compact, theme]);
  await pg.click('.hero [data-act="startSession"]:not([data-light])'); await wait(300);
  return T;
}

(async () => {
  if (run(1)) {
    const T = await session();
    const pg = T.page;
    await pg.tap('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(500);
    const card = () => pg.evaluate(() => {
      const t = document.getElementById('timer'), b = t.getBoundingClientRect(), tabs = document.getElementById('tabs').getBoundingClientRect(), cs = getComputedStyle(t);
      const pill = k => { const e = t.querySelector(`[data-act="${k}"]`); if (!e) return null; const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { text: e.textContent, h: Math.round(r.height), round: parseFloat(s.borderTopLeftRadius) >= r.height / 2 - 1, color: s.color }; };
      const ring = t.querySelector('[data-t="p"]');
      const probe = document.createElement('i'); probe.style.color = 'var(--volt-line)'; document.body.appendChild(probe); const accent = getComputedStyle(probe).color; probe.remove();
      return { shown: !t.hidden, compact: t.classList.contains('compact'), left: Math.round(b.left), right: Math.round(innerWidth - b.right), gap: Math.round(tabs.top - b.bottom), h: Math.round(b.height), radius: parseFloat(cs.borderTopLeftRadius), ring: !!ring, dash: ring ? ring.getAttribute('stroke-dasharray') : null, time: (t.querySelector('[data-t="v"]') || {}).textContent, label: ((t.querySelector('[data-t="l"]') || {}).textContent || '').replace(/\s/g, ' '), sub: pill('tSub'), add: pill('tAdd'), skip: pill('tStop'), accent };
    });
    const a = await card();
    ok(a.shown && !a.compact && a.left >= 10 && a.left <= 14 && a.right >= 10 && a.right <= 14 && a.gap >= 8 && a.gap <= 12 && a.h === 76 && a.radius >= 22, '1. 364 b-1: the rest is a card floating above the tabs, 12 px in from each edge, 76 px tall with round corners (r70: a bar across the screen)', a);
    ok(a.ring && !!a.dash && /^\d+:\d\d$/.test(a.time || ''), '1. it holds the ring, showing the share of the rest left, and the time', a);
    ok(a.label === 'Rest · next set 2', '1. under the time it names what is next: "Rest · next set 2"', a);
    ok(!!a.sub && !!a.add && !!a.skip && a.sub.text === '−15' && a.add.text === '+15' && a.skip.text === 'Skip' && a.sub.h >= 44 && a.add.h >= 44 && a.skip.h >= 44 && a.sub.round && a.add.round && a.skip.color === a.accent, '1. round -15 and +15, 44 px tall, and Skip in the accent', a);
    const secs = t => { const [m, s2] = t.split(':').map(Number); return m * 60 + s2; };
    const t0 = secs(a.time);
    await pg.click('#timer [data-act="tSub"]'); await wait(300);
    const t1 = secs((await card()).time);
    await pg.click('#timer [data-act="tAdd"]'); await wait(300);
    const t2 = secs((await card()).time);
    ok(t0 - t1 >= 14 && t0 - t1 <= 16 && t2 - t1 >= 14 && t2 - t1 <= 16, '1. -15 takes 15 seconds off and +15 puts 15 back', { t0, t1, t2 });
    await pg.evaluate(() => { window.__ironlog.timer.end = Date.now(); }); await wait(600);
    const d = await pg.evaluate(() => { const t = document.getElementById('timer'); return { done: t.classList.contains('done'), time: t.querySelector('[data-t="v"]').textContent, label: t.querySelector('[data-t="l"]').textContent.replace(/\s/g, ' '), dash: t.querySelector('[data-t="p"]').getAttribute('stroke-dasharray') }; });
    ok(d.done && d.time === 'Go' && d.label === 'Rest done' && /^100 /.test(d.dash || ''), '1. done, the ring fills, the time reads Go and the line says only Rest done (V, 2026-11-04)', d);
    // Once the lift is done, the next is the lift the screen brings up next.
    const n = await pg.evaluate(() => window.__ironlog.state.draft.ex[0].sets.length);
    for (let i = 1; i < n; i++) { const sel = `[data-act="sDone"][data-b="0"][data-s="${i}"]`; if (await pg.$(sel)) { await pg.tap(sel); await wait(150); } }
    await wait(300);
    const nx = await pg.evaluate(() => ({ label: document.querySelector('#timer [data-t="l"]').textContent, name: window.__ironlog.exName(window.__ironlog.state.draft.ex[1].exId) }));
    ok(nx.label === 'Rest · next: ' + nx.name, '1. after a lift\'s last set it names the next lift', nx);
    // The foot of the session scrolls clear of the card.
    const foot = await pg.evaluate(async () => { window.scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 300)); const els = [...document.querySelectorAll('#view button, #view .sg')].filter(e => e.getClientRects().length); const last = els[els.length - 1].getBoundingClientRect(); return { lastBottom: Math.round(last.bottom), cardTop: Math.round(document.getElementById('timer').getBoundingClientRect().top) }; });
    ok(foot.lastBottom <= foot.cardTop, '1. at the foot of the session the last control sits above the card, not under it', foot);
    ok(!T.errors.length, '1. no page errors', T.errors);
    await T.browser.close();
    // The compact pill, chosen in Settings: still in the corner above the tabs (a guard).
    const C = await session({ compact: true });
    await C.page.tap('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(500);
    const c = await C.page.evaluate(() => { const t = document.getElementById('timer'), b = t.getBoundingClientRect(); return { compact: t.classList.contains('compact'), bottomGap: innerHeight - b.bottom, right: innerWidth - b.right, acts: [...t.querySelectorAll('[data-act]')].map(e => e.dataset.act) }; });
    ok(c.compact && c.bottomGap > 50 && c.right < 20 && c.acts.join() === 'tAdd,tStop', '1. the compact pill stays in the corner above the tabs, +15 and ✕ (a guard)', c);
    await C.browser.close();
  }

  if (run(2)) {
    for (const theme of ['dark', 'light']) {
      const T = await session({ theme });
      // Done shows once a set of the lift is ticked.
      await T.page.tap('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(400);
      const r = await T.page.evaluate(() => {
        const b = document.querySelector('#view [data-act="bDoneAll"][data-b="0"]'), row = b.parentElement, br = b.getBoundingClientRect(), rr = row.getBoundingClientRect(), cs = getComputedStyle(b);
        const probe = document.createElement('i'); probe.style.color = 'var(--volt)'; document.body.appendChild(probe); const volt = getComputedStyle(probe).color; probe.style.color = 'var(--volt-line)'; const line = getComputedStyle(probe).color; probe.remove();
        const others = [...row.children].filter(e => e !== b && e.getClientRects().length).map(e => getComputedStyle(e).borderTopColor);
        return { border: cs.borderTopColor, width: parseFloat(cs.borderTopWidth), color: cs.color, volt, line, h: Math.round(br.height), rightGap: Math.round(rr.right - br.right), afterIt: [...row.children].slice([...row.children].indexOf(b) + 1).filter(e => e.getClientRects().length).map(e => Math.round(e.getBoundingClientRect().width)), others };
      });
      const rest = r.afterIt.reduce((a, w) => a + w + 12, 0);
      // The outline is drawn at 1.5 px; Chrome reports a border rounded to whole device pixels, 1 px on this 1x screen.
      ok(r.border === r.volt && r.width >= 1 && r.color === r.line && !r.others.includes(r.volt) && r.h >= 44 && r.rightGap <= rest + 2, `2. 385 (${theme}): an exercise's ✓ Done is outlined and written in the accent, at the right of its row, 44 px tall (r70: like the buttons beside it)`, r);
      await T.browser.close();
    }
  }

  if (run(3)) {
    for (const theme of ['dark', 'light']) {
      const T = await open(FILE, { touch: true, w: 390, h: 844, clock: TODAY + 'T18:00:00', dark: theme === 'dark' });
      const r = await T.page.evaluate(th => {
        const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.theme = th; L.makeDemo(); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render();
        const s = document.querySelector('#view [data-sk="today:moving"]'); if (s && s.tagName === 'DETAILS') s.open = true;
        const rows = s ? [...s.querySelectorAll('.mvrow')] : [];
        const card = rows.length ? rows[0].parentElement : null, cs = card ? getComputedStyle(card) : null;
        const page = getComputedStyle(document.body).backgroundColor;
        const ln = rows.length ? rows[0].querySelector('.mvline') : null, lr = ln ? ln.getBoundingClientRect() : null;
        return { n: rows.length, allIn: rows.every(x => x.parentElement === card), cardBg: cs ? cs.backgroundColor : null, page, radius: cs ? parseFloat(cs.borderTopLeftRadius) : 0, h: rows.map(x => Math.round(x.getBoundingClientRect().height)), line: lr ? [Math.round(lr.width), Math.round(lr.height)] : null, stroke: ln ? parseFloat(getComputedStyle(ln.querySelector('polyline')).strokeWidth) : 0, setW: rows.length ? +getComputedStyle(rows[0].querySelector('.mvset')).fontWeight : 0 };
      }, theme);
      ok(r.n > 0 && r.allIn && r.cardBg && r.cardBg !== 'rgba(0, 0, 0, 0)' && r.cardBg !== r.page && r.radius >= 16, `3. 364 b-5 (${theme}): Lifts moving's rows sit in a card of their own`, r);
      ok(r.h.every(x => x >= 54) && JSON.stringify(r.line) === '[80,24]' && r.stroke === 2.5 && r.setW >= 700, `3. (${theme}) each row 54 px, its line 80 by 24 drawn at 2.5 px, its set in bold`, r);
      await T.browser.close();
    }
  }

  if (run(4)) {
    const T = await session();
    const pg = T.page;
    await pg.tap('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(500);
    const before = await pg.evaluate(() => document.querySelector('#timer [data-t="l"]').textContent.replace(/\s/g, ' '));
    await pg.reload(); await pg.waitForFunction(() => window.__ironlog); await wait(800);
    const after = await pg.evaluate(() => { const t = document.getElementById('timer'); return { shown: !t.hidden, label: (t.querySelector('[data-t="l"]') || {}).textContent, time: (t.querySelector('[data-t="v"]') || {}).textContent }; });
    ok(before === 'Rest · next set 2' && after.shown && (after.label || '').replace(/\s/g, ' ') === before && /^\d:\d\d$/.test(after.time || ''), '4. a reload mid-rest brings the card back with its time and "Rest · next set 2"', { before, after });
    await pg.click('#timer [data-act="tStop"]'); await wait(200);
    const gone = await pg.evaluate(() => Object.keys(localStorage).filter(k => /timer/i.test(k)));
    ok(!gone.length, '4. Skip forgets the rest, its next included', gone);
    ok(!T.errors.length, '4. no page errors', T.errors);
    await T.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
