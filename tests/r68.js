// r68, each section failing on r67 (`node tests/r68.js baselines/r67.html`) unless it says it is a guard.
// `R68=1,3` runs some sections.
//   1  The Volume radar's ring labels (50, 100, 150, ...) never cover a dot or a line (V, 2026-11-02: a photo of
//      Chest at 50% with the "50" label over its dot). Every number the radar writes is read off the canvas as it
//      is drawn (its text, place, alignment and font), and its box is checked against every dot with a size and
//      every line of both datasets: on a log like V's (Chest about half its minimum, four regions at nothing),
//      on the demo, and on 120 readings drawn at random, each at 390 and 320 px wide. r67 writes them on the
//      Chest spoke, over Chest's dot. A guard with them: on V's log every ring is still named.
//   2  No chart on Stats writes one text over another, and no dot is cut off at a plot's edge (found sweeping every
//      chart after V's photo, 2026-11-02). Every text each chart writes (axis labels, legend, the radar's names and
//      rings) is read off its canvas in one draw, and no two boxes overlap; every dot of a line chart is drawn
//      whole, read from the canvas's own pixels at four points inside it. In each Volume view (region, weekly
//      trend, load, this week, average), with the demo's log, at 320, 375 and 390 px. r67 at 320 px wrote "Oct 26" into "This wk" on the weekly
//      bars and cut the first weigh-in's dot and a lift's first session in half.
//   3  NEW-18 and 366 (a) and (b), two sessions of a lift on one day (V's ruling of 2026-11-02, "match the morning").
//      A second bench session the same day asks the morning's load and reps, no step up and nothing set to beat
//      (r67: 140 x 10 x 3 at 8:00 asked 145 at 17:00); started from Today it shows that in its grey numbers. The
//      next day reads the day as one, from its best session (r67 read the later one: a weaker evening after a
//      morning at the top of the range held the load). A guard: when the evening is the better one, it is read.
//   4  367, the default load step by how a lift is loaded (V's pick of 2026-11-02): every set at the top of the range
//      steps a barbell or Smith lift and a pin-loaded machine or cable 10 lb or 5 kg, a dumbbell 5 lb or 2 kg each;
//      a plate-loaded machine typed a side, load added to a pull-up and a kettlebell keep 5 lb (2.5 kg). Guards: a
//      step set on the lift, and Your gym's plates, still come first; back after a break on the default barbell
//      step, the climb goes 165, 175 and back to the 185 from before (decision 1 on 10 lb steps).
//   5  366 (c), two workouts on one weekday of a fixed-weekday routine: Plan adds a second workout to Monday, names
//      it and moves an exercise into it; Today starts the first, then offers the second, each with its own
//      exercises, saved as the day's first and second (part 2); a week plans both; the marks survive normalize,
//      r67 keeps them (its extras) and r68 reads them back; switching to a cycle makes the day one workout again.
//   6  NEW-31, a slipped day on a fixed-weekday routine (V, 2026-11-02): Monday's Push not done by Tuesday is
//      offered first, today's Pull a tap away; done on Tuesday, it fills Monday's slot, so Monday no longer reads
//      missed and Today moves on to Pull; once today's is done Today shows the next one up; a rest day with
//      nothing behind keeps its card (a guard).
//   7  Warm-ups added one by one stay distinct on the default 10 lb step (found building 367): a 50 lb barbell curl's
//      three warm-ups are 20, 30 and 40, each under the working load (r68 before the fix: 20, 30, 30). On r67's 5 lb
//      step they were 20, 30 and 35, so on r67 this is a guard; it fails on d52a2a9's page, the build before the fix.
//   8  The Guide and the sheets say what r68 does (99): the load steps by equipment in lb and kg, how fixed weekdays
//      adapt and where a second workout is added, the week bar's plain day, and a load step sheet that fits a barbell.
const { open, engine } = require('./h');
let browser;
const FILE = process.argv[2] || process.env.IRONLOG_FILE || 'index.html';
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const ONLY = process.env.R68 ? process.env.R68.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const MON = '2026-11-02';
const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/* Records every text a canvas writes, with where it lands in CSS pixels and the box its letters fill, so a suite
   can check a chart's labels against its data whichever code wrote them (Chart.js or the app). */
const RECORD_TEXT = `(()=>{const P=CanvasRenderingContext2D.prototype,f=P.fillText;window.__texts=[];
P.fillText=function(t,x,y,...a){try{const m=this.getTransform(),r=window.devicePixelRatio||1,w=this.measureText(String(t)).width,
px=(m.a*x+m.c*y+m.e)/r,py=(m.b*x+m.d*y+m.f)/r,sz=parseFloat(this.font)||10,al=this.textAlign,bl=this.textBaseline,
rot=Math.abs(m.b)>1e-6||Math.abs(m.c)>1e-6,
l=al==='center'?px-w/2:al==='right'||al==='end'?px-w:px,
t0=bl==='middle'?py-sz/2:bl==='top'?py:bl==='bottom'?py-sz:py-sz*0.8;
window.__texts.push({id:this.canvas&&this.canvas.id,t:String(t),x:px,y:py,rot,box:{l,t:t0,r:l+w,b:t0+sz}});}catch(e){}
return f.call(this,t,x,y,...a);};})()`;

