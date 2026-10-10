// r21: logging a missed workout date first (53), every week-bar day tappable
// (54), the Today card following the theme (57), the grey reps after a swap to
// a lift with no history (59), Discard at the top and bottom that asks only
// when something was entered (60), and less text for new users (62). Items
// 55, 56 and 61 need the standalone build: tests/install.js, tests/accounts.js.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
(async () => {
  // Thursday 24 September 2026. Sessions on Tue 22, Wed 23 and Thu 24, and
  // Monday 21 an empty past day this week. Since r29 the demo does every
  // planned session and leaves today open, so the week is set here.
  const A = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-24T18:00:00' });
  const { page } = A;
  const ev = (f, a) => page.evaluate(f, a);
  // Auto-mark off, as before r28 made it on for new installs: the checks below are about quick entry ticking without it.
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.autoDone = false; L.makeDemo(); /* r30: history here, not sample data */ for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of (L.state[k] || [])) delete x.demo; L.invalidate && L.invalidate();
    L.state.sessions = L.state.sessions.filter(x => x.date !== '2026-09-21');
    const w = L.state.sessions.find(x => x.date === '2026-09-23');
    if (w && !L.state.sessions.some(x => x.date === '2026-09-24')) { const R = L.state.routines.find(r => r.id === w.routineId); const di = (w.dayIdx + 1) % R.days.length; const d = R.days[di];
      L.state.sessions.push({ id: 'thu24', date: '2026-09-24', dayIdx: di, dayId: d.id, dayName: d.name, routineId: R.id, ex: d.items.map(it => ({ exId: it.exId, sets: [{ w: 20, r: it.repMin, rir: 1, warm: false }] })), notes: '', demo: false }); }
    L.invalidate(); L.ui.tab = 'today'; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
  await page.waitForTimeout(100);

  // ---- 54: every day in the week bar is a button, and an empty past day logs.
  const wk = await ev(() => [...document.querySelectorAll('#wkbar .w')].map(e => ({ tag: e.tagName, act: e.dataset.act, date: e.dataset.date || null, add: e.classList.contains('add') })));
  ok(wk.length === 7 && wk.every(w => w.tag === 'BUTTON' && w.act), 'all seven days in the week bar are buttons that do something', wk);
  ok(wk[0].act === 'pastOpen' && wk[0].date === '2026-09-21' && wk[0].add, 'Monday (empty, past) opens "log a workout for this date" and is marked +', wk[0]);
  ok(wk[1].act === 'wkOpen' && wk[3].act === 'wkOpen' && wk[4].act === 'wkGo', 'logged days open History, days ahead open Today (unchanged)');
  const plus = await ev(() => getComputedStyle(document.querySelector('#wkbar .w.add .dn'), '::after').content);
  ok(plus === '"+"', 'the empty past day shows a small + on its disc', plus);

  // ---- 53: date first, then the routine day that was due on that date.
  await page.click('#wkbar .w.add[data-date="2026-09-21"]'); await page.waitForTimeout(100);
  const sh = await ev(() => { const m = window.__ironlog.ui.modal; const b = [...document.querySelectorAll('#modal [data-act="pastGo"]')]; return { kind: m && m.kind, date: document.querySelector('#modal [data-pbind="date"]').value, max: document.querySelector('#modal [data-pbind="date"]').max, first: b[0].innerText.replace(/\n/g, ' '), primary: b[0].classList.contains('primary'), last: b[b.length - 1].dataset.day, n: b.length, h: document.querySelector('#modal h3').innerText }; });
  ok(sh.kind === 'past' && sh.date === '2026-09-21' && sh.max === '2026-09-24', 'the sheet opens on the tapped date and allows nothing after today', sh);
  // Last session on or before Mon 21 is Sat 19 (Arms, Day 6); Day 7 is rest, so Day 1 Chest was due.
  ok(/^Day 1: Chest/.test(sh.first) && /due then/.test(sh.first) && sh.primary, 'the day that was due then comes first and is the main button', sh.first);
  ok(sh.last === 'free' && sh.n === 7, 'the other training days and Freestyle follow (6 days + Freestyle)', sh);
  // Changing the date re-reads what was due and what is already logged.
  await page.fill('#modal [data-pbind="date"]', '2026-09-23'); await page.dispatchEvent('#modal [data-pbind="date"]', 'change'); await page.waitForTimeout(60);
  const sh2 = await ev(() => ({ first: document.querySelector('#modal [data-act="pastGo"]').innerText.replace(/\n/g, ' '), on: (document.querySelector('#modal .sheet p.small') || {}).innerText || '' }));
  ok(/Already logged that day: Legs A/.test(sh2.on) && /^Day 4: Shoulders/.test(sh2.first), 'another date: what is already logged there, and the day after it is due', sh2);
  await page.fill('#modal [data-pbind="date"]', '2026-09-30'); await page.dispatchEvent('#modal [data-pbind="date"]', 'change'); await page.waitForTimeout(60);
  ok(await ev(() => window.__ironlog.ui.modal.date === '2026-09-23'), 'a future date is refused');
  await page.fill('#modal [data-pbind="date"]', '2026-09-21'); await page.dispatchEvent('#modal [data-pbind="date"]', 'change'); await page.waitForTimeout(60);

  const beforeBench = await ev(() => { const L = window.__ironlog; return L.IDX().byEx.bench.filter(x => x.date <= '2026-09-21').slice(-1)[0].date; });
  await page.click('#modal [data-act="pastGo"][data-day="0"]'); await page.waitForTimeout(150);
  const d0 = await ev(() => { const d = window.__ironlog.state.draft; const b = d.ex.find(x => x.exId === 'bench'); return { past: d.past, date: d.date, started: d.startedAt, day: d.dayName, kick: document.querySelector('.ph .kick').textContent, meta: document.querySelector('.ph .meta').innerText, checkin: !!document.querySelector('[data-mkey="checkin"],[data-sk="logger:checkin"]') || /Check-in/.test(document.getElementById('view').innerText), rest: document.querySelectorAll('[data-act="tStart"]').length, last: b.last, tab: window.__ironlog.ui.tab, modal: !!window.__ironlog.ui.modal }; });
  ok(d0.past === true && d0.date === '2026-09-21' && d0.started === null && d0.day === 'Chest', 'a Chest session dated Monday, with no clock running', d0);
  ok(/Past workout/.test(d0.kick) && /Mon, Sep 21, 2026/.test(d0.meta), 'the header says it is a past workout and for which date', d0);
  ok(!d0.checkin && d0.rest === 0, 'quick entry: no check-in and no rest timer buttons', d0);
  ok(d0.last.includes(`(${await ev(d => new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), beforeBench)})`), 'last time is read as of that date', { last: d0.last, want: beforeBench });

  // Typing reps ticks the set (auto-mark is off in Settings), and no timer starts.
  ok(await ev(() => !window.__ironlog.state.settings.autoDone), 'auto-mark is off in Settings for this check');
  await page.fill('.sg input[data-f="r"][data-b="0"][data-s="0"]', '8'); await page.dispatchEvent('.sg input[data-f="r"][data-b="0"][data-s="0"]', 'change'); await page.waitForTimeout(80);
  const t1 = await ev(() => ({ done: window.__ironlog.state.draft.ex[0].sets[0].done, timer: !document.getElementById('timer').hidden }));
  ok(t1.done && !t1.timer, 'typed reps count as done in quick entry, and no rest timer starts', t1);
  // The rest of the first exercise in one pass.
  const nSets = await ev(() => window.__ironlog.state.draft.ex[0].sets.length);
  for (let i = 1; i < nSets; i++) { await page.fill(`.sg input[data-f="r"][data-b="0"][data-s="${i}"]`, '7'); await page.dispatchEvent(`.sg input[data-f="r"][data-b="0"][data-s="${i}"]`, 'change'); await page.waitForTimeout(40); }
  ok(await ev(() => window.__ironlog.state.draft.ex[0].sets.every(s => s.done)), 'every typed set is done');

  // Finish: saved under Monday, next up unchanged, recap says the date.
  await ev(() => window.scrollTo(0, document.body.scrollHeight));
  await page.click('[data-act="finish"]'); await page.waitForTimeout(150);
  // A load left as prefilled is fine; if the blank-load check asks, accept.
  if (await ev(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind === 'confirm')) { await page.click('[data-act="mOk"]'); await page.waitForTimeout(120); }
  const fin = await ev(() => { const L = window.__ironlog; const m = L.ui.modal; const s = L.state.sessions.filter(x => x.date === '2026-09-21'); return { kind: m && m.kind, lines: m && m.lines, n: s.length, dur: s[0] && s[0].durMin, draft: !!L.state.draft }; });
  ok(fin.kind === 'recap' && fin.n === 1 && !fin.draft && fin.dur === null, 'saved as a Monday session with no duration', fin);
  ok(fin.lines && /^Saved under Mon, Sep 21, 2026/.test(fin.lines[0]), 'the recap says where it went', fin.lines);
  await page.click('#modal [data-act="mClose"]').catch(() => ev(() => window.__ironlog.ACT.mClose())); await page.waitForTimeout(60);
  const nx = await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); return { hero: document.querySelector('.hero h2').textContent, mon: document.querySelector('#wkbar .w').dataset.act, hist: [...L.state.sessions].sort((a, b) => a.date < b.date ? -1 : 1).map(s => s.date).indexOf('2026-09-21') }; });
  ok(nx.hero === 'Legs B: posterior', 'next up is still the day after the latest session (Legs B after Thursday\'s Shoulders)', nx);
  ok(nx.mon === 'wkOpen' && nx.hist > 0, 'Monday now opens its session in History, and it sits in date order', nx);

  // ---- Suggestions and PRs as of a date, directly.
  const asOf = await ev(() => {
    const L = window.__ironlog; const all = L.IDX().byEx.bench; const mid = all[Math.floor(all.length / 2)].date;
    const plan = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 90, inc: 2.268 };
    const now = L.suggest('bench', plan), then = L.suggest('bench', plan, { before: mid });
    const lastThen = all.filter(x => x.date <= mid).slice(-1)[0];
    // A set as heavy as the current best is not a PR today, but is on a date before that best was set.
    const best = all.reduce((a, x) => x.best != null && (!a || x.best > a.best) ? x : a, null);
    const top = best.pts.reduce((a, p) => p.load > a.load ? p : a, best.pts[0]);
    const set = { w: top.w, r: top.r, rir: 0, warm: false, drop: false, done: true };
    const firstDate = all[0].date;
    return { nowLast: now.last, thenLast: then.last, lastThenDate: lastThen.date, prNow: L.livePR('bench', set, L.today()), prBefore: L.livePR('bench', { ...set, r: top.r + 1 }, addDaysX(best.date, -1)), prFirst: L.livePR('bench', set, addDaysX(firstDate, -1)), bestDate: best.date };
    function addDaysX(s, n) { const [a, b, c] = s.split('-').map(Number); const d = new Date(a, b - 1, c + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  });
  ok(asOf.nowLast !== asOf.thenLast, 'a past date gets a different "Last" from today', asOf);
  ok(asOf.prNow === null && asOf.prBefore !== null, 'a set that is not a PR today is one on a date before the best was set', asOf);
  ok(asOf.prFirst === null, 'before the first bench session there is nothing to beat, so no PR (same as a first exposure today)', asOf);

  // ---- History: Log a past workout, Freestyle.
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); });
  ok(await ev(() => !!document.querySelector('.ph [data-act="pastOpen"]')), 'History has Log a past workout at the top');
  await page.click('.ph [data-act="pastOpen"]'); await page.waitForTimeout(80);
  ok(await ev(() => document.querySelector('#modal [data-pbind="date"]').value === '2026-09-23'), 'from History it starts on yesterday');
  await page.click('#modal [data-act="pastGo"][data-day="free"]'); await page.waitForTimeout(120);
  const fr = await ev(() => { const L = window.__ironlog; const d = L.state.draft; return { free: d.free, past: d.past, date: d.date, routineId: d.routineId, picker: L.ui.modal && L.ui.modal.kind, tab: L.ui.tab }; });
  ok(fr.free && fr.past && fr.date === '2026-09-23' && fr.routineId === '' && fr.picker === 'picker' && fr.tab === 'today', 'Freestyle: a past freestyle session with the exercise picker open', fr);
  await page.click('#modal [data-act="mClose"]'); await page.waitForTimeout(60);

  // ---- 60: a blank session discards at once, from the bottom too.
  const bot = await ev(() => { const v = [...document.querySelectorAll('[data-act="discard"]')]; return { n: v.length, bottom: !!document.querySelector('.fin-row [data-act="discard"]') }; });
  ok(bot.n === 2 && bot.bottom, 'Discard at the top and beside Finish', bot);
  await ev(() => window.scrollTo(0, document.body.scrollHeight));
  await page.click('.fin-row [data-act="discard"]'); await page.waitForTimeout(100);
  ok(await ev(() => window.__ironlog.state.draft === null && !window.__ironlog.ui.modal), 'a blank session is discarded without asking');
  ok(/Session discarded/.test(await ev(() => document.getElementById('toast').innerText)), 'and says so');

  // A lighter day (with the note the app wrote) is still blank; cardio minutes are not.
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); window.scrollTo(0, 0); });
  await page.click('.hero [data-act="startSession"][data-light="1"]'); await page.waitForTimeout(120);
  await page.click('.ph [data-act="discard"]'); await page.waitForTimeout(80);
  ok(await ev(() => window.__ironlog.state.draft === null), 'the app\'s own note on a lighter day does not count as entered');
  await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(120);
  await ev(() => { const d = window.__ironlog.state.draft; d.cardio.push({ id: 'c1', kind: 'bike', min: 10, hr: null, when: 'pre' }); });
  await page.click('.ph [data-act="discard"]'); await page.waitForTimeout(80);
  ok(await ev(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind === 'confirm' && !!window.__ironlog.state.draft), 'cardio minutes entered: Discard asks first');
  await page.click('#modal [data-act="mClose"]'); await page.waitForTimeout(40);
  await ev(() => { window.__ironlog.state.draft.cardio = []; window.__ironlog.state.draft.notes = 'Left knee a bit sore'; });
  await page.click('.ph [data-act="discard"]'); await page.waitForTimeout(80);
  ok(await ev(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind === 'confirm'), 'a note of your own: Discard asks first');
  await page.click('#modal [data-act="mOk"]'); await page.waitForTimeout(80);
  ok(await ev(() => window.__ironlog.state.draft === null), 'and confirming discards');

  // Replacing a session in progress from the week bar asks only when something was entered.
  await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(120);
  await page.fill('.sg input[data-f="r"][data-b="0"][data-s="0"]', '9'); await page.waitForTimeout(40);
  await ev(() => { const L = window.__ironlog; L.ACT.pastOpen({ dataset: { date: '2026-09-21' } }); });
  await page.waitForTimeout(60);
  await page.click('#modal [data-act="pastGo"][data-day="1"]'); await page.waitForTimeout(80);
  ok(await ev(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind === 'confirm' && !window.__ironlog.state.draft.past), 'a session with reps typed is not replaced without asking');
  await page.click('#modal [data-act="mOk"]'); await page.waitForTimeout(100);
  ok(await ev(() => window.__ironlog.state.draft.past && window.__ironlog.state.draft.dayName === 'Back'), 'confirming starts the past Back session');
  await ev(() => { window.__ironlog.state.draft = null; window.__ironlog.saveNow(); window.__ironlog.render(); });

  // ---- 59: after a swap to a lift with no history, the grey number still works.
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); window.scrollTo(0, 0); });
  await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(120);
  await ev(() => document.querySelector('[data-act="bMenu"][data-b="0"]').click()); await page.waitForTimeout(50);
  await page.click('[data-op="bSwap"]'); await page.waitForTimeout(80);
  const cand = await ev(() => { const L = window.__ironlog; const e = L.state.exercises.find(x => !x.archived && !x.timed && !x.bw && x.primary === L.EX(L.state.draft.ex[0].exId).primary && x.id !== L.state.draft.ex[0].exId && !L.IDX().byEx[x.id]); return e.name; });
  await page.fill('#pickQ', cand); await page.waitForTimeout(60);
  const pickId = await ev(() => { const p = document.querySelector('#pickList .pick[data-ex]'); return p && p.dataset.ex; });
  ok(!!pickId && await ev(id => !window.__ironlog.IDX().byEx[id], pickId), 'swap target has no history: ' + pickId);
  await page.click(`#pickList .pick[data-ex="${pickId}"]`); await page.waitForTimeout(700);
  const sw = await ev(() => { const b = window.__ironlog.state.draft.ex[0]; return { ex: b.exId, lastR: b.lastR, repMin: b.plan.repMin, ph: [...document.querySelectorAll('.sg input[data-f="r"][data-b="0"]')].map(i => i.placeholder) }; });
  ok(sw.ex === pickId && sw.lastR.length === 0 && sw.ph.every(p => p === String(sw.repMin)), 'no history: every grey number is the bottom of the planned range', sw);
  await page.fill('.sg input[data-f="r"][data-b="0"][data-s="0"]', '11'); await page.waitForTimeout(40);
  const ph2 = await ev(() => [...document.querySelectorAll('.sg input[data-f="r"][data-b="0"]')].map(i => i.placeholder));
  ok(ph2.slice(1).every(p => p === '11'), 'typing reps on a set makes them the grey number of the sets below', ph2);
  await page.dispatchEvent('.sg input[data-f="r"][data-b="0"][data-s="0"]', 'change');
  await ev(() => document.querySelector('[data-act="sDone"][data-b="0"][data-s="0"]').click()); await page.waitForTimeout(40);
  await ev(() => document.querySelector('[data-act="sDone"][data-b="0"][data-s="1"]').click()); await page.waitForTimeout(60);
  const s1 = await ev(() => { const s = window.__ironlog.state.draft.ex[0].sets[1]; return { done: s.done, r: s.r, toast: document.getElementById('toast').innerText }; });
  ok(s1.done && s1.r === 11 && !/Enter reps first/.test(s1.toast), 'the checkmark on an empty row takes the grey number (no "Enter reps first")', s1);
  // Auto-mark: the keyboard's Next on an empty field takes it too.
  await ev(() => { window.__ironlog.state.settings.autoDone = true; });
  await page.focus('.sg input[data-f="r"][data-b="0"][data-s="2"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  const s2 = await ev(() => { const s = window.__ironlog.state.draft.ex[0].sets[2]; return { done: s.done, r: s.r }; });
  ok(s2.done && s2.r === 11, 'auto-mark on Next takes the grey number after a swap', s2);
  // A warm-up has no grey number and still asks.
  await ev(() => { window.__ironlog.state.settings.autoDone = false; const b = window.__ironlog.state.draft.ex[0]; b.sets.push({ w: null, r: null, rir: null, warm: true, drop: false, done: false }); window.__ironlog.render(); });
  const wi = await ev(() => window.__ironlog.state.draft.ex[0].sets.length - 1);
  await ev(i => document.querySelector(`[data-act="sDone"][data-b="0"][data-s="${i}"]`).click(), wi); await page.waitForTimeout(60);
  ok(await ev(i => !window.__ironlog.state.draft.ex[0].sets[i].done && /Enter reps first/.test(document.getElementById('toast').innerText), wi), 'a warm-up row with no reps still asks for them');

  // ---- Reload keeps a past draft as a past draft.
  await ev(() => { const L = window.__ironlog; L.state.draft = null; L.ACT.pastOpen({ dataset: { date: '2026-09-21' } }); });
  await page.click('#modal [data-act="pastGo"][data-day="2"]'); await page.waitForTimeout(100);
  await ev(() => window.__ironlog.saveNow());
  await page.reload(); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await page.waitForTimeout(100);
  const rl = await ev(() => { const d = window.__ironlog.state.draft; return { past: d && d.past, date: d && d.date, kick: document.querySelector('.ph .kick').textContent }; });
  ok(rl.past === true && rl.date === '2026-09-21' && /Past workout/.test(rl.kick), 'a past draft survives a reload', rl);
  const lv = await ev(() => { const w = [...document.querySelectorAll('#wkbar .w')]; return { mon: w[0].classList.contains('live'), monAct: w[0].dataset.act, thu: w[3].classList.contains('live') }; });
  ok(lv.mon && !lv.thu && lv.monAct === 'wkGo', 'the week bar marks the past session on its own date, and tapping it opens the session', lv);
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); });
  await page.click('#wkbar .w.live'); await page.waitForTimeout(80);
  ok(await ev(() => window.__ironlog.ui.tab === 'today' && /Past workout/.test(document.querySelector('.ph .kick').textContent)), 'from another tab, the marked day goes back to the session');
  await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });

  // ---- 57: the Today card follows the theme; the rest-timer bar stays inked.
  const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  const heroIn = async th => { await ev(t => { const L = window.__ironlog; L.state.settings.theme = t; L.ui.tab = 'today'; L.render(); }, th); await page.waitForTimeout(60); return ev(() => { const h = document.querySelector('.hero'); const cs = getComputedStyle(h); const r = getComputedStyle(document.documentElement); return { bg: r.getPropertyValue('--hero').trim(), fg: cs.color, h2: getComputedStyle(h.querySelector('h2')).color, dock: r.getPropertyValue('--dock').trim(), ring: getComputedStyle(h.querySelector('.ring .rp')).stroke }; }); };
  const hl = await heroIn('light'), hd = await heroIn('dark');
  const hexLum = h => lum('rgb(' + [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',') + ')');
  ok(hexLum(hl.bg) > 0.9 && lum(hl.h2) < 0.05, 'light theme: the Today card is light with dark text', hl);
  ok(hexLum(hd.bg) < 0.02 && lum(hd.h2) > 0.8, 'dark theme: the Today card stays dark with light text', hd);
  ok((1.05) / (lum(hl.ring) + 0.05) >= 3, 'light theme: the week ring keeps 3:1 against the card', hl.ring);
  await ev(() => { const L = window.__ironlog; L.state.settings.theme = 'light'; L.render(); });
  const dock = await ev(() => { const L = window.__ironlog; L.ACT.startSession({ dataset: { day: '0' } }); L.ACT.tStart({ dataset: { b: '0' } }); const t = document.getElementById('timer'); return { hidden: t.hidden, color: getComputedStyle(t).color }; });
  ok(!dock.hidden && lum(dock.color) > 0.8, 'light theme: the rest timer bar is still dark with light text', dock);
  await ev(() => { const L = window.__ironlog; L.ACT.tStop(); L.state.draft = null; L.saveNow(); L.render(); });

  // ---- 62: less text for a new user.
  const N = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-24T18:00:00' });
  const nev = (f, a) => N.page.evaluate(f, a);
  // r22: the first run is its own Set up page. Item 62 still holds there: short lines, no paragraphs.
  // r31.2: where accounts exist (the build) the first page comes before it: three short lines on what the
  // app does and one sentence on the account (V asked for both), still well under a paragraph each.
  if (await nev(() => { const p = document.getElementById('obPage'); return p && p.dataset.step === 'acct'; })) {
    // r33: the first page's tour holds five slides and a small picture of each screen. What a person reads is what
    // is on the screen, outside those pictures (aria-hidden, sample numbers); the other slides are a swipe away.
    // Each slide's own lines are checked in tests/r33.js.
    await N.page.waitForTimeout(400);
    const first = await nev(() => [...document.querySelectorAll('#obPage *')].filter(e => e.children.length === 0 && e.textContent.trim() && !e.closest('[aria-hidden="true"]') && (r => r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight)(e.getBoundingClientRect())).map(e => e.textContent.trim()));
    ok(first.every(t => t.length <= 110) && first.join(' ').length < 420, 'first page: short lines, one sentence at most each (' + first.join(' ').length + ' characters)', first.filter(t => t.length > 110));
    await nev(() => document.querySelector('#obPage [data-act="obAcctLater"]').click()); await new Promise(r => setTimeout(r, 200));
  }
  const lines = await nev(() => [...document.querySelectorAll('#obPage *')].filter(e => e.children.length === 0 && e.textContent.trim()).map(e => e.textContent.trim()));
  ok(lines.length && lines.every(t => t.length <= 45) && lines.join(' ').length < 400, 'Set up page: every line is short, no paragraphs (' + lines.join(' ').length + ' characters)', lines.filter(t => t.length > 45));
  await nev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'today'; L.render(); document.querySelectorAll('#view details.sec').forEach(d => d.open = true); });
  const nt = await nev(() => ({ subs: [...document.querySelectorAll('.sec>summary .sec-s')].map(e => e.textContent.trim()), fs: getComputedStyle(document.querySelector('.sec-s')).fontSize, preview: [...document.querySelectorAll('[data-mkey="session"] p')].map(p => p.textContent.trim()).filter(Boolean), body: (document.querySelector('[data-mkey="body"] .sec-b') || {}).innerText || '' }));
  ok(nt.subs.every(x => !x || /\d|on target|below|none|optional|Not logged|Act now|Note|On track|One change/i.test(x)) && !nt.subs.includes('streak, PRs, volume'), 'Today: every section subtitle is a number or a state', nt.subs);
  ok(nt.fs === '12px', 'section subtitles are smaller (12 px)', nt.fs);
  ok(nt.preview.filter(t => /No history yet/.test(t)).length === 0 && nt.preview.filter(t => /First time/.test(t)).length === 1, 'workout preview: one line for a first session instead of one per exercise', nt.preview);
  ok(!/Used for pull-ups/.test(nt.body), 'Body: the explanation is a tip, not a sentence');
  await nev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.render(); });
  const st = await nev(() => document.querySelector('#view .card').innerText.replace(/\s+/g, ' '));
  ok(st.length < 100 && /No sessions yet/.test(st), 'Stats with no sessions: one short line, the rest in a tip', st);
  await nev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); document.querySelectorAll('#view details.sec').forEach(d => d.open = true); });
  ok(await nev(() => !/Drag ⠿ to reorder days/.test(document.getElementById('view').innerText) && !/drag into a day/.test(document.getElementById('view').innerText)), 'Plan: drag hints moved into tips');
  ok(await nev(() => !document.querySelector('#wkbar .w.add') && [...document.querySelectorAll('#wkbar .w')].every(w => w.tagName === 'BUTTON')), 'a brand-new week bar shows no + marks, but every day is still a button');

  // ---- 58 (reworked in r25, moved to the menu in r27, back in Settings too in
  // r28 at V's request): Report a problem is in the menu at the top right of
  // every tab and in Settings, Help, near the bottom.
  await nev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); });
  ok(await nev(() => !!document.querySelector('#view > [data-mkey="help"] [data-act="fbOpen"][data-cat="bug"]') && !document.querySelector('[data-mkey="feedback"]')), 'Settings, Help has Report a problem');
  await nev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); });
  await N.page.click('#saveState'); await N.page.waitForTimeout(80);
  ok(await nev(() => { const r = [...document.querySelectorAll('#modal .mnu')].map(b => b.textContent.replace('›', '').trim()); return r[0] === 'Report a problem' && r.includes('Guide') && !document.querySelector('#modal [data-act="fbInbox"]'); }), 'the menu: Report a problem first, the Guide, no inbox without an owner account');
  await N.page.click('#modal .mnu[data-act="fbOpen"]'); await N.page.waitForTimeout(80);
  const hasSvc = await nev(() => !!window.ironlogFeedback);
  if (hasSvc) {
    // The standalone build, signed out: reports need an account (V's choice, r25).
    const so = await nev(() => { const m = document.getElementById('modal'); return { t: m.innerText, signin: !!m.querySelector('[data-act="acctOpen"][data-mode="signin"]'), copy: !!m.querySelector('[data-act="fbCopy"]'), box: !!m.querySelector('[data-fbind="msg"]') }; });
    ok(/Report a problem/.test(so.t) && /Sign in to send a report/.test(so.t) && so.signin && so.copy && !so.box, 'signed out: asks to sign in, with Copy the details for a message', so);
  } else {
    const fb0 = await nev(() => { const m = window.__ironlog.ui.modal; return { kind: m.kind, from: m.from, title: document.getElementById('fbH').textContent, cats: [...document.querySelectorAll('#modal [data-act="fbCat"]')].map(b => b.textContent), btn: document.querySelector('#modal [data-act="fbSend"]').textContent, tip: document.querySelector('#modal .tipi').dataset.tip, count: document.getElementById('fbCount').textContent }; });
    ok(fb0.kind === 'feedback' && fb0.from === 'history' && fb0.title === 'Report a problem' && fb0.cats.join() === 'Problem,Question,Suggestion' && fb0.count === '0 / 1000', 'the sheet: Report a problem, Problem first, a character count, and the screen you came from', fb0);
    ok(/Never your workouts/.test(fb0.tip) && /app owner/.test(fb0.tip), 'it says what is attached, and that it goes to the app owner');
    await N.page.fill('#modal [data-fbind="msg"]', 'too short'); await N.page.click('#modal [data-act="fbSend"]'); await N.page.waitForTimeout(60);
    ok(/10 characters or more/.test(await nev(() => window.__ironlog.ui.modal.err || '')), 'a report under 10 characters is refused');
    ok(await nev(() => +document.querySelector('#modal [data-fbind="msg"]').getAttribute('maxlength') === 1000), 'the text stops at 1,000 characters');
    await N.page.fill('#modal [data-fbind="msg"]', 'The chart on Stats is blank'); await N.page.click('#modal [data-act="fbCat"][data-v="idea"]'); await N.page.waitForTimeout(40);
    ok(await nev(() => document.querySelector('#modal [data-fbind="msg"]').value === 'The chart on Stats is blank' && /Suggest something/.test(document.getElementById('fbH').textContent) && /Your suggestion/.test(document.getElementById('modal').innerText) && document.getElementById('fbCount').textContent === '27 / 1000'), 'switching the kind keeps the text and changes the title and question');
    ok(await nev(() => !document.querySelector('#modal [data-fbind="reply"]')), 'no reply address to type: replies go to the account email');
    // A picked screenshot is shrunk to a JPEG; a file over 10 MB or not an image is refused.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
    await N.page.setInputFiles('#fbShot', { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }); await N.page.waitForTimeout(150);
    ok(await nev(() => !window.__ironlog.ui.modal.shot && /Only an image/.test(document.getElementById('toast').innerText)), 'a file that is not an image is refused, with a message');
    await N.page.setInputFiles('#fbShot', { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(11 * 1048576) }); await N.page.waitForTimeout(200);
    ok(await nev(() => !window.__ironlog.ui.modal.shot && /over 10 MB/.test(document.getElementById('toast').innerText)), 'an image over 10 MB is refused, with a message');
    await N.page.setInputFiles('#fbShot', { name: 'shot.png', mimeType: 'image/png', buffer: png }); await N.page.waitForTimeout(300);
    ok(await nev(() => /^data:image\/jpeg;base64,/.test(window.__ironlog.ui.modal.shot || '') && !!document.querySelector('#modal .fbshot img')), 'a screenshot from the phone is attached as a small JPEG, with a preview and Remove');
    await N.page.click('#modal [data-act="fbSend"]'); await N.page.waitForTimeout(200);
    const fb1 = await nev(() => { const m = window.__ironlog.ui.modal; return { kind: m && m.kind, sent: m && m.sent, text: m && m.text }; });
    ok((fb1.kind === 'feedback' && fb1.sent) || (fb1.kind === 'text' && /Ironlog: Suggest something/.test(fb1.text) && /"build"/.test(fb1.text) && /"errors"/.test(fb1.text)), 'without the service: the report is copied, or shown to copy, with the build and recent errors', fb1);
  }
  await nev(() => window.__ironlog.ACT.mClose());
  // From an exercise's ⋯ menu the exercise is attached.
  await nev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); L.ACT.startSession({ dataset: { day: '0' } }); });
  await nev(() => document.querySelector('[data-act="bMenu"][data-b="0"]').click()); await N.page.waitForTimeout(60);
  ok(await nev(() => { const b = document.querySelector('#modal [data-op="fbOpen"]'); return !!b && /Report a problem/.test(b.textContent); }), 'an exercise\'s ⋯ menu has Report a problem');
  await N.page.click('#modal [data-op="fbOpen"]'); await N.page.waitForTimeout(80);
  const fb2 = await nev(() => { const L = window.__ironlog; const m = L.ui.modal; return { kind: m.kind, ex: m.ex, from: m.from, want: L.EX(L.state.draft.ex[0].exId).name }; });
  ok(fb2.kind === 'feedback' && fb2.ex === fb2.want && fb2.from === 'session', 'from a session: the exercise and "session" are attached', fb2);
  await nev(() => { const L = window.__ironlog; L.ACT.mClose(); L.state.draft = null; L.saveNow(); L.render(); });
  ok(N.errors.length === 0, 'no page errors (new user)', N.errors);
  await N.browser.close();

  ok(A.errors.length === 0, 'no page errors', A.errors);
  await A.browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e.message); process.exit(1); });
