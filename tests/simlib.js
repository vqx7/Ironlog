// Whole histories of the sync, for tests/rows.js: a history is a list of the lifter's actions on two or three
// phones (tests/sim.js) with the network coming and going, written from a seed or read from a case file, and what
// a lifter would say of the log afterwards is checked each time every phone has synced. The reference is the
// lifter's rules, not the sync's own:
//   same    - every phone holds the same log;
//   quiet   - one more sync by every phone writes nothing;
//   once    - no session or cardio entry is in a log twice;
//   kept    - a session no one ever deleted is in the log;
//   back    - a session restored after its last delete, on a phone that had seen that delete, is in the log;
//   deleted - a session whose last action was a delete, with nothing done to it on another phone meanwhile, is not;
//   held    - a session ever made is in the log, in Recently deleted, or was deleted for good by an action;
//   edit    - a note edited last on a phone, with no other phone touching the session meanwhile, is the note kept;
//   date    - the date a session or workout was last given, with no other phone doing more to it meanwhile than
//             tick its sets, is its date;
//   sets    - every set ticked on any phone is in the workout's session or the open workout, once;
//   rows    - where the account has rows: they say what the log says, record by record, and no row ever went back
//             to an earlier version.
const path = require('path');
const { phoneOf, accountOf, rng } = require('./sim');
/* Two copies are the same when the app's own comparison says so (merge.ts canon: the order of fields and a unit its
   number gives are no difference). Always this checkout's, whatever build a phone of the history runs. */
let ref = null;
const canon = v => (ref = ref || phoneOf(path.join(__dirname, '..'), { name: 'ref' }).E).canon(v);

const LATER = "one phone's whole copy of a saved workout kept over a set ticked on another";
const DATES = ['2026-10-17', '2026-10-27', '2026-11-03', '2026-11-10', '2026-11-16', '2026-11-20', '2025-12-30'];
const mkSession = (id, date, note = 'start') => ({ id, date, dayIdx: 0, dayName: 'Day 1', notes: note, ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2 }, { w: 60, r: 7, rir: 2 }] }] });
/** A text of a value that is the same whatever order its fields came in. */
const stable = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(q => [q, x[q]])) : x));
const byId = a => [...a].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
/** What a lifter sees of a log: its lists, Recently deleted, the open workout and one setting. */
const view = S => ({ sessions: byId(S.sessions), cardio: byId(S.cardio), bodyweights: byId(S.bodyweights), trash: byId(S.trash.map(t => ({ id: t.id, kind: t.kind, date: t.date, clash: !!t.clash, data: t.data }))), draft: S.draft || null, userName: S.settings.userName || '' });