// The radar as drawn: each shown dataset's dots (with their size) and the ring numbers it wrote.
const radarNow = page => page.evaluate(() => {
  const c = document.getElementById('chRadar');
  const ch = c && window.Chart.getChart(c);
  if (!ch) return null;
  const sets = ch.data.datasets.map((_, i) => i).filter(i => ch.isDatasetVisible(i))
    .map(i => ch.getDatasetMeta(i).data.map(p => ({ x: p.x, y: p.y, r: (p.options && p.options.radius) || 0 })));
  const labels = new Set(ch.data.labels);
  const nums = window.__texts.filter(x => x.id === 'chRadar' && /^\d+$/.test(x.t) && !labels.has(x.t));
  return { sets, nums, max: ch.scales.r.max };
});
// What a ring number's box meets: a dot (its size and 1 px) or a line of a dataset.
function meets(box, sets) {
  const hit = [];
  const segHits = (x1, y1, x2, y2) => {
    let lo = 0, hi = 1; const dx = x2 - x1, dy = y2 - y1;
    for (const [p, d] of [[-dx, x1 - box.l], [dx, box.r - x1], [-dy, y1 - box.t], [dy, box.b - y1]]) {
      if (p === 0) { if (d < 0) return false; continue; }
      const k = d / p; if (p < 0) lo = Math.max(lo, k); else hi = Math.min(hi, k); if (lo > hi) return false;
    }
    return true;
  };
  sets.forEach((pts, s) => pts.forEach((p, i) => {
    const nx = Math.max(box.l, Math.min(p.x, box.r)), ny = Math.max(box.t, Math.min(p.y, box.b));
    if (p.r > 0 && Math.hypot(p.x - nx, p.y - ny) < p.r + 1) hit.push(`dataset ${s} dot ${i}`);
    const q = pts[(i + 1) % pts.length];
    if (segHits(p.x, p.y, q.x, q.y)) hit.push(`dataset ${s} line ${i}-${(i + 1) % pts.length}`);
  }));
  return hit;
}
// Stats with the Volume section open on a log, drawn at width w.
async function stats(w, seed) {
  const setup = async ctx => ctx.addInitScript(RECORD_TEXT);
  const P = await open(FILE, { browser, w, h: 844, clock: MON + 'T18:00:00', setup });
  await P.page.evaluate(seed);
  await P.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.invalidate(); L.ui.tab = 'dash'; L.ui.folds['dash:volume'] = true; window.__texts.length = 0; L.render(); });
  await wait(250);
  return P;
}
// A log like V's of 2026-11-02: four weeks of one session each, chest, back, shoulders and arms only.
const vLog = mon => {
  const L = window.__ironlog; const S = L.state;
  S.sessions = [];
  for (let k = 1; k <= 4; k++) {
    const d = new Date(Date.parse(mon + 'T12:00:00Z') - k * 7 * 864e5).toISOString().slice(0, 10);
    const sets = n => Array.from({ length: n }, () => ({ w: 40, r: 10, rir: 2 }));
    S.sessions.push({ id: 'v' + k, date: d, notes: '', ex: [{ exId: 'bench', sets: sets(5) }, { exId: 'cableRow', sets: sets(4) }, { exId: 'dbLateral', sets: sets(2) }, { exId: 'dbCurl', sets: sets(3) }] });
  }
  L.state = L.normalize(S);
};

