// r53 against r52 on the 1,000 wide histories of tests/r52.js (tests/wide.js):
// what changed is only what r53 changes on purpose (tests/r53.js holds each
// rule to exact numbers in the app's own flows): PRs on lighter and deload
// days; a lift done at its usual load and reps for as many sets there
// counting as a full session for it; a lift on no day of a routine planned
// from its own last full session; no stall while an injury it loads is
// flagged, nor after a PR on a day left out of the stall; the coach holding
// back a deload after a deload, a finished lighter week, a rest week or a
// marked deload week, and no longer after one lighter session; and Finish's
// offer adding an exercise from a lighter day or a deload at its normal-day
// sets. tests/moved.js proves statically that
// nothing else in the code changed (every other declaration token for
// token, the listed edits undone); this suite checks it by the answers,
// call by call.
//
// Each history is run in r52 as published and in this build, with its
// tagged lifts done lighter than their usual (tests/wide.js, honestTags), as
// in the gym. A history where a tagged lift still counts in full is counted
// and left to tests/r53.js: that reaches every reader of the analytics. In
// every other history each call made with the same arguments gives r52's
// answer, except where one of the rules above changes it, and then only as
// that rule says:
//   IDX: r52's but for the PRs of lighter and deload days and, with an
//     injury flagged, the stall of each lift it loads and the muscle scores
//     those stalls set; likewise a lift this build reads as not stalled
//     with a PR on a session left out of its stall's stretch since the
//     third-last session of it (the fifth review, r53Touches' prOff);
//   stalledIds and fatigueStalls: r52's less the lifts an injury loads and
//     those; movers: r52's but for them (one no longer stalled can join it);
//   planFor: for a lift on no day of the routine, r52's but for the sets and
//     the range, the sets those of the lift's last full session and the
//     range that session's or r52's;
//   recentLighter: each build's answer by its own rule, read from the log
//     (r53Touches);
//   coach: a deload suggested or held back by that rule, a stalled lift on
//     no day of the routine read at its own range (coachSame), or, with an
//     injury flagged or such a PR, a stall of that lift no longer named;
//   routineUpdates: r52's on a normal day; on a lighter day or in a deload
//     r52's but for each added exercise's sets, which are the sets the day's
//     plan gives it, read here from the routine and the log.
// A call given a lift's own plan (a lift on no day of the routine) is run
// again in r52 with this build's arguments, and must give this build's
// answer, as above. Then the scenarios tests/r52.js runs for r51 and r52: a
// page left open past midnight, each cache read stale, and the demo.
const { open, engine, settle } = require('./h');
const { wide, digest, specOf, decode, ser, r53Touches, coachSame, honestTags, freed, idxSame, coachOk, less, MIDNIGHT_KEYS, midnightRun, STALE_CASES, staleRun, demoRun } = require('./wide');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); };
const BASE = 'baselines/r52.html';
const N = +process.env.R53W_N || 1000;
// The build compared with r52: this one, or another given to see that a change r53 does not make fails here.
const FILE = process.env.R53W_FILE || 'index.html';

// A plan-like object (sets and a range), anywhere in a value, with its sets and range set aside.
const unplan = v => {
  const go = x => Array.isArray(x) ? x.map(go) : x && typeof x === 'object' && !(x instanceof Set) && !(x instanceof Map) ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, 'repMin' in x && 'sets' in x && (k === 'sets' || k === 'repMin' || k === 'repMax') ? null : go(y)])) : x;
  return ser(go(v));
};
// The lifts a flagged injury loads in the history loaded in this build's page, with the muscles each trains.
const injuredIn = () => { const L = window.__ironlog, s = L.state; const ids = [...new Set(s.sessions.flatMap(x => x.ex.map(b => b.exId)).concat(s.exercises.map(e => e.id)))].filter(id => { try { return !!L.exInjury(L.EX(id)); } catch (e) { return false; } }); return { ids, mus: Object.fromEntries(ids.map(id => { const e = L.EX(id); return [id, [e.primary, ...(e.secondary || [])]]; })) }; };
// planFor for a lift on no day of the routine (x r52's, y this build's): r52's but for its sets, those of its last full session (own), and its
// range, that session's where it has one and Your training sets none (own.prof), else r52's.
const ownPlan = (x, y, own) => !!own && unplan(x) === unplan(y) && y.sets === own.sets && (own.rr && !own.prof ? y.repMin === own.rr[0] && y.repMax === own.rr[1] : y.repMin === x.repMin && y.repMax === x.repMax);

