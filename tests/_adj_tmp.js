const { open } = require('./h');
(async () => {
  const P = await open('index.html', { touch: true, clock: '2026-10-10T12:00:00' });
  const r = await P.page.evaluate(async () => {
    const L = window.__ironlog; const LB = 0.45359237; L.state.settings.onboarded = true; L.state.settings.unit = 'lb'; L.state.settings.autoDone = false;
    L.state.sessions = [{ id: 'a', date: '2026-10-03', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: 185 * LB, r: 8, rir: 1, done: true })) }] }];
    L.invalidate(); L.ACT.startFree(); L.ACT.mClose();
    const d = L.state.draft; d.ex.push(L.newBlock ? L.newBlock('bench', { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 90, inc: 5 * LB }) : null); L.render();
    const b = d.ex[0]; const out = { sw: b.sw / LB };
    const tick = async (si, reps, rir) => { const inp = document.querySelector(`[data-f="r"][data-b="0"][data-s="${si}"]`); inp.value = String(reps); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); b.sets[si].rir = rir; document.querySelector(`[data-act="sDone"][data-b="0"][data-s="${si}"]`).click(); await new Promise(r => setTimeout(r, 100)); };
    await tick(0, 10, 4);
    out.after1 = { adj: b.adj, ph: [...document.querySelectorAll('[data-f="w"][data-b="0"]')].map(i => i.placeholder), rph: [...document.querySelectorAll('[data-f="r"][data-b="0"]')].map(i => i.placeholder), line: (document.getElementById('adj-0') || {}).innerText };
    return out;
  });
  console.log(JSON.stringify(r, null, 1), P.errors); await P.browser.close();
})();
