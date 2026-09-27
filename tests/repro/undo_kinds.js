// Undo must reverse exactly the last destructive action: an import, an erase,
// removing an exercise from the session in progress, and a history delete
// followed by a new weigh-in (which must survive the undo).
const path = require('path');
const { open } = require(path.join(__dirname, '..', 'h.js'));
const P = path.join(__dirname, '..', '..', 'index.html');
(async () => {
  const { browser, page, errors } = await open(P, { clock: '2026-09-20T10:00:00' });
  const out = await page.evaluate(async () => {
    const L = window.__ironlog; const R = L.state.routines[0];
    const mk = (id, date) => ({ id, date, dayIdx: 0, dayId: R.days[0].id, dayName: 'Chest', routineId: R.id, notes: '', ex: [{ exId: 'bench', sets: [{ w: 100, r: 8, rir: 2 }] }] });
    const ids = () => L.state.sessions.map(s => s.id).sort().join(',');
    const res = {};
    L.state.sessions.push(mk('a', '2026-09-10'), mk('b', '2026-09-12')); L.invalidate(); L.saveNow();
    // 1. Erase everything, then undo.
    L.snapshot(); L.state = L.normalize(null); L.saveNow(); res.erased = ids();
    L.ACT.undo(); res.afterEraseUndo = ids();
    // 2. Import (replace) then undo: the imported session must go, the old ones return.
    L.snapshot(); L.state = L.normalize({ ...L.state, sessions: [mk('imp', '2026-09-15')] }); L.saveNow(); res.imported = ids();
    L.ACT.undo(); res.afterImportUndo = ids();
    // 3. Delete a session, log a bodyweight, undo: session back, weigh-in kept.
    L.snapshot(); L.state.trash.unshift({ id: 'a', kind: 'session', date: '2026-09-20', data: L.state.sessions.find(s => s.id === 'a') });
    L.state.sessions = L.state.sessions.filter(s => s.id !== 'a'); L.invalidate(); L.saveNow();
    L.state.bodyweights.push({ id: 'bw1', date: '2026-09-20', kg: 80 }); L.saveNow();
    L.ACT.undo(); res.afterDeleteUndo = ids(); res.bwKept = L.state.bodyweights.some(b => b.id === 'bw1'); res.trashA = L.state.trash.some(t => t.id === 'a');
    return res;
  });
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