(async () => {
  browser = await engine.launch();

  // ---- 1. The radar's ring numbers never cover a dot or a line.
  if (run(1)) {
    for (const w of [390, 320]) {
      // V's log, through the real path.
      const P = await stats(w, `(${vLog})(${JSON.stringify(MON)})`);
      const R = await radarNow(P.page);
      ok(R && R.sets.length === 2, `1. ${w} px, a log like V's: the radar draws both datasets`, R && R.sets.length);
      if (R) {
        const bad = R.nums.map(n => ({ n: n.t, hits: meets(n.box, R.sets) })).filter(x => x.hits.length);
        ok(!bad.length, `1. ${w} px, a log like V's: no ring number covers a dot or a line`, bad);
        const named = R.nums.map(n => +n.t).sort((a, b) => a - b);
        const rings = []; for (let v = 50; v <= R.max; v += 50) rings.push(v);
        ok(JSON.stringify(named) === JSON.stringify(rings), `1. ${w} px, a log like V's: every ring is named once (a guard)`, { named, rings });
      }
      await P.ctx.close();
      // The demo, then 120 readings at random on the same chart, each drawn as the app draws it.
      const D = await stats(w, () => window.__ironlog.makeDemo());
      const R0 = await radarNow(D.page);
      const bad0 = R0 ? R0.nums.map(n => ({ n: n.t, hits: meets(n.box, R0.sets) })).filter(x => x.hits.length) : ['no radar'];
      ok(!bad0.length, `1. ${w} px, the demo: no ring number covers a dot or a line`, bad0);
      let worst = null, cases = 0;
      for (let k = 0; k < 120; k++) {
        const vals = await D.page.evaluate(k => {
          // A small fixed generator, so a failure names the same readings every run.
          let s = 1234567 + k * 7919; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
          const ch = window.Chart.getChart(document.getElementById('chRadar'));
          const mode = k % 4;
          const v = ch.data.labels.map(() => mode === 0 ? Math.round(rnd() * 200) : mode === 1 ? [0, 25, 50, 100, 150, 200][Math.floor(rnd() * 6)] : mode === 2 ? Math.round(40 + rnd() * 30) : Math.round(rnd() * 120));
          ch.data.datasets[0].data = v; ch.data.datasets[0].real = v;
          ch.options.scales.r.max = Math.min(200, Math.max(150, Math.ceil(Math.max(...v) / 50) * 50));
          window.__texts.length = 0; ch.update('none');
          return v;
        }, k);
        const Rk = await radarNow(D.page);
        cases++;
        const badk = Rk.nums.map(n => ({ n: n.t, hits: meets(n.box, Rk.sets) })).filter(x => x.hits.length);
        if (badk.length && !worst) worst = { vals, badk };
      }
      ok(!worst, `1. ${w} px, ${cases} readings at random: no ring number covers a dot or a line`, worst);
      await D.ctx.close();
    }
  }

  // ---- 2. No chart writes one text over another, and every dot is drawn whole.
  if (run(2)) {
    for (const w of [320, 375, 390]) {
      const setup = async ctx => ctx.addInitScript(RECORD_TEXT);
      const P = await open(FILE, { browser, w, h: 844, dpr: 2, clock: MON + 'T18:00:00', setup });
      await P.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.invalidate(); L.ui.tab = 'dash'; L.ui.dashEx = 'bench'; for (const k of ['volume', 'exercise', 'body']) L.ui.folds['dash:' + k] = true; L.render(); });
      await wait(300);
      for (const mode of ['region', 'trend', 'load', 'week', 'avg']) {
        await P.page.evaluate(m => { const L = window.__ironlog; L.ui.volMode = m; L.render(); }, mode);
        await wait(300);
        const r = await P.page.evaluate(() => {
          const out = { charts: [], over: [], cut: [] };
          for (const c of document.querySelectorAll('#view canvas')) {
            const ch = window.Chart.getChart(c); if (!ch || !c.clientWidth) continue;
            out.charts.push(c.id);
            // One draw of this chart, its texts read off it.
            window.__texts.length = 0; ch.draw();
            const tx = window.__texts.filter(x => x.id === c.id && !x.rot);
            for (let i = 0; i < tx.length; i++) for (let j = i + 1; j < tx.length; j++) {
              const a = tx[i].box, b = tx[j].box;
              const ow = Math.min(a.r, b.r) - Math.max(a.l, b.l), oh = Math.min(a.b, b.b) - Math.max(a.t, b.t);
              if (ow > 0.5 && oh > 0.5) out.over.push(`${c.id}: "${tx[i].t}" and "${tx[j].t}"`);
            }
            // Each dot of a line dataset, whole: the canvas has paint at four points inside its edge.
            const g = c.getContext('2d'), dpr = ch.currentDevicePixelRatio || 1;
            ch.data.datasets.forEach((d, i) => {
              const meta = ch.getDatasetMeta(i);
              if (meta.type !== 'line' || !ch.isDatasetVisible(i)) return;
              meta.data.forEach((p, k) => {
                const rr = p.options && p.options.radius; if (!(rr >= 2) || p.skip) return;
                for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                  const a = g.getImageData(Math.round((p.x + dx * rr * 0.6) * dpr), Math.round((p.y + dy * rr * 0.6) * dpr), 1, 1).data[3];
                  if (!a) { out.cut.push(`${c.id} "${d.label}" dot ${k} at ${Math.round(p.x)},${Math.round(p.y)}`); break; }
                }
              });
            });
          }
          return out;
        });
        ok(r.charts.length > 0, `2. ${w} px, ${mode}: the charts drew (${r.charts.join(', ')})`);
        ok(!r.over.length, `2. ${w} px, ${mode}: no chart writes one text over another`, r.over);
        ok(!r.cut.length, `2. ${w} px, ${mode}: every dot is drawn whole`, r.cut);
      }
      await P.ctx.close();
    }
  }

  // ---- 3. Two sessions of a lift on one day.
  if (run(3)) {
    const LBk = 0.45359237;
    const plan = { sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 120, inc: 5 * LBk };
    const sess = (id, date, startH, reps, w = 140) => ({ id, date, startedAt: Date.parse(date + 'T' + String(startH).padStart(2, '0') + ':00:00'), durMin: 50, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: reps.map(r => ({ w: w * LBk, r, rir: 2 })) }] });
    const ask = async (clock, sessions) => {
      const P = await open(FILE, { browser, clock });
      const r = await P.page.evaluate(([sessions, plan]) => {
        const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.unit = 'lb';
        // 5 lb a step set on the bench (the default by equipment is section 4), and the target asked as a session
        // started on the clock's day asks it.
        S.sessions = sessions; L.state = L.normalize(S); L.state.exercises.find(e => e.id === 'bench').inc = 5 * 0.45359237; L.invalidate();
        const g = L.suggest('bench', plan, { before: L.today() });
        return { w: g.w == null ? null : Math.round(g.w / 0.45359237 * 10) / 10, lastR: g.lastR, tgt: g.tgt, text: g.text };
      }, [sessions, plan]);
      await P.ctx.close();
      return r;
    };
    const base = [sess('a', '2026-10-19', 8, [10, 10, 10], 135)];
    const EVE = [9, 9, 9];
    // (a) The second session the same day.
    const a = await ask('2026-10-26T17:00:00', [...base, sess('b', '2026-10-26', 8, [10, 10, 10])]);
    ok(a.w === 140, '3. after 140 x 10 x 3 this morning, a second bench session today asks 140, not 145', a);
    ok(JSON.stringify(a.lastR) === '[10,10,10]' && !a.tgt, '3. ... for the same reps, with nothing set to beat', a);
    ok(/^Earlier today: 140×10, 140×10, 140×10\. /.test(a.text || ''), '3. ... and says it is the same as earlier today', a.text);
    // V's example: the morning short of the range's top.
    const a2 = await ask('2026-10-26T17:00:00', [...base, sess('b', '2026-10-26', 8, [7, 7, 6])]);
    ok(a2.w === 140 && JSON.stringify(a2.lastR) === '[7,7,6]' && !a2.tgt, "3. V's example: 140 x 7, 7, 6 this morning asks 140 x 7, 7, 6 again tonight, nothing to beat", a2);
    // (b) The next day, from the day's best.
    const b = await ask('2026-10-29T17:00:00', [...base, sess('b', '2026-10-26', 8, [10, 10, 10]), sess('c', '2026-10-26', 17, EVE)]);
    ok(b.w === 145, "3. the day after a morning at 140 x 10 x 3 and a weaker evening, the target steps up from the morning to 145", b);
    const g = await ask('2026-10-29T17:00:00', [...base, sess('b', '2026-10-26', 8, [7, 7, 6]), sess('c', '2026-10-26', 17, [9, 9, 8])]);
    ok(g.w === 140 && g.tgt && g.tgt.total === 26, '3. a guard: when the evening is the better session, the next target reads it (beat 26 reps at 140)', g);
    // Through the screens: the evening session started from Today, its grey numbers.
    const P = await open(FILE, { browser, clock: '2026-10-26T17:00:00' });
    await P.page.evaluate(([sessions, plan]) => {
      const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false;
      S.routines = [{ id: 'R1', name: 'Mine', schedule: 'weekly', days: [{ id: 'D1', name: 'Push', items: [{ uid: 'u1', exId: 'bench', ss: null, ...plan }] }] }]; S.activeRoutineId = 'R1';
      S.sessions = sessions; L.state = L.normalize(S); L.state.exercises.find(e => e.id === 'bench').inc = 5 * 0.45359237; L.invalidate(); L.ui.tab = 'today'; L.render();
    }, [[...base, sess('b', '2026-10-26', 8, [10, 10, 10])], plan]);
    await wait(150);
    await P.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])');
    await wait(250);
    const blk = await P.page.evaluate(() => { const d = window.__ironlog.state.draft; const b = d && d.ex.find(x => x.exId === 'bench'); return b && { w: [b.sw == null ? null : Math.round(b.sw / 0.45359237)], reps: b.lastR, hint: b.hint, tgt: b.tgt }; });
    ok(blk && blk.w[0] === 140 && JSON.stringify(blk.reps) === '[10,10,10]' && !blk.tgt && /^Earlier today/.test(blk.hint || ''), '3. started from Today, the evening bench shows 140 x 10 in grey, nothing to beat, and why', blk);
    await P.ctx.close();
  }

  // ---- 4. The default load step by how a lift is loaded.
  if (run(4)) {
    const LBk = 0.45359237;
    const P = await open(FILE, { browser, clock: '2026-10-26T10:00:00' });
    const next = (unit, exId, w, rr, o = {}) => P.page.evaluate(([unit, exId, w, rr, o]) => {
      const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
      S.settings.onboarded = true; S.settings.unit = unit; delete S.settings.gym;
      if (o.gym) S.settings.gym = o.gym;
      const kg = v => unit === 'kg' ? v : v * LB;
      const mk = (id, date) => ({ id, date, notes: '', ex: [{ exId, rr, sets: [0, 1, 2].map(() => ({ w: kg(w), r: rr[1], rir: 1 })) }] });
      S.sessions = [mk('a', '2026-10-12'), mk('b', '2026-10-19')];
      L.state = L.normalize(S);
      for (const e of L.state.exercises) if (e.id === exId) { if (o.step) e.inc = kg(o.step); else delete e.inc; }
      L.invalidate();
      const plan = { sets: 3, repMin: rr[0], repMax: rr[1], rir: 1, rest: 120, inc: 5 * LB };
      const g = L.suggest(exId, plan, {});
      return Math.round((unit === 'kg' ? g.w : g.w / LB) * 100) / 100;
    }, [unit, exId, w, rr, o]);
    const cases = [
      ['a barbell bench', 'lb', 'bench', 135, [6, 10], 145],
      ['a barbell bench in kg', 'kg', 'bench', 60, [6, 10], 65],
      ['a Smith incline press', 'lb', 'smithInc', 135, [6, 10], 145],
      ['a pin-loaded chest press', 'lb', 'machPress', 100, [8, 12], 110],
      ['a seated cable row', 'lb', 'cableRow', 100, [8, 12], 110],
      ['a cable row in kg', 'kg', 'cableRow', 45, [8, 12], 50],
      ['dumbbell presses', 'lb', 'dbBench', 60, [8, 12], 65],
      ['dumbbell presses in kg', 'kg', 'dbBench', 30, [8, 12], 32],
      ['a hack squat typed a side', 'lb', 'hackSquat', 90, [8, 12], 95],
      ['a kettlebell swing', 'lb', 'kbSwing', 53, [10, 15], 58]
    ];
    for (const [name, unit, exId, w, rr, want] of cases) {
      const got = await next(unit, exId, w, rr);
      ok(got === want, `4. ${name} at ${w} ${unit}, every set at the top: next ${want} ${unit}`, { got });
    }
    // Guards: the lift's own step, and Your gym's plates, come first.
    const own = await next('lb', 'bench', 135, [6, 10], { step: 5 });
    ok(own === 140, '4. a guard: a 5 lb step set on the bench still steps 135 to 140', { own });
    const gym = await next('lb', 'bench', 135, [6, 10], { gym: { u: 'lb', plates: [45, 35, 25, 10, 5, 2.5] } });
    ok(gym === 140, "4. a guard: Your gym with 2.5 lb plates still steps the bench 135 to 140", { gym });
    // Back after six weeks on the default 10 lb step.
    const climb = await P.page.evaluate(() => {
      const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
      S.settings.unit = 'lb'; delete S.settings.gym;
      const ses = (id, date, w, reps, rir) => ({ id, date, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: reps.map(r => ({ w: w * LB, r, rir })) }] });
      const plan = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB };
      const pre = [ses('b1', '2026-08-17', 185, [8, 7, 7], 1), ses('b2', '2026-08-24', 185, [8, 8, 7], 1), ses('b3', '2026-08-31', 185, [8, 8, 7], 1)];
      const out = [];
      const ask = (list, before) => { S.sessions = list; L.state = L.normalize(S); for (const e of L.state.exercises) if (e.id === 'bench') delete e.inc; L.invalidate(); return Math.round(L.suggest('bench', plan, before ? { before } : {}).w / LB); };
      out.push(ask(pre, '2026-10-12'));
      const a = [...pre, ses('r0', '2026-10-12', 165, [10, 10, 10], 2)];
      out.push(ask(a));
      const b = [...a, ses('r1', '2026-10-15', 175, [10, 10, 10], 1)];
      out.push(ask(b));
      const c = [...b, ses('r2', '2026-10-19', 185, [8, 8, 7], 1)];
      out.push(ask(c));
      return out;
    });
    ok(JSON.stringify(climb) === '[165,175,185,185]', '4. back after six weeks on the default 10 lb step: 165, then 175, then the 185 from before, and no further', climb);
    await P.ctx.close();
  }

  // ---- 5 and 6: a fixed-weekday routine: Push Mon, Pull Tue, Legs Wed, the rest rest days.
  const LBw = 0.45359237;
  const it = (u, exId, extra) => ({ uid: u, exId, sets: 3, repMin: 8, repMax: 12, rir: 2, rest: 90, inc: 5 * LBw, ss: null, ...(extra || {}) });
  const weekR = (mon) => ({ id: 'RW', name: 'Week', schedule: 'weekly', days: [
    { id: 'Dmon', name: 'Push', rest: false, items: [it('a1', 'bench'), it('a2', 'ohp'), ...(mon || [])] },
    { id: 'Dtue', name: 'Pull', rest: false, items: [it('b1', 'cableRow')] },
    { id: 'Dwed', name: 'Legs', rest: false, items: [it('c1', 'backSquat')] },
    { id: 'Dthu', name: 'Rest', rest: true, items: [] }, { id: 'Dfri', name: 'Rest', rest: true, items: [] },
    { id: 'Dsat', name: 'Rest', rest: true, items: [] }, { id: 'Dsun', name: 'Rest', rest: true, items: [] }] });
  const wkSess = (id, date, di, dayId, dayName, extra) => ({ id, date, dayIdx: di, dayId, dayName, routineId: 'RW', notes: '', t: Date.parse(date + 'T09:00:00'), ex: [{ exId: 'bench', rr: [8, 12], sets: [{ w: 60, r: 10, rir: 2 }] }], ...(extra || {}) });
  const weekPage = async (clock, routine, sessions) => {
    const P = await open(FILE, { browser, clock });
    await P.page.evaluate(([R, ss]) => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false; S.routines = [R]; S.activeRoutineId = R.id; S.sessions = ss; S.draft = null; L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = null; L.render(); }, [routine, sessions]);
    await wait(150);
    return P;
  };
  const card = page => page.evaluate(() => { const h = document.querySelector('#view .hero'); const st = h && h.querySelector('[data-act="startSession"]'); return h ? { name: ((h.querySelector('h2') || {}).textContent || '').trim(), eye: ((h.querySelector('.eyebrow') || {}).textContent || '').replace(/\s+/g, ' ').trim(), note: ((h.querySelector('.hero-note') || {}).textContent || '').replace(/\s+/g, ' ').trim(), day: st ? st.dataset.day : null, part: st ? st.dataset.part || null : null } : null; });
  const bar = page => page.evaluate(() => [...document.querySelectorAll('#wkbar .w')].map(w => ({ cls: w.className, label: w.getAttribute('aria-label') || '' })));
  const finishNow = async page => {
    await page.evaluate(() => { const L = window.__ironlog; for (const b of L.state.draft.ex) for (const x of b.sets) { x.w = x.w == null ? 50 * 0.45359237 : x.w; x.r = x.r || 10; x.done = true; } L.saveNow(); L.render(); });
    await page.click('#view [data-act="finish"]');
    for (let k = 0; k < 6; k++) { await wait(150); const kind = await page.evaluate(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind); if (kind !== 'confirm') break; await page.click('#modal [data-act="mOk"]'); }
    await page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    await wait(150);
  };

  if (run(5)) {
    // Plan: a second workout added to Monday, named, and an exercise moved into it.
    const P = await weekPage('2026-11-02T08:00:00', weekR(), []);
    const pg = P.page;
    await pg.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.ui.planView = 'routine'; L.ui.dayFocus = 'Dmon'; for (const k of ['routine', 'schedule', 'days']) L.ui.folds['program:' + k] = true; L.render(); });
    await wait(150);
    const addBtn = await pg.$('#view [data-act="pickDay"][data-day="0"][data-part="2"]');
    ok(!!addBtn && /Add a second workout/.test(await addBtn.innerText()), '5. Plan offers "Add a second workout" on a weekday');
    if (addBtn) {
      await addBtn.click(); await wait(150);
      await pg.evaluate(() => { const L = window.__ironlog; L.ACT.pickDo({ dataset: { ex: 'dbCurl' } }); }); await wait(150);
    }
    const mon = await pg.evaluate(() => { const d = window.__ironlog.state.routines[0].days[0]; return d.items.map(i => i.exId + (i.pm ? ':pm' : '')); });
    ok(JSON.stringify(mon) === '["bench","ohp","dbCurl:pm"]', '5. the curl goes into Monday\'s second workout', mon);
    const pmIn = await pg.$('#view input[data-daypm="0"]');
    ok(!!pmIn, "5. with a second workout, the day asks the second workout's name");
    if (pmIn) { await pg.fill('#view input[data-daypm="0"]', 'Arms'); await pg.dispatchEvent('#view input[data-daypm="0"]', 'change'); await wait(150); }
    // Move the press into the second workout through Move to.
    await pg.evaluate(() => { const L = window.__ironlog; L.ui.openItem = 'a2'; L.render(); }); await wait(100);
    const opts = await pg.evaluate(() => { const s = document.querySelector('#view select[data-moveto="a2"]'); return s ? [...s.options].map(o => o.value + '|' + o.textContent) : []; });
    ok(opts.includes('0:2|Mon: Arms (second workout)'), '5. Move to lists each weekday\'s second workout', opts.slice(0, 4));
    if (opts.some(o => o.startsWith('0:2|'))) { await pg.selectOption('#view select[data-moveto="a2"]', '0:2'); await wait(150); }
    const mon2 = await pg.evaluate(() => { const d = window.__ironlog.state.routines[0].days[0]; return { items: d.items.map(i => i.exId + (i.pm ? ':pm' : '')), name: d.pmName }; });
    ok(mon2.name === 'Arms' && JSON.stringify(mon2.items) === '["bench","dbCurl:pm","ohp:pm"]', '5. ... and moves the press there, the second workout named Arms', mon2);
    // A week plans both of Monday's workouts.
    const pw = await pg.evaluate(() => window.__ironlog.plannedPerWeek(window.__ironlog.state.routines[0]));
    ok(pw === 4, '5. the week plans four workouts: Monday\'s two, Tuesday and Wednesday', pw);
    // Today: the first workout, then the second.
    await pg.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.ui.todayDay = null; L.render(); }); await wait(150);
    const c1 = await card(pg);
    ok(c1 && c1.name === 'Push' && c1.part === null, '5. Today on Monday starts Push, the first workout', c1);
    await pg.click('#view .hero [data-act="startSession"]'); await wait(200);
    const d1 = await pg.evaluate(() => { const d = window.__ironlog.state.draft; return { ex: d.ex.map(b => b.exId), part: d.part || null }; });
    ok(JSON.stringify(d1) === '{"ex":["bench"],"part":null}', '5. ... with the first workout\'s exercises only', d1);
    await finishNow(pg);
    const c2 = await card(pg);
    ok(c2 && c2.name === 'Arms' && c2.part === '2' && /Push done today\. Next: the day's second workout\./.test(c2.note), '5. then Today offers Arms, the day\'s second workout, and says why', c2);
    await pg.click('#view .hero [data-act="startSession"]'); await wait(200);
    const d2 = await pg.evaluate(() => { const d = window.__ironlog.state.draft; return { ex: d.ex.map(b => b.exId), part: d.part || null, name: d.dayName }; });
    ok(JSON.stringify(d2) === '{"ex":["dbCurl","ohp"],"part":2,"name":"Arms"}', '5. ... started with its own exercises, as the second workout', d2);
    await finishNow(pg);
    const saved = await pg.evaluate(() => window.__ironlog.state.sessions.map(s => ({ name: s.dayName, part: s.part || null, pw: s.pw || null })));
    ok(saved.length === 2 && saved[0].part === null && saved[1].part === 2 && saved[1].name === 'Arms' && saved.every(s => s.pw === 4), '5. saved as the day\'s first and second, each recording the week\'s four', saved);
    // The marks survive normalize, r67 keeps them, and r68 reads them back.
    const st = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__ironlog.state)));
    const back = await pg.evaluate(s => { const n = window.__ironlog.normalize(s); return { d: n.routines[0].days[0], last: n.sessions[n.sessions.length - 1] }; }, st);
    ok(back.d.pmName === 'Arms' && back.d.items.filter(i => i.pm).length === 2 && back.last.part === 2, '5. normalize keeps the marks', { pm: back.d.pmName, part: back.last.part });
    if (!/(^|\/)baselines\//.test(FILE)) {
      const Q = await open('baselines/r67.html', { browser, clock: '2026-11-02T20:00:00' });
      const old = await Q.page.evaluate(s => { const n = window.__ironlog.normalize(s); return JSON.parse(JSON.stringify(n)); }, st);
      await Q.ctx.close();
      const again = await pg.evaluate(s => { const n = window.__ironlog.normalize(s); return { d: n.routines[0].days[0], last: n.sessions[n.sessions.length - 1] }; }, old);
      ok(old.routines[0].days[0].pmName === 'Arms' && old.sessions[1].part === 2 && again.d.items.filter(i => i.pm).length === 2 && again.last.part === 2, '5. a phone on r67 keeps the marks among its extras, and r68 reads them back', { r67: { pm: old.routines[0].days[0].pmName, part: old.sessions[1].part } });
    }
    // To a cycle: one workout a day again, every exercise kept.
    await pg.evaluate(() => { const L = window.__ironlog; L.state.settings.hidden = L.state.settings.hidden.filter(k => k !== 'program:schedule'); L.ui.folds['program:schedule'] = true; L.ui.tab = 'program'; L.ui.bRoutine = 'RW'; L.render(); }); await wait(100);
    const hasSel = !!(await pg.$('#view select[data-bind="rSchedule"]'));
    ok(hasSel, '5. Plan shows the schedule');
    if (hasSel) { await pg.selectOption('#view select[data-bind="rSchedule"]', 'cycle'); await wait(150); }
    const cyc = await pg.evaluate(() => { const R = window.__ironlog.state.routines[0]; const d = R.days[0]; return { sch: R.schedule, items: d.items.map(i => i.exId + (i.pm ? ':pm' : '')), pm: d.pmName || null }; });
    ok(cyc.sch === 'cycle' && JSON.stringify(cyc.items) === '["bench","dbCurl","ohp"]' && cyc.pm === null, '5. switched to a cycle, Monday is one workout again with every exercise', cyc);
    ok(!P.errors.length, '5. no page errors', P.errors);
    await P.ctx.close();
  }

  if (run(6)) {
    // Tuesday, nothing done this week: Monday's Push first, today's Pull a tap away.
    let P = await weekPage('2026-11-03T08:00:00', weekR(), []);
    let c = await card(P.page);
    ok(c && c.name === 'Push' && c.day === '0' && /Planned Mon/.test(c.eye) && /Push, planned Mon, is still to do this week\./.test(c.note), "6. Tuesday with Monday's Push not done: Today offers Push, planned Mon, still to do", c);
    const own = await P.page.$('#view .hero [data-act="todayOwn"]');
    ok(!!own && /Do today's Pull instead/.test(await own.innerText()), "6. ... with today's Pull a tap away");
    let b = await bar(P.page);
    ok(/miss/.test(b[0].cls), '6. ... and Monday reads missed, as it is', b[0]);
    // Push done on Tuesday, from the card.
    await P.page.click('#view .hero [data-act="startSession"]'); await wait(200);
    await finishNow(P.page);
    const s0 = await P.page.evaluate(() => window.__ironlog.state.sessions.map(s => ({ date: s.date, di: s.dayIdx, name: s.dayName })));
    ok(s0.length === 1 && s0[0].di === 0 && s0[0].date === '2026-11-03', "6. Push done on Tuesday is saved as Monday's workout", s0);
    c = await card(P.page);
    ok(c && c.name === 'Pull' && c.day === '1', '6. then Today moves on to Pull, today\'s', c);
    b = await bar(P.page);
    ok(!/miss/.test(b[0].cls) && /moved/.test(b[0].cls) && /Push, done Tue/.test(b[0].label) && /on/.test(b[1].cls), '6. Monday no longer reads missed: "Push, done Tue", and Tuesday reads trained', [b[0], b[1]]);
    ok(!P.errors.length, '6. no page errors (Tuesday)', P.errors);
    await P.ctx.close();
    // Wednesday with Pull not done: Pull first; today's Legs a tap away, and the tap shows it.
    P = await weekPage('2026-11-04T08:00:00', weekR(), [wkSess('w1', '2026-11-03', 0, 'Dmon', 'Push')]);
    c = await card(P.page);
    ok(c && c.name === 'Pull' && /Pull, planned Tue, is still to do this week\./.test(c.note), '6. Wednesday with Pull not done: Pull first', c);
    const ownB = await P.page.$('#view .hero [data-act="todayOwn"]');
    if (ownB) { await ownB.click(); await wait(150); }
    c = await card(P.page);
    ok(c && c.name === 'Legs' && c.day === '2', "6. ... and the tap on today's own shows Legs", c);
    await P.ctx.close();
    // Monday with Push done: the next one up.
    P = await weekPage('2026-11-02T18:00:00', weekR(), [wkSess('w1', '2026-11-02', 0, 'Dmon', 'Push')]);
    c = await card(P.page);
    ok(c && c.name === 'Pull' && /Next up · Tue/.test(c.eye) && /Push done today\. Next up: Pull, planned Tue\./.test(c.note), '6. Monday after Push: Today shows the next one up, Pull, planned Tue', c);
    await P.ctx.close();
    // A guard: Saturday, a rest day, every workout done: the rest day's card.
    P = await weekPage('2026-11-07T10:00:00', weekR(), [wkSess('w1', '2026-11-02', 0, 'Dmon', 'Push'), wkSess('w2', '2026-11-03', 1, 'Dtue', 'Pull'), wkSess('w3', '2026-11-04', 2, 'Dwed', 'Legs')]);
    c = await P.page.evaluate(() => { const h = document.querySelector('#view .hero'); return h ? { name: ((h.querySelector('h2') || {}).textContent || '').trim(), start: !!h.querySelector('[data-act="startSession"]') } : null; });
    ok(c && c.name === 'Rest' && !c.start, '6. a guard: a rest day with nothing behind keeps its card', c);
    await P.ctx.close();
  }

  // ---- 7. Warm-ups added one by one stay distinct.
  if (run(7)) {
    const P = await open(FILE, { browser, clock: '2026-11-02T18:00:00' });
    const r = await P.page.evaluate(() => {
      const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
      S.settings.onboarded = true; S.settings.unit = 'lb'; S.sessions = [];
      S.routines = [{ id: 'RC', name: 'Arms', schedule: 'cycle', days: [{ id: 'DC', name: 'Arms', rest: false, items: [{ uid: 'c1', exId: 'bbCurl', sets: 2, repMin: 8, repMax: 12, rir: 1, rest: 0, inc: 5 * LB, ss: null }] }] }];
      S.activeRoutineId = 'RC'; S.draft = null; L.state = L.normalize(S); L.invalidate();
      L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); L.ACT.startSession({ dataset: { day: '0' } });
      L.state.draft.ex[0].sets.forEach(x => { x.w = 50 * LB; });
      for (let k = 0; k < 3; k++) L.ACT.wAdd({ dataset: { b: '0' } });
      const w = L.state.draft.ex[0].sets.filter(x => x.warm).map(x => Math.round(x.w / LB * 100) / 100);
      L.state.draft = null; return w;
    });
    const distinct = r.length === 3 && r[0] < r[1] && r[1] < r[2] && r[2] < 50;
    ok(distinct, '7. three warm-ups on a 50 lb barbell curl are distinct and under the working load', r);
    await P.ctx.close();
  }

  // ---- 8. The Guide and the sheets say what r68 does (99).
  if (run(8)) {
    for (const unit of ['lb', 'kg']) {
      const P = await open(FILE, { browser, clock: '2026-11-02T18:00:00' });
      const r = await P.page.evaluate(u => {
        const L = window.__ironlog; const S = L.state;
        S.settings.onboarded = true; S.settings.unit = u; L.makeDemo(); L.invalidate(); L.ui.tab = 'today'; L.render();
        L.ACT.guideOpen(document.createElement('button'));
        const guide = (document.querySelector('#modal') || {}).textContent || '';
        L.ui.modal = { kind: 'inc', exId: 'bench' }; L.render();
        const inc = (document.querySelector('#modal') || {}).textContent || '';
        L.ui.modal = null; L.render();
        return { guide, inc };
      }, unit);
      const g = r.guide.replace(/\s+/g, ' ');
      const steps = unit === 'lb' ? /Load steps, with none set on the exercise: 10 lb on a barbell, a Smith machine, or a machine stack; 5 lb on a dumbbell; 5 lb on anything else/ : /Load steps, with none set on the exercise: 5 kg on a barbell, a Smith machine, or a machine stack; 2 kg on a dumbbell; 2\.5 kg on anything else/;
      ok(steps.test(g), `8. the Guide gives the load steps by equipment, in ${unit}`, g.match(/Load steps[^.]*\./));
      if (unit === 'lb') {
        ok(/Fixed weekdays: a workout done on another day counts for its own day/.test(g) && /Add a second workout/.test(g), '8. the Guide says how fixed weekdays adapt and where the second workout is added', g.match(/Fixed weekdays[^<]{0,300}/));
        ok(/a plain day one done on another day/.test(g), '8. the Guide names the week bar\'s plain day, a workout done on another day', g.match(/a red ring[^.]*\./));
        ok(/smallest jump you can load/.test(r.inc) && !/machine or dumbbells/.test(r.inc), '8. the load step sheet fits a barbell lift, not only a machine or dumbbells', r.inc.replace(/\s+/g, ' '));
      }
      await P.ctx.close();
    }
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
