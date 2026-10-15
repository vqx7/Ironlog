// r47: why a target is what it is, in the engine's own words (V, 2026-10-15:
// progressive overload should be easy, customizable, and accurate, and the
// lifters he asked wanted the suggestion's reasoning traceable).
//
// The engine always worked out a sentence for each suggestion and wrote it to
// b.hint. Until r47 the lifter saw it only when there was no target at all,
// which is the rare case; with a target on screen, the number stood alone with
// no rule behind it. whyTarget(b) is that same sentence, less the Last line the
// screen already shows, so there is no second account of the rules to drift.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 500) : ''); } else console.log('ok  ', m); };
const CLOCK = '2026-10-15T10:00:00';

(async () => {
  const { engine } = require('./h');
  const browser = await engine.launch();

  // ---- 1. Every exercise with a target explains it, in the engine's words.
  {
    const P = await open('index.html', { browser, clock: CLOCK });
    const r = await P.page.evaluate(() => { const L = window.__ironlog;
      L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); L.render();
      document.querySelector('[data-act="startSession"]').click(); L.render();
      return L.state.draft.ex.map((b, i) => {
        const tip = document.querySelector(`#blk-${i} .hint .tipi`);
        return { lift: L.EX(b.exId).name, target: !!b.target, why: L.whyTarget(b),
          shown: tip && tip.getAttribute('data-tip'), label: tip && tip.getAttribute('aria-label'),
          hint: b.hint || '', last: b.last || '' };
      });
    });
    const withT = r.filter(x => x.target);
    ok(withT.length >= 3, 'the demo session has targets to explain', withT.length);
    ok(withT.every(x => x.shown && x.shown === x.why), 'every target carries its reason, exactly as the engine wrote it', withT.filter(x => x.shown !== x.why).slice(0, 2));
    ok(withT.every(x => x.label === 'Why this target'), 'behind an i, named Why this target', withT.map(x => x.label).slice(0, 3));
    // The reason is the engine's sentence with the Last line taken off, never re-worded.
    ok(withT.every(x => x.hint.includes(x.why) || x.why === x.hint), 'the reason is part of the engine\'s own sentence, not a retelling', withT.filter(x => !x.hint.includes(x.why)).slice(0, 2));
    ok(withT.every(x => !x.last || !x.why.startsWith(x.last)), 'and it does not repeat the Last line the screen already shows', withT.filter(x => x.last && x.why.startsWith(x.last)).slice(0, 2));
    // What a lifter actually wants to know: when does the load go up.
    ok(withT.some(x => /add load|add \d|aim for/.test(x.why)), 'it says what makes the load go up next', withT.map(x => x.why.slice(0, 70)).slice(0, 3));
    ok(!P.errors.length, 'no page errors (session)', P.errors);
    await P.ctx.close();
  }

  // ---- 2. A target that came from an earlier full session says so, as the old tip did.
  {
    const P = await open('index.html', { browser, clock: CLOCK });
    const r = await P.page.evaluate(() => { const L = window.__ironlog;
      L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); L.render();
      document.querySelector('[data-act="startSession"]').click();
      const lift = L.state.draft.ex[0].exId;
      // The lift's newest session becomes a deload, so the target must come from the one before.
      const ss = L.sortedSessions().filter(x => x.ex.some(b => b.exId === lift));
      ss[ss.length - 1].deload = true;
      L.state = L.normalize(L.state); L.invalidate(); L.state.draft = null; L.saveNow(); L.render();
      document.querySelector('[data-act="startSession"]').click(); L.render();
      const i = L.state.draft.ex.findIndex(x => x.exId === lift); const b = L.state.draft.ex[i];
      const tip = document.querySelector(`#blk-${i} .hint .tipi`);
      return b && b.basis ? { why: L.whyTarget(b), basis: b.basis, shown: tip && tip.getAttribute('data-tip') } : null;
    });
    ok(r && /The target comes from your last full session/.test(r.why) && /deload sessions do not set one/.test(r.why) && r.shown === r.why,
      'a target from an earlier full session names its date, and says deloads do not set one', r);
    ok(!P.errors.length, 'no page errors (basis)', P.errors);
    await P.ctx.close();
  }

  // ---- 3. Stats' Next session is the same suggestion, so it carries the same reason.
  {
    const P = await open('index.html', { browser, clock: CLOCK });
    const r = await P.page.evaluate(() => { const L = window.__ironlog;
      L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.hidden = []; L.saveNow();
      L.ui.tab = 'dash'; L.ui.folds['dash:lifts'] = true; L.render();
      document.querySelectorAll('#view details').forEach(d => { d.open = true; }); L.render();
      const n = document.getElementById('nextLine'); const tip = n && n.querySelector('.tipi');
      return { line: n && n.textContent.replace(/\s+/g, ' ').trim(), why: tip && tip.getAttribute('data-tip') };
    });
    ok(r.line && /^Next session: /.test(r.line) && r.why && r.why.length > 10, 'Stats, Next session explains itself too', r);
    ok(!P.errors.length, 'no page errors (stats)', P.errors);
    await P.ctx.close();
  }

  // ---- 4. The reason follows the rule that fired, over many logs: no target is left unexplained.
  {
    const P = await open('index.html', { browser, clock: CLOCK });
    const bad = await P.page.evaluate(() => { const L = window.__ironlog; const s = L.state; s.settings.onboarded = true;
      let seed = 5; const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
      const ids = s.exercises.slice(0, 25).map(e => e.id); const out = [];
      for (let t = 0; t < 25; t++) {
        const ss = []; const n = 3 + Math.floor(rnd() * 25);
        for (let i = 0; i < n; i++) ss.push({ id: 't' + t + '_' + i, date: L.addDays(L.today(), -(i * 3 + 1)), dayName: 'A', notes: '',
          ex: [{ exId: ids[t % ids.length], rr: [6, 10], sets: Array.from({ length: 1 + Math.floor(rnd() * 4) },
            () => ({ w: 20 + Math.floor(rnd() * 40) * 2.5, r: 1 + Math.floor(rnd() * 18), rir: Math.floor(rnd() * 4), done: true })) }] });
        s.sessions = ss; L.state = L.normalize(s); L.invalidate();
        const sg = L.suggest(ids[t % ids.length], L.planFor(ids[t % ids.length]));
        if (sg && sg.target && !L.whyTarget(sg)) out.push({ t, target: sg.target });
      }
      return out; });
    ok(bad.length === 0, 'on 25 random logs, every suggestion with a target has a reason', bad.slice(0, 3));
    ok(!P.errors.length, 'no page errors (random logs)', P.errors);
    await P.ctx.close();
  }

  // ---- 5. A crash reaches the owner in one tap. The recovery screen offers
  // Report this; the report opens written with the screen and the error, marked
  // a crash, and the log it carries holds where in the code it broke. Until r47
  // the screen offered Try again and a backup, and a crash reached the owner
  // only if the lifter wrote it up by hand.
  {
    const P = await open('index.html', { browser, clock: CLOCK });
    const r = await P.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo();
      L.ui.tab = 'dash';
      // A screen that cannot be drawn: reading the log throws.
      Object.defineProperty(L.state, 'sessions', { configurable: true, get() { throw new Error('boom at render'); } });
      L.render();
      const out = { crash: /Something broke on this screen/.test(document.getElementById('view').textContent) };
      const btn = document.querySelector('#view [data-act="fbOpen"][data-crash]');
      out.btn = btn ? btn.textContent : null;
      if (btn) btn.click();
      const m = L.ui.modal || {}; out.m = { kind: m.kind, cat: m.cat, from: m.from, crash: m.crash, msg: m.msg };
      out.box = (document.querySelector('#modal [data-fbind="msg"]') || {}).value || null;
      const ctx = L.fbContext(m); out.ctx = { crash: ctx.crash, last: ctx.errors[ctx.errors.length - 1] };
      return out; });
    ok(r.crash && r.btn === 'Report this', 'the recovery screen offers Report this', r);
    ok(r.m.kind === 'feedback' && r.m.cat === 'bug' && r.m.from === 'crash' && r.m.crash === true, 'it opens a problem report marked as a crash', r.m);
    ok(/^The app broke on the Stats screen\. Error: boom at render/.test(r.m.msg) && r.box === r.m.msg, 'written already: the screen and the error, in the box', { msg: r.m.msg, box: r.box });
    const leak = await P.page.evaluate(() => { const L = window.__ironlog; const e = new Error('x'); e.stack = 'Error: x\n    at f (https://ironapp.org/index.html?v=1#access_token=SECRET&type=recovery:12:3)\n    at g (https://ironapp.org/index.html:14:5)'; L.log('test', e); return L.logBuf[L.logBuf.length - 1].s; });
    ok(!/SECRET|access_token|\?v=1/.test(leak) && /index\.html:12:3/.test(leak) && /index\.html:14:5/.test(leak), 'a kept stack holds the file and line of each frame, never the page URL\'s query or fragment (a reset link carries its token there)', leak);
    ok(r.ctx.crash === true && r.ctx.last && r.ctx.last.a === 'render' && /boom at render/.test(r.ctx.last.m) && /index\.html:\d+/.test(r.ctx.last.s || '') && /\n/.test(r.ctx.last.s), 'the context marks the crash and its last error carries the stack, naming a line in the app (WebKit\'s stack is frames only, no message line)', r.ctx);
    await P.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