/** What each action does on phone `P`; true when it changed the log (an action that does not apply does nothing). */
const DO = {
  note(P, o) { const ok = P.state().sessions.some(s => s.id === o.id); if (ok) P.edit(S => { S.sessions.find(s => s.id === o.id).notes = o.v; }); return ok; },
  move(P, o) { const s = P.state().sessions.find(x => x.id === o.id); if (!s || s.date === o.v) return false; P.edit(S => { S.sessions.find(x => x.id === o.id).date = o.v; }); return true; },
  del(P, o) { const ok = P.state().sessions.some(s => s.id === o.id); if (ok) P.E.act(() => { const S = P.state(); const s = S.sessions.find(x => x.id === o.id); P.E.toTrash('session', s); S.sessions = S.sessions.filter(x => x.id !== o.id); }, { undo: true }); return ok; },
  restore(P, o) {
    const x = P.state().trash.find(t => t.id === o.id && t.kind === 'session' && !t.clash); if (!x || P.state().sessions.some(s => s.id === o.id)) return false;
    P.E.act(() => { const S = P.state(); P.E.setState(P.E.normalize({ ...S, trash: S.trash.filter(y => y !== x), sessions: [...S.sessions, x.data] })); }, { undo: true }); return true;
  },
  forgood(P, o) { const x = P.state().trash.find(t => t.id === o.id && t.kind === 'session' && !t.clash); if (!x) return false; P.E.act(() => { const S = P.state(); S.trash = S.trash.filter(y => y !== x); }, { undo: true }); return true; },
  add(P, o) { if (P.state().sessions.some(s => s.id === o.id) || P.state().trash.some(t => t.id === o.id)) return false; P.E.act(() => { const S = P.state(); P.E.setState(P.E.normalize({ ...S, sessions: [...S.sessions, mkSession(o.id, o.v, 'new')] })); }); return true; },
  bw(P, o) { P.E.act(() => { const S = P.state(); const b = S.bodyweights.find(x => x.id === o.id); if (b) b.kg = o.v; else P.E.setState(P.E.normalize({ ...S, bodyweights: [...S.bodyweights, { id: o.id, date: o.d, kg: o.v, demo: false }] })); }); return true; },
  cardio(P, o) { const ok = P.state().cardio.some(c => c.id === o.id); if (ok) P.edit(S => { S.cardio.find(c => c.id === o.id).note = o.v; }); return ok; },
  set(P, o) { P.edit(S => { S.settings.userName = o.v; }); return true; },
  // Each set with a row id of its own, as the app gives every set of a workout (session.ts), which is what two phones' copies of one workout are joined by.
  start(P, o) {
    if (P.state().draft || P.state().sessions.some(s => s.id === o.id) || P.state().trash.some(t => t.id === o.id)) return false;
    P.edit(S => { S.draft = P.E.normalize({ draft: { id: o.id, date: o.v, dayIdx: 0, dayName: 'Day 1', routineId: '', ex: [{ exId: 'squat', sets: [11, 12, 13, 14].map((r, i) => ({ w: 100, r, rir: 2, rid: o.id + 'r' + i })) }] } }).draft; }); return true;
  },
  tick(P, o) { const d = P.state().draft; const s = d && d.ex[0] && d.ex[0].sets[o.i]; if (!s || s.done) return false; P.edit(S => { S.draft.ex[0].sets[o.i].done = true; }); return true; },
  redate(P, o) { const d = P.state().draft; if (!d || d.date === o.v) return false; P.edit(S => { S.draft.date = o.v; }); return true; },
  // As the app's own Finish (workfinish.ts): the session takes the place of one of its id already in the log, and of its copy in Recently deleted.
  finish(P) {
    const d = P.state().draft; const s = d && P.E.draftSession(d); if (!s) return false;
    P.edit(S => { const sess = P.E.draftSession(S.draft); const i = S.sessions.findIndex(x => x.id === sess.id); if (i >= 0) S.sessions[i] = sess; else S.sessions.push(sess); S.trash = S.trash.filter(t => !(t.kind === 'session' && t.id === sess.id)); S.draft = null; });
    return true;
  },
  discard(P) { if (!P.state().draft) return false; P.edit(S => { S.draft = null; }); return true; }
};
const NET = new Set(['off', 'on', 'flush', 'pull', 'sync', 'race', 'wait', 'drop', 'check']);

/* One history. o.dirs: the build of each phone; o.rows: the rows' database (rowsdb.js) or 'missing' or null;
   o.script: the actions to replay, or o.seed and o.steps to write them from; o.name: the account's name in the
   rows' database. Answers { script, fails: [{ rule, id, said }], acts, C, phones, counts }. */