(async () => {
  const browser = await engine.launch();
  const setup = async (ctx, page) => { await page.clock.setFixedTime(new Date('2026-10-11T12:00:00')); };
  const A = await open(BASE, { browser, setup });
  const B = await open(FILE, { browser, setup });
  const LIB = await B.page.evaluate(() => window.__ironlog.libExercises());
  const n = { compared: 0, injured: 0, prOff: 0, full: 0, lines: 0, same: 0, replayed: 0, planFor: 0, idx: 0, prsOut: 0, rl: 0, coach: 0, stalls: 0, offers: 0, offerSets: 0, prLogs: 0, prs: 0 };
  const bad = [];
  for (let i = 0; i < N; i++) {
    const seed = 52000 + i;
    const h = wide(seed, LIB); honestTags(h.raw.sessions);
    const when = new Date(h.today + 'T12:00:00');
    await Promise.all([A.page.clock.setFixedTime(when), B.page.clock.setFixedTime(when)]);
    const spec = specOf(h);
    const [a, b] = await Promise.all([A.page.evaluate(digest, spec), B.page.evaluate(digest, spec)]);
    // Read in this build with the history's log, which the digest leaves loaded.
    const t = await B.page.evaluate(r53Touches);
    if (t.full) { n.full++; continue; }
    n.compared++;
    // The lifts an injury loads, each lift's last full session, the active routine's lifts, and each lift's name.
    const inj = await B.page.evaluate(injuredIn), fr = freed(t, inj);
    if (inj.ids.length) n.injured++;
    if (Object.keys(t.prOff).length) n.prOff++;
    const ctx = await B.page.evaluate(() => {
      const L = window.__ironlog, s = L.state;
      const AR = L.activeRoutine();
      const last = {}, names = {};
      for (const id of new Set(s.sessions.flatMap(x => x.ex.map(q => q.exId)).concat(s.exercises.map(e => e.id)))) {
        try { names[id] = L.exName(id); } catch (e) { /* a deleted lift has no name to read */ }
        let ls = null, blk = null;
        for (const x of s.sessions) {
          if (x.demo || x.deload || x.light || (ls && L.sessCmp(x, ls) <= 0)) continue;
          const q = x.ex.find(q => q.exId === id && !q.cut && !q.light && q.sets.some(z => !z.warm && !z.drop && +z.r > 0));
          if (q) { ls = x; blk = q; }
        }
        if (blk) last[id] = { sets: blk.sets.filter(z => !z.warm && !z.drop && +z.r > 0).length, rr: blk.rr || null, prof: (() => { try { return !!L.profRule(L.EX(id)); } catch (e) { return false; } })() };
      }
      return { items: AR.days.flatMap(d => d.items.map(it => it.exId)), last, names };
    });
    const la = a.split('\n'), lb = b.split('\n');
    if (la.length !== lb.length) { bad.push({ seed, why: 'a different number of answers', lines: [la.length, lb.length] }); continue; }
    const offerChecks = [], replay = []; let lag = false;
    // One answer as r53 changes it, or the reason it is not (null when it is).
    const judge = (name, args, x, y) => {
      if (ser(x) === ser(y)) return null;
      if (name === 'IDX') { const r = idxSame(x, y, t, fr); lag = lag || r.lag; if (r.same) { n.idx++; n.prsOut += r.out; return null; } return 'IDX differs in more than the PRs of lighter and deload days and an injured lift\'s stall'; }
      if (name === 'stalledIds') { if (ser(less(x, fr.ids)) === ser(y)) { n.stalls++; return null; } return 'the stalled lifts differ in more than the injured ones'; }
      // The lifts moving up leave out stalled ones, so an injured lift no longer stalled can join them.
      if (name === 'movers') { const o = v => ser(v.filter(m => !fr.ids.includes(m.id))); if (o(x) === o(y)) { n.stalls++; return null; } return 'the lifts moving up differ in more than the injured ones'; }
      if (name === 'fatigueStalls') { if (ser(less(x, fr.ids)) === ser(y)) { n.stalls++; return null; } return 'the stalls that count toward a deload differ in more than the injured ones'; }
      if (name === 'planFor') {
        const [id, R] = args, items = R ? R.days.flatMap(d => d.items.map(it => it.exId)) : ctx.items;
        if (t.plan && !items.includes(id) && ownPlan(x, y, ctx.last[id])) { n.planFor++; return null; }
        return 'a plan that is not the lift\'s own last full session';
      }
      if (name === 'recentLighter') { const r = t.rls[args[0]]; if (r && x === r.r52 && y === r.r53) { n.rl++; return null; } return 'the lighter-week test, not as each build\'s rule reads the log'; }
      if (name === 'coach') { if (coachOk(x, y, t, fr, ctx.names, lag)) { n.coach++; return null; } return 'the coach, not as r53 changes it'; }
      if (name === 'routineUpdates') {
        const d = args[0];
        if (!(d.light || d.deload)) return 'Finish\'s offer on a normal day';
        const strip = o => o && { ...o, add: o.add.map(e => ({ ...e, plan: { ...e.plan, sets: null } })) };
        if (x && y && x.add.length === y.add.length && ser(strip(x)) === ser(strip(y))) { n.offers++; offerChecks.push(...y.add.map(e => [d.routineId, d.dayId, e.exId, e.plan.sets])); return null; }
        return 'Finish\'s offer differs in more than each added exercise\'s sets';
      }
      return 'an answer r53 does not change on purpose';
    };
    for (let k = 0; k < la.length; k++) {
      n.lines++;
      if (la[k] === lb[k]) { n.same++; continue; }
      const pa = la[k].split('\t'), pb = lb[k].split('\t');
      const fail = why => bad.push({ seed, line: k, why, r52: la[k].slice(0, 300), r53: lb[k].slice(0, 300) });
      if (pa.length !== 3 || pb.length !== 3 || pa[0] !== pb[0]) { fail('not a call, or a different call'); break; }
      const [name, argsA, resA] = pa, [, argsB, resB] = pb;
      if (argsA !== argsB) {
        const xa = decode(argsA), xb = decode(argsB);
        // fatigueStalls given the stalled lifts, less the injured ones here.
        if (name === 'fatigueStalls' && ser([less(xa[0], fr.ids)]) === ser(xb)) { const why = judge(name, xb, decode(resA), decode(resB)); if (why) { fail(why); break; } continue; }
        // Given a lift's own plan: r52 is asked again with these arguments, below.
        if (t.plan && unplan(xa) === unplan(xb)) { replay.push([name, argsB, resB, k]); continue; }
        fail('arguments that differ in more than a plan'); break;
      }
      const why = judge(name, decode(argsA), decode(resA), decode(resB));
      if (why) { fail(why); break; }
    }
    // r52 with this build's plans: the log is still loaded in both pages, so the same call there must give this build's answer, as judged above.
    if (replay.length) {
      const got = await A.page.evaluate(([calls, S, D]) => { const L = window.__ironlog; const ser = new Function(`return (${S})`)(), dec = new Function(`return (${D})`)(); return calls.map(([name, args]) => { try { return ser(L[name.replace(/^~/, '')](...dec(args))); } catch (e) { return 'ERR ' + e.message; } }); }, [replay.map(r => [r[0], r[1]]), ser.toString(), decode.toString()]);
      replay.forEach(([name, args, resB, k], j) => {
        n.replayed++;
        const why = got[j] === resB ? null : judge(name.replace(/^~/, ''), decode(args), decode(got[j]), decode(resB));
        if (why) bad.push({ seed, line: k, why: `asked again in r52 with this build's plan: ${why}`, r52: got[j].slice(0, 300), r53: resB.slice(0, 300) });
      });
    }
    // On a lighter day or in a deload, each exercise at the sets the day's plan gives it on a normal day: on that day, else on the routine's first day that has it, else the lift's last full session, else the default.
    if (offerChecks.length) {
      const want = await B.page.evaluate(cs => cs.map(([rid, dayId, id]) => {
        const L = window.__ironlog, s = L.state; const R = s.routines.find(r => r.id === rid);
        for (const d of [...R.days.filter(d => d.id === dayId), ...R.days.filter(d => d.id !== dayId)]) for (const it of d.items) if (it.exId === id) return it.sets;
        let ls = null, blk = null;
        for (const x of s.sessions) { if (x.demo || x.deload || x.light || (ls && L.sessCmp(x, ls) <= 0)) continue; const q = x.ex.find(q => q.exId === id && !q.cut && !q.light && q.sets.some(z => !z.warm && !z.drop && +z.r > 0)); if (q) { ls = x; blk = q; } }
        return blk ? blk.sets.filter(z => !z.warm && !z.drop && +z.r > 0).length : L.defPlan(id).sets;
      }), offerChecks);
      offerChecks.forEach(([rid, dayId, id, sets], j) => { if (sets === Math.max(1, +(want[j] || 0) || 3)) n.offerSets++; else bad.push({ seed, why: 'an offer on a lighter day or in a deload not at the day\'s normal sets', offer: [rid, dayId, id, sets, want[j]] }); });
    }
    // A PR is a PR on any day: this build's PRs on the log are r52's on the same log with every deload and lighter label taken off (the third review).
    {
      const mine = await B.page.evaluate(S => new Function(`return (${S})`)()(window.__ironlog.IDX().prs), ser.toString());
      const plain = await A.page.evaluate(([raw, S]) => { const L = window.__ironlog; const r = JSON.parse(raw); for (const x of r.sessions) { delete x.deload; delete x.light; for (const b of x.ex) delete b.light; } L.state = L.normalize(r); L.invalidate(); return new Function(`return (${S})`)()(L.IDX().prs); }, [JSON.stringify(h.raw), ser.toString()]);
      if (mine === plain) { n.prLogs++; n.prs += decode(mine).length; } else bad.push({ seed, why: 'the PRs are not r52\'s with the day\'s labels taken off', r52: plain.slice(0, 300), r53: mine.slice(0, 300) });
    }
  }
  console.log(`note of ${N} histories: ${n.compared} compared (${n.injured} with an injury flagged, ${n.prOff} with a lift that set a PR on a session left out of its stall), ${n.full} where a tagged lift still counts in full left to tests/r53.js; of ${n.lines} answers ${n.same} the same; ${n.replayed} calls given a lift's own plan asked again in r52; differing as r53 says: IDX ${n.idx} (${n.prsOut} PRs on lighter and deload days), stalls ${n.stalls}, planFor ${n.planFor}, recentLighter ${n.rl}, coach ${n.coach}, Finish's offer ${n.offers} (${n.offerSets} exercises on lighter and deload days checked)`);
  ok(n.compared >= N * 0.95, `19 histories in 20 or more are compared, an injury flagged in ${n.injured} (${n.compared} of ${N})`);
  ok(n.same >= n.lines * 0.9, `nine answers in ten or more are r52's to the character (${n.same} of ${n.lines})`);
  ok(bad.length === 0, 'every other answer differs only as one of r53\'s rules says, the calls given a lift\'s own plan included', bad.slice(0, 3));
  ok(n.prLogs === n.compared && n.prs > 1000, `on every history compared, the PRs are r52's on the same log with the deload and lighter labels taken off (${n.prs} PRs on ${n.prLogs} logs): a PR is a PR on any day`);
  ok(n.idx > 0 && n.stalls > 0 && n.planFor > 0 && n.rl > 0 && n.coach > 0 && n.offers > 0 && n.offerSets > 0 && n.replayed > 0 && n.injured > 0 && n.prOff > 0, 'each rule is reached: PRs on lighter and deload days, a PR on a session left out of a stall, an injury, a lift\'s own plan, the lighter-week test, the coach, and Finish\'s offer', n);

  // A page left open from Sunday into Monday (the week marked a deload week), read before midnight, after it with Sunday's caches, and after invalidate.
  // This build is read first; r52 is then asked, at each read, for each lift's suggestion with this build's plan, as in the main comparison.
  {
    let agree = 0, skipped = 0, turned = 0, replayed = 0, firstOff = null; const M = 40;
    for (let i = 0; i < M; i++) {
      const h = wide(53000 + i, LIB); honestTags(h.raw.sessions);
      const rb = await midnightRun(B, h, P => P.page.evaluate(r53Touches));
      const plans = rb.map(([read]) => { const o = JSON.parse(read); return h.ids.map(id => [id, o['p ' + id]]); });
      const ra = await midnightRun(A, h, (P, j) => P.page.evaluate(([plans, S, D]) => { const L = window.__ironlog; const ser = new Function(`return (${S})`)(), dec = new Function(`return (${D})`)(); return Object.fromEntries(plans.map(([id, p]) => { try { return [id, ser(L.suggest(id, dec(p), {}))]; } catch (e) { return [id, 'ERR ' + e.message]; } })); }, [plans[j], ser.toString(), decode.toString()]));
      if (rb.some(([, t]) => t.full)) { skipped++; continue; }
      const inj = await B.page.evaluate(injuredIn);
      const c2 = await B.page.evaluate(ids => { const L = window.__ironlog, s = L.state; const names = {}, last = {}; for (const id of ids) { try { names[id] = L.exName(id); } catch (e) { /* a deleted lift has no name */ } let ls = null, blk = null; for (const x of s.sessions) { if (x.demo || x.deload || x.light || (ls && L.sessCmp(x, ls) <= 0)) continue; const q = x.ex.find(q => q.exId === id && !q.cut && !q.light && q.sets.some(z => !z.warm && !z.drop && +z.r > 0)); if (q) { ls = x; blk = q; } } if (blk) last[id] = { sets: blk.sets.filter(z => !z.warm && !z.drop && +z.r > 0).length, rr: blk.rr || null, prof: (() => { try { return !!L.profRule(L.EX(id)); } catch (e) { return false; } })() }; } return { names, last, items: L.activeRoutine().days.flatMap(d => d.items.map(it => it.exId)) }; }, h.ids);
      let off = null;
      for (let j = 0; j < 3 && !off; j++) {
        const oa = JSON.parse(ra[j][0]), ob = JSON.parse(rb[j][0]), t = rb[j][1], fr = freed(t, inj);
        const lag = oa.idx !== ob.idx && idxSame(decode(oa.idx), decode(ob.idx), t, fr).lag;
        for (const key of Object.keys(ob)) {
          if (oa[key] === ob[key]) continue;
          const x = decode(oa[key]), y = decode(ob[key]);
          const id = key.slice(2), own = c2.last[id];
          const fine = key === 'coach' ? coachOk(x, y, t, fr, c2.names, lag)
            : key === 'recentLighter' ? x === t.rls[28].r52 && y === t.rls[28].r53
            : key === 'idx' ? idxSame(x, y, t, fr).same
            : key === 'stalledIds' ? ser(less(x, fr.ids)) === ser(y)
            : key === 'movers' ? ser(x.filter(m => !fr.ids.includes(m.id))) === ser(y.filter(m => !fr.ids.includes(m.id)))
            // A lift's own plan, as the main comparison holds it: its last full session's sets, and its range or r52's.
            : key.startsWith('p ') ? t.plan && !c2.items.includes(id) && ownPlan(x, y, own)
            // Its suggestion with that plan: r52's answer, asked at the same read with this build's plan.
            : key.startsWith('s ') ? oa['p ' + id] !== ob['p ' + id] && ra[j][1][id] === ob[key] && ++replayed > 0
            : false;
          if (!fine) { off = { seed: 53000 + i, read: ['before midnight', 'after, caches from Sunday', 'after invalidate'][j], key, r52: String(oa[key]).slice(0, 300), r53: String(ob[key]).slice(0, 300), r52WithThisPlan: key.startsWith('s ') ? String(ra[j][1][id]).slice(0, 300) : undefined }; break; }
        }
      }
      if (off) { if (!firstOff) firstOff = off; } else agree++;
      if (rb[0][0] !== rb[2][0]) turned++;
    }
    ok(!firstOff && agree + skipped === M && agree >= M * 0.9, `a page left open from Sunday into Monday reads as r52 does, but as r53 says, before midnight, after it with the caches built on Sunday, and after invalidate (${agree} of ${M} histories, ${skipped} with a tagged lift counted in full left out, ${replayed} suggestions on a lift's own plan matched by r52 with that plan)`, firstOff);
    ok(turned > M / 2, `the week turns over at midnight (${turned} of ${M} histories read differently on Monday)`);
  }

  // Each cache read stale on purpose, as tests/r52.js reads it for r51 and r52. Only the analytics index, read whole when it is built, can differ,
  // and then as r53 says; every other read must be r52's exactly.
  {
    const bad2 = []; let skipped = 0;
    const logs = []; for (let i = 0; logs.length < 12; i++) { const h = wide(54000 + i, LIB); honestTags(h.raw.sessions); if (h.raw.sessions.length >= 3) logs.push([54000 + i, h]); }
    for (const [name, c] of Object.entries(STALE_CASES)) {
      let agree = 0;
      for (const [seed, h] of logs) {
        await Promise.all([A, B].map(P => P.page.clock.setFixedTime(new Date(h.today + 'T12:00:00'))));
        // What r53 changes in this log, read in this build before the cache is made stale.
        await B.page.evaluate(raw => { const L = window.__ironlog; L.state = L.normalize(JSON.parse(raw)); L.invalidate(); }, JSON.stringify(h.raw));
        const t = await B.page.evaluate(r53Touches), inj = await B.page.evaluate(injuredIn);
        if (t.full) { skipped++; agree++; continue; }
        const a = await staleRun(A, h, c), b = await staleRun(B, h, c);
        const same = (x, y, j) => x === y || (name === '_idx' && j === 0 && idxSame(decode(x), decode(y), t, freed(t, inj)).same);
        if (a.length === b.length && a.every((x, j) => same(x, b[j], j))) agree++; else if (bad2.length < 3) bad2.push({ cache: name, seed, r52: a.map(x => String(x).slice(0, 200)), r53: b.map(x => String(x).slice(0, 200)) });
      }
      if (agree < 12 && !bad2.some(x => x.cache === name)) bad2.push({ cache: name });
    }
    if (skipped) console.log(`note ${skipped} stale reads of a log where a tagged lift counts in full left out`);
    ok(bad2.length === 0, 'each cache read stale on purpose (EXMAP, _idx, _dix, _cal, _rirUse, _bwRef, _pace, and the _rack and weekRid marks) gives r52\'s answers before invalidate and after it', bad2);
  }

  // makeDemo's whole log: the same log, and what the engine reads in it as r53 changes it (its ids canonical, so the tagged sessions are read from that log).
  {
    await Promise.all([A, B].map(P => P.page.clock.setFixedTime(new Date('2026-10-14T12:00:00'))));
    const a = JSON.parse(await demoRun(A)), b = JSON.parse(await demoRun(B));
    const t = await B.page.evaluate(r53Touches);
    const tagged = []; for (const x of b.state.sessions) for (const q of x.ex) if (x.deload || x.light || q.light) tagged.push(x.id + '\t' + q.exId);
    const r = idxSame(a.idx, b.idx, { ...t, tagged }, { ids: [], mus: {} });
    ok(JSON.stringify(a.state) === JSON.stringify(b.state) && b.state.sessions.length > 20 && !t.full && r.same && coachSame(a.coach, b.coach, t), `makeDemo builds r52's log, and the engine reads it as r52 does but as r53 says (${b.state.sessions.length} sessions, ${r.out} PRs on its deload week taken out)`, { full: t.full, idx: r.same, coach: [a.coach, b.coach] });
  }

  ok(!A.errors.length && !B.errors.length, 'no page errors in either build', [...A.errors, ...B.errors].slice(0, 3));
  await settle(browser.close(), 'closing the browser');
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
