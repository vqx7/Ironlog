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
        S.sessions = sessions; L.state = L.normalize(S); L.invalidate();
        const g = L.suggest('bench', plan, {});
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
      S.sessions = sessions; L.state = L.normalize(S); L.invalidate(); L.ui.tab = 'today'; L.render();
    }, [[...base, sess('b', '2026-10-26', 8, [10, 10, 10])], plan]);
    await wait(150);
    await P.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])');
    await wait(250);
    const blk = await P.page.evaluate(() => { const d = window.__ironlog.state.draft; const b = d && d.ex.find(x => x.exId === 'bench'); return b && { w: [b.sw == null ? null : Math.round(b.sw / 0.45359237)], reps: b.lastR, hint: b.hint, tgt: b.tgt }; });
    ok(blk && blk.w[0] === 140 && JSON.stringify(blk.reps) === '[10,10,10]' && !blk.tgt && /^Earlier today/.test(blk.hint || ''), '3. started from Today, the evening bench shows 140 x 10 in grey, nothing to beat, and why', blk);
    await P.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