async function history(o) {
  const C = accountOf(o.rows === 'missing' ? { rows: { missing: true } } : o.rows ? { rows: { R: o.rows, name: o.name || 'h' } } : {});
  const clock = { t: Date.UTC(2026, 10, 22, 10) };
  const rnd = rng(o.seed || 1);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const skews = o.skews || [0, 0, 0];
  const phones = [];
  // The first phone's log, read as the app reads any log (normalize), before it ever signs in.
  const A = phoneOf(o.dirs[0], { name: 'A', clock, seed: 101, skew: skews[0] }).start(S => {
    S.sessions.push(mkSession('s1', '2026-11-16'), mkSession('s2', '2026-11-03'), mkSession('s3', '2026-10-27'), mkSession('s4', '2026-10-20'));
    S.bodyweights.push({ id: 'w1', date: '2026-11-01', kg: 80, demo: false });
    S.cardio.push({ id: 'c1', date: '2026-11-04', kind: 'run', min: 20, hr: null, when: 'solo', note: 'start', demo: false });
    S.settings.userName = 'start'; S.settings.onboarded = true;
  });
  clock.t += 2000; await A.tick(); A.signIn(C); await A.sync(); phones.push(A);
  for (let i = 1; i < o.dirs.length; i++) { const P = phoneOf(o.dirs[i], { name: 'ABC'[i], clock, seed: 101 + i, skew: skews[i] }).start(); P.signIn(C); await P.sync(); phones.push(P); }
  // What the lifter did, by record: every action that changed a log, with the phone, its place in the history and the round (the stretch between two moments when every phone had synced).
  const acts = {}; const made = new Set(['s1', 's2', 's3', 's4']); const forgood = new Set(); const raced = new Set(); const ticked = {}; const known = {}; const closed = {}; const fails = []; let round = 0, seq = 0, n = 0;
  const said = (id, p, op) => { (acts[id] = acts[id] || []).push({ p, op, round, seq: ++seq }); };
  const versions = new Map(); const seenFindings = new Set();
  const pushes = () => C.calls.filter(c => c.name === 'push').length;
  /** Every phone online and synced until a whole round of syncs writes nothing; false when that never came. */
  const settle = async () => {
    for (const P of phones) { P.off = false; P.drop = null; }
    for (let i = 0; i < 9; i++) {
      const w = C.writes.length, r = pushes();
      clock.t += 61000;
      for (const P of phones) { await P.tick(); await P.sync(); }
      if (i > 0 && C.writes.length === w && pushes() === r) return true;
    }
    return false;
  };
  const check = async () => {
    const quiet = await settle();
    const fail = (rule, id, text) => { if (!fails.some(f => f.rule === rule && f.id === id)) fails.push({ rule, id, said: text, round }); };
    if (!quiet) fail('quiet', '', 'the phones never stopped writing');
    const V = phones.map(P => view(P.state())), T = V.map(canon);
    for (let i = 1; i < phones.length; i++) if (T[i] !== T[0]) {
      const part = Object.keys(V[0]).find(k => canon(V[0][k]) !== canon(V[i][k]));
      fail('same', part, `phone A and phone ${phones[i].name} hold a different log (${part})`);
    }
    for (const P of phones) {
      const S = P.state(), live = new Set(S.sessions.map(s => s.id));
      for (const list of ['sessions', 'cardio']) { const ids = S[list].map(x => x.id); if (new Set(ids).size !== ids.length) fail('once', list, `${list} holds an id twice on ${P.name}`); }
      for (const id of made) {
        const a = acts[id] || [], dels = a.filter(x => x.op === 'del' || x.op === 'discard'), last = a[a.length - 1];
        const inTrash = S.trash.some(t => t.id === id || t.id.startsWith(id + '-'));
        if (!live.has(id) && !inTrash && !forgood.has(id) && !(S.draft && S.draft.id === id)) fail('held', id, `${id} is in no log and not in Recently deleted on ${P.name}, and no one deleted it for good`);
        if (closed[id] === 'open' || closed[id] === 'discarded' || raced.has(id)) continue;
        if (!dels.length && !live.has(id)) fail('kept', id, `${id} was never deleted and is not in the log on ${P.name}`);
        const lastDel = dels[dels.length - 1], rest = [...a].reverse().find(x => x.op === 'restore');
        if (lastDel && rest && rest.seq > lastDel.seq && !forgood.has(id)) {
          // The restore saw the delete: made in a later round, or on the phone that made it, with no delete on another phone in that round.
          const saw = rest.round > lastDel.round || dels.filter(x => x.round === rest.round).every(x => x.p === rest.p);
          const after = a.filter(x => x.seq > rest.seq && (x.op === 'del' || x.op === 'forgood'));
          if (saw && !after.length && !live.has(id)) fail('back', id, `${id} was restored after its last delete and is not in the log on ${P.name}`);
        }
        if (last && last.op === 'del' && live.has(id) && !a.some(x => x.round === last.round && x.p !== last.p)) fail('deleted', id, `${id} was deleted last, with no other phone touching it, and is in the log on ${P.name}`);
        const dated = a.filter(x => x.op === 'move' || x.op === 'redate' || x.op === 'start' || x.op === 'add'), ld = dated[dated.length - 1];
        if (ld && ld.v && live.has(id) && !a.some(x => x.round >= ld.round && x.p !== ld.p && x.op !== 'tick') && !a.some(x => x.seq > ld.seq && (x.op === 'del' || x.op === 'restore'))) {
          const got = S.sessions.find(s => s.id === id).date;
          // A saved workout moved on one phone while another, not caught up, ticked a set of it: one of the two things the documents cannot decide (below).
          if (got !== ld.v && ld.op === 'move' && a.some(x => x.op === 'tick' && x.p !== ld.p && x.round === ld.round)) known[LATER] = (known[LATER] || 0) + 1;
          else if (got !== ld.v) fail('date', id, `${id}: the date given last (${ld.v}) is not its date on ${P.name} (${got})`);
        }
        const notes = a.filter(x => x.op === 'note'), ln = notes[notes.length - 1];
        if (ln && live.has(id) && !a.some(x => x.round >= ln.round && x.p !== ln.p && x.op !== 'note-seen') && !a.some(x => x.seq > ln.seq && x.op !== 'move')) {
          const got = S.sessions.find(s => s.id === id).notes;
          if (got !== ln.v) fail('edit', id, `${id}: the note typed last (${ln.v}) is not the one kept on ${P.name} (${got})`);
        }
      }
      for (const w of Object.keys(ticked)) {
        if (closed[w] === 'discarded' || (acts[w] || []).some(x => x.op === 'del' || x.op === 'forgood')) continue;
        /* Two things the documents cannot decide, counted apart and not failed (known). They hold one open workout
           an account. And once a workout is a session
           on one phone, they hold it as that phone's copy: when the other phone, not caught up, changes the workout
           again, each phone ends with a whole copy of its own and the later one is kept, so a set only the other
           copy held is dropped (the app says "The later edit was kept."), or, the session moved to another
           half-month meanwhile, the fuller copy stays on its old date and the moved one is put aside in Recently
           deleted. That happens when the phone that tapped Finish had not seen a set the other had ticked and that
           phone ticks again before it syncs; when Finish is tapped on both; when the saved session is edited or
           moved, or the open workout's date changed, on one phone while the other ticks; and when a third phone
           ticks. The rows of the release after hold each record, and the workout, as a row of its own. */
        const a = acts[w] || [];
        const fin = a.find(x => x.op === 'finish');
        const late = fin ? new Set(a.filter(x => x.op === 'tick' && x.round === fin.round && x.p !== fin.p).map(x => x.p)) : new Set();
        const both = fin && a.some(x => x.op === 'tick' && x.p !== fin.p && x.round === fin.round && x.seq < fin.seq && a.some(y => y.op === 'tick' && y.p === x.p && y.round === fin.round && y.seq > fin.seq));
        const why = raced.has(w) ? 'two workouts started on two phones at once'
          : late.size > 1 || both || new Set(a.filter(x => x.op === 'finish').map(x => x.p)).size > 1 || a.some(x => x.op === 'tick' && a.some(y => y.round === x.round && y.p !== x.p && (y.op === 'note' || y.op === 'move' || y.op === 'restore' || y.op === 'redate'))) ? LATER
          : '';
        const reps = [...S.sessions.filter(s => s.id === w || s.id.startsWith(w + '-')).flatMap(s => s.ex.flatMap(b => b.sets.map(x => x.r))), ...(S.draft && S.draft.id === w ? S.draft.ex.flatMap(b => b.sets.filter(x => x.done).map(x => x.r)) : [])];
        for (const r of ticked[w]) {
          const k = reps.filter(x => x === r).length;
          if (k === 1) continue;
          if (why) known[why] = (known[why] || 0) + 1;
          else fail('sets', w, `workout ${w}: the set of ${r} reps, ticked, is ${k ? k + ' times' : 'not'} in its session or the open workout on ${P.name}`);
        }
      }
    }
    if (C.has && o.rows !== 'missing') {
      const P = phones[0], S = P.state(), E = P.E, rows = await C.rows();
      const want = new Map();
      const KIND = { sessions: 'session', cardio: 'cardio', bodyweights: 'bodyweight', measurements: 'measurement', routines: 'routine', exercises: 'exercise', injuries: 'injury' };
      for (const list of Object.keys(KIND)) for (const x of S[list] || []) want.set(KIND[list] + '/' + x.id, { place: 'log', body: E.canon(x) });
      for (const t of S.trash) if (!want.has(t.kind + '/' + t.id)) want.set(t.kind + '/' + t.id, { place: 'trash', body: E.canon(t.data), day: t.date, clash: !!t.clash });
      for (const k of Object.keys(S.settings)) want.set('setting/' + k, { place: 'log', body: E.canon(S.settings[k]) });
      for (const k of ['activeRoutineId', 'deloadWeek']) want.set('core/' + k, { place: 'log', body: E.canon(S[k] ?? null) });
      const mirrored = new Set([...Object.values(KIND), 'setting', 'core']);
      // The times the documents hold for each record, on any phone, and the records a phone sent over the account's copy (a finding says so).
      const LIST = Object.fromEntries(Object.entries(KIND).map(([l, k]) => [l, k]));
      const times = new Map(), over = new Set();
      for (const Q of phones) {
        for (const doc of Object.keys(Q.E.cloud.recAt)) for (const rk of Object.keys(Q.E.cloud.recAt[doc])) {
          const cut = rk.indexOf('/'), list = rk.slice(0, cut), id = rk.slice(cut + 1);
          const k = list === 'settings' ? 'setting/' + id : list === '' ? 'core/' + id : LIST[list] ? LIST[list] + '/' + id : null;
          if (k && Q.E.cloud.recAt[doc][rk] > 0) (times.get(k) || times.set(k, new Set()).get(k)).add(Q.E.cloud.recAt[doc][rk]);
        }
        for (const f of (Q.E.rowsDiag && Q.E.rowsDiag() ? Q.E.rowsDiag().findings : [])) over.add(f.key);
      }
      const placeOf = r => (r.gone_saw !== null && r.gone_saw === r.t && r.gone_saw_dev === r.dev ? (r.gone_good ? 'good' : 'trash') : 'log');
      const seen = new Set();
      for (const r of rows) {
        const k = r.kind + '/' + r.id; seen.add(k);
        const was = versions.get(k), now = [r.t, r.dev, r.a];
        if (was && (was[0] > now[0] || (was[0] === now[0] && (was[1] > now[1] || (was[1] === now[1] && was[2] > now[2]))))) fail('rows', k, `the row ${k} went back from version ${was.join(' ')} to ${now.join(' ')}`);
        versions.set(k, now);
        if (r.kind === 'draft') { const body = S.draft ? E.canon(S.draft) : 'null'; if (r.body !== body) fail('rows', k, 'the row of the open workout is not the open workout'); continue; }
        if (!mirrored.has(r.kind)) continue;
        const w = want.get(k), place = placeOf(r);
        if (!w) { if (place !== 'good') fail('rows', k, `the account holds a row for ${k} (${place}) and the log holds no such record`); continue; }
        if (place !== w.place) fail('rows', k, `${k} is in ${w.place === 'log' ? 'the log' : 'Recently deleted'} on the phone and the row says ${place}`);
        else if (r.body !== w.body) fail('rows', k, `the row of ${k} holds another copy than the log`);
        else if (place === 'log' && r.t !== 0 && !over.has(k) && times.has(k) && !times.get(k).has(r.t)) fail('rows', k, `the row of ${k} is timed ${r.t}, which is not the time the documents hold for it (${[...times.get(k)].join(', ')})`);
        else if (w.place === 'trash' && (r.gone_day !== w.day || r.gone_clash !== w.clash)) fail('rows', k, `the row of ${k} holds another day in Recently deleted than the log (${r.gone_day} against ${w.day})`);
      }
      for (const k of want.keys()) if (!seen.has(k)) fail('rows', k, `the log holds ${k} and the account has no row for it`);
      if (S.draft && !seen.has('draft/draft')) fail('rows', 'draft/draft', 'a workout is open and the account has no row for it');
      for (const Q of phones) for (const f of (Q.E.rowsDiag && Q.E.rowsDiag() ? Q.E.rowsDiag().findings : [])) {
        if (/notes were not|another checksum/.test(f.why)) fail('rows', f.key, `${Q.name}: ${f.why}`);
        /* A difference is recorded when the documents kept a copy against the order of the times, which takes two
           phones changing one record with no sync between (a clash the documents decide by their own rule). One
           recorded for a record only one phone touched in a round is the rows' own fault. */
        const id = f.key.slice(f.key.indexOf('/') + 1), a = acts[id] || [];
        const clash = a.some(x => a.some(y => y.round === x.round && y.p !== x.p));
        if (!clash && !seenFindings.has(Q.name + f.at + f.key)) fail('rows', f.key, `${Q.name} recorded a difference for ${f.key}, which no two phones changed between two syncs: ${f.why} (${f.mine} | ${f.theirs})`);
        seenFindings.add(Q.name + f.at + f.key);
      }
      for (const Q of phones) { const d = Q.E.rowsDiag && Q.E.rowsDiag(); if (d && /off \(/.test(d.line)) fail('rows', '', `${Q.name}: ${d.line}`); }
    }
    round++;
  };
  /** One action of the script. */
  const run = async x => {
    const P = phones[x.p % phones.length];
    if (x.op === 'check') return check();
    if (x.op === 'off') { P.off = true; return; }
    if (x.op === 'on') { P.off = false; return; }
    if (x.op === 'drop') { P.drop = { kind: x.kind, when: x.when, n: 1 }; return; }
    if (x.op === 'wait') { clock.t += x.ms; for (const Q of phones) await Q.tick(); return; }
    if (x.op === 'flush' || x.op === 'pull' || x.op === 'sync') { await P[x.op](); return; }
    if (x.op === 'race') {
      // Two phones read the account at nearly the same moment: the other's whole read runs while this one's is between reading and its first write.
      const Q = phones[x.q % phones.length]; let once = Q !== P;
      P.hook = async (kind, when) => { if (kind === 'set' && when === 'before' && once) { once = false; await Q.pull(); } };
      try { await P.pull(); } finally { P.hook = null; }
      return;
    }
    const d0 = P.state().draft, did = DO[x.op](P, x);
    if (did) {
      const id = x.op === 'tick' || x.op === 'redate' || x.op === 'finish' || x.op === 'discard' ? d0.id : x.id;
      if (id) said(id, x.p % phones.length, x.op), (acts[id][acts[id].length - 1].v = x.v);
      if (x.op === 'set') said('userName', x.p % phones.length, x.op);
      if (x.op === 'add') made.add(x.id);
      if (x.op === 'forgood') forgood.add(x.id);
      if (x.op === 'start') {
        /* Two workouts open on two phones at once (started on both, or one phone finished the workout and started
           the next while the other still shows the first): the documents hold one open workout an account, each
           phone's later change takes the place, and the copy that loses it is saved to History while the same
           workout is open again on the other phone. Which sets are where is then not asked of either. */
        const other = phones.filter(Q => Q !== P && Q.state().draft && Q.state().draft.id !== x.id).map(Q => Q.state().draft.id);
        if (other.length) for (const w of [...other, x.id]) raced.add(w);
        closed[x.id] = 'open';
      }
      if (x.op === 'tick') (ticked[d0.id] = ticked[d0.id] || new Set()).add(d0.ex[0].sets[x.i].r);
      if (x.op === 'finish') { made.add(d0.id); if (closed[d0.id] !== 'discarded') closed[d0.id] = 'finished'; }
      if (x.op === 'discard') closed[d0.id] = 'discarded';
    }
    // The edit is noted and, with signal, sent, as the app does a moment after a save.
    clock.t += 1500 + (x.ms || 0); await P.tick();
  };
  const script = [];
  if (o.script) for (const x of o.script) await run(x);
  else {
    const W = [['note', 14], ['move', 12], ['del', 8], ['restore', 9], ['forgood', 2], ['add', 3], ['bw', 3], ['cardio', 3], ['set', 3], ['start', 5], ['tick', 12], ['redate', 4], ['finish', 6], ['discard', 1], ['off', 4], ['on', 5], ['flush', 5], ['pull', 9], ['sync', 4], ['race', 3], ['wait', 5], ['drop', 3], ['check', 3]];
    const total = W.reduce((s, w) => s + w[1], 0);
    for (let step = 0; step < (o.steps || 60); step++) {
      let r = rnd() * total, op = W[0][0];
      for (const [name, w] of W) { if (r < w) { op = name; break; } r -= w; }
      const p = Math.floor(rnd() * phones.length), P = phones[p], S = P.state();
      // A phone showing an open workout mostly works on it: sets ticked, its date changed, Finish, and both phones caught up now and then, so two phones hold one workout between them.
      if (S.draft && rnd() < 0.4) op = pick(['tick', 'tick', 'tick', 'redate', 'finish', 'pull', 'check', 'check']);
      const x = { p, op };
      const live = S.sessions.map(s => s.id), bin = S.trash.filter(t => t.kind === 'session' && !t.clash).map(t => t.id);
      // A hot record is picked more often, so the phones change the same one with no signal between them.
      const hot = a => (a.length && rnd() < 0.5 ? a[0] : pick(a));
      if (op === 'note') { if (!live.length) continue; x.id = hot(live.sort()); x.v = 'n' + ++n; }
      else if (op === 'move') { if (!live.length) continue; x.id = hot(live.sort()); x.v = pick(DATES); }
      else if (op === 'del') { if (live.length < 2) continue; x.id = hot(live.sort()); }
      else if (op === 'restore' || op === 'forgood') { if (!bin.length) continue; x.id = pick(bin); }
      else if (op === 'add') { x.id = 'x' + ++n; x.v = pick(DATES); }
      else if (op === 'bw') { x.id = rnd() < 0.5 ? 'w1' : 'w' + ++n; x.v = 60 + (++n % 400) / 10; x.d = pick(DATES); }
      else if (op === 'cardio') { x.id = 'c1'; x.v = 'c' + ++n; }
      else if (op === 'set') { x.v = 'u' + ++n; }
      else if (op === 'start') { if (S.draft) continue; x.id = 'k' + ++n; x.v = pick(DATES.slice(0, 6)); }
      else if (op === 'tick') { if (!S.draft) continue; x.i = Math.floor(rnd() * 4); }
      else if (op === 'redate') { if (!S.draft) continue; x.v = pick(DATES.slice(0, 6)); }
      else if (op === 'finish' || op === 'discard') { if (!S.draft) continue; }
      else if (op === 'race') { x.q = (p + 1 + Math.floor(rnd() * (phones.length - 1))) % phones.length; }
      else if (op === 'wait') { x.ms = pick([2000, 20000, 61000, 90000, 90000, 26 * 3600000]); }
      else if (op === 'drop') { x.kind = pick(['*', 'set', 'list', 'rows-push', 'rows-pull']); x.when = pick(['before', 'after']); }
      script.push(x); await run(x);
    }
    const end = { p: 0, op: 'check' }; script.push(end); await run(end);
  }
  // What the app logs of a dropped connection, of a write another phone won, and of a record it put back is no error.
  const errors = phones.flatMap(P => P.errors().filter(e => !/offline|unavailable|no answer|raced|Another device|^sync-kept/.test(e)).map(e => `${P.name}: ${e}`));
  return { script: o.script || script, fails, known, acts, C, phones, errors, clock, run, check, counts: { writes: C.writes.length, calls: C.calls.length, rounds: round } };
}
/** The shortest script found that still fails as `still` asks of its result (a rule's name, or a test of the result): actions taken out one at a time until none can go. */
async function shrink(o, script, still) {
  const bad = typeof still === 'function' ? still : r => r.fails.some(f => f.rule === still);
  let cur = script, cut = true;
  while (cut) {
    cut = false;
    for (let i = cur.length - 1; i >= 0; i--) {
      const tryS = cur.filter((_, j) => j !== i);
      if (!tryS.some(x => x.op === 'check')) continue;
      if (bad(await history({ ...o, script: tryS }))) { cur = tryS; cut = true; }
    }
  }
  return cur;
}
/** A script as one line a person can read. */
const told = script => script.map(x => `${x.op === 'wait' || x.op === 'check' ? '' : 'ABC'[x.p] + ' '}${x.op === 'race' ? 'pull, ' + 'ABC'[x.q] + ' pulling inside it' : x.op}${x.id ? ' ' + x.id : ''}${x.v !== undefined ? ' ' + x.v : ''}${x.i !== undefined ? ' set ' + (x.i + 1) : ''}${x.ms ? ' ' + x.ms / 1000 + 's' : ''}${x.kind ? ' ' + x.kind + ' ' + x.when : ''}`).join(', ');
module.exports = { history, shrink, told, view, stable, mkSession };
