/* Stats' charts (r58, phase 5): drawn with Chart.js after Stats is drawn,
   into the canvases its template leaves (chMuscle, chRadar, chEx, chVol,
   chBW), from the same readings the screen's numbers use, and taken down
   before every draw (killCharts). Moved from src/22-plan-stats.js with Stats,
   with the chart windows Stats and its charts share. Chart.js is loaded by
   the page (03-body.html); without it nothing is drawn and every number on
   the page still reads, as Stats says. */

import { MK, isCompound, noE1 } from './library';
import { RANGES, firstDate, rangeWeeks, weeksSpan, CHART_WEEKS } from './charts';
import { fmtDate } from './format';
import { loadNote } from './loads';
import { addDays, daysBetween, r1, today, weekStart, WEEK_DAYS, PERCENT } from './util';
import { log } from './storage';
import { EX, IDX, U, hasTarget, regionBalance, toD } from './live';
import { state, ui } from './store';
import { fmtDateLong, fmtE, regionSrc } from './display';

/** How Stats' charts are drawn (Chart.js settings, set by eye): the legend's
    boxes and gap, the most ticks on each axis, about how many ticks a day
    axis gets, the radar's legend box, ring step and least reach, the fonts,
    the tooltip, bars, lines and points, the dashes of a target band, the
    radar's minimum and the RIR line, the room over the tallest bar and the
    step its scale rounds to, and the days a lift's chart and the bodyweight
    chart show at least. */
const CS = {
  legendBox: 10,
  legendGap: 12,
  xTicks: 7,
  yTicks: 6,
  dayTicks: 6,
  radarLegendBox: 12,
  radarStep: 50,
  radarMin: 150,
  /* The radar is drawn up to 200% (r29): a minimum brought down to 2 sets read 8 sets as 400%, and the ring and every
     other spoke shrank to a quarter. The real share is in the table and the tooltip. */
  radarMax: 200,
  radarPoint: 3,
  font: 11,
  tickFont: 10,
  tipPad: 9,
  tipRadius: 8,
  barRadius: 4,
  lineWidth: 2.5,
  hoverRadius: 6,
  prRadius: 5.5,
  pointRadius: 2.5,
  bandDash: [3, 3],
  minDash: [5, 4],
  rirDash: [2, 3],
  rirWidth: 1.5,
  tension: 0.3,
  yHead: 1.1,
  yRound: 5,
  exDays: 42,
  bwDays: 28
};
import { RIR_CALL_TOP } from './formulas';

/* ---------- chart windows ----------
   Charts start where your data starts. A weekly chart used to open eight
   weeks back whatever you had logged, so a new log sat on a row of empty
   weeks. Now the first logged week is the left edge; while there is less
   than a full window of data, the weeks ahead fill the rest, empty and
   marked as upcoming, and each new week lands in the next slot. Once there
   is more history than the window, it follows the current week, and the
   range chips (8 weeks, 6 months, all) bring the past back into view.
   Line charts (a lift's strength, bodyweight) use real dates on the x axis,
   so gaps between sessions look like gaps, and they leave room ahead in
   the same way until the data fills it. */

/** The range a chart's chips have picked this visit, else its default. */
export function rangeKey(id: string, def?: string): string {
  const k = ui.rng[id];
  return RANGES.some(r => r[0] === k) && typeof k === 'string' ? k : def || 'base';
}
/** A weekly chart's weeks, oldest first, each marked when it is still ahead. */
export function weekWindow(first: string | null, id: string, base?: number): { wk: string; fut: boolean }[] {
  const b = base || CHART_WEEKS;
  const cur = weekStart(today());
  if (!first) return [];
  const fw = weekStart(first);
  const n = weeksSpan(first);
  if (n <= b)
    return Array.from({ length: b }, (_, k) => {
      const wk = addDays(fw, WEEK_DAYS * k);
      return { wk, fut: wk > cur };
    });
  const span = Math.min(n, Math.max(b, rangeWeeks(rangeKey(id), b)));
  return Array.from({ length: span }, (_, k) => ({ wk: addDays(cur, -WEEK_DAYS * (span - 1 - k)), fut: false }));
}
/* Linear date axis: day numbers from a base date, labelled as dates. The
   window follows the same rule as the weekly one, and minSpan days of room
   stay ahead of the first point until the data fills them. */
function dayWindow(
  base: string,
  lastDay: number,
  id: string,
  minSpan: number,
  def?: string
): { min: number; max: number } {
  const todayN = daysBetween(base, today());
  let right = Math.max(lastDay, todayN);
  const w = rangeWeeks(rangeKey(id, def), CHART_WEEKS);
  const left = w === Infinity ? 0 : Math.max(0, right - w * WEEK_DAYS + 1);
  if (right - left < minSpan) right = left + minSpan;
  return { min: left, max: right };
}

/* ---------- Chart.js, as the page uses it ---------- */

/** A chart's tick, as Chart.js hands a tick's colour function. */
interface TickCtx {
  tick?: { value: number } | undefined;
  index: number;
}
/** An axis's ticks. */
interface Ticks {
  color?: string | ((c: TickCtx) => string) | undefined;
  maxRotation?: number | undefined;
  autoSkip?: boolean | undefined;
  maxTicksLimit?: number | undefined;
  font?: { size: number } | undefined;
  stepSize?: number | undefined;
  includeBounds?: boolean | undefined;
  callback?: ((v: number) => string) | undefined;
  showLabelBackdrop?: boolean | undefined;
  backdropColor?: string | undefined;
  backdropPadding?: number | undefined;
  z?: number | undefined;
}
/** An axis. */
interface Axis {
  type?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  stacked?: boolean | undefined;
  display?: boolean | undefined;
  position?: string | undefined;
  ticks?: Ticks | undefined;
  grid?: { display?: boolean; color?: string; drawOnChartArea?: boolean } | undefined;
  border?: { color?: string; display?: boolean } | undefined;
  title?: { display: boolean; text: string; color: string } | undefined;
}
/** A tooltip's line, as Chart.js hands it to a callback. */
interface TipItem {
  dataIndex: number;
  datasetIndex: number;
  raw: unknown;
  parsed: { x: number };
  formattedValue: string;
  dataset: { label?: string; real?: readonly number[] };
}
/** A tooltip's callbacks and filter. */
interface Tooltip {
  filter?: (it: TipItem) => boolean;
  callbacks?: {
    title?: (its: TipItem[]) => string;
    label?: (it: TipItem) => string;
    afterLabel?: (it: TipItem) => string;
    footer?: (its: TipItem[]) => string;
  };
}
/** The options of a line or bar chart. */
interface Opts {
  responsive: boolean;
  maintainAspectRatio: boolean;
  animation: boolean;
  interaction: { mode: string; intersect: boolean; axis?: string };
  plugins: {
    legend: {
      position?: string;
      labels: {
        color: string;
        boxWidth: number;
        boxHeight?: number;
        padding?: number;
        filter?: (it: { text: string }) => boolean;
      };
    };
    tooltip?: Tooltip;
  };
  scales: { x: Axis; y: Axis; y1?: Axis };
}
/** A chart made. */
interface ChartObj {
  destroy(): void;
}
/** Chart.js's constructor and the defaults the page sets. */
interface ChartLib {
  new (el: HTMLCanvasElement, cfg: { type: string; data: unknown; options: unknown }): ChartObj;
  /** The chart drawn in a canvas, if any. */
  getChart(el: HTMLCanvasElement): { resize(): void } | undefined;
  defaults: {
    font: { family: string; size: number };
    color: string;
    plugins: {
      tooltip: {
        backgroundColor: string;
        titleColor: string;
        bodyColor: string;
        padding: number;
        cornerRadius: number;
        displayColors: boolean;
        titleFont: { weight: string };
      };
    };
    elements: {
      bar: { borderRadius: number; borderSkipped: boolean };
      line: { borderWidth: number };
      point: { hoverRadius: number };
    };
  };
}
declare global {
  interface Window {
    /** Chart.js, when the page could load it. */
    Chart?: ChartLib | undefined;
  }
}

const charts: ChartObj[] = [];
/* A chart created inside a closed <details> has no size; it is given one
   when the fold opens. */
/** Sizes the charts inside a fold just opened. */
export function chartsResize(el: Element): void {
  const C = window.Chart;
  if (!C) return;
  el.querySelectorAll('canvas').forEach(cv => {
    const ch = C.getChart(cv);
    if (ch)
      try {
        ch.resize();
      } catch (err) {
        // The chart is gone.
      }
  });
}
/** Takes down every chart drawn, before the page draws again. */
export function killCharts(): void {
  while (charts.length) {
    const c = charts.pop();
    try {
      if (c) c.destroy();
    } catch (e) {
      // The chart's canvas was already gone with the screen: nothing to take down.
    }
  }
}

function cssv(n: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}
function baseOpts(): Opts {
  const ink = cssv('--muted'),
    line = cssv('--line');
  // Vertical gridlines removed and the y axis line dropped: the data carries the
  // chart, not the frame. Legend sits under the plot so it never squeezes it.
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: ink, boxWidth: CS.legendBox, boxHeight: CS.legendBox, padding: CS.legendGap }
      }
    },
    scales: {
      x: {
        ticks: { color: ink, maxRotation: 0, autoSkip: true, maxTicksLimit: CS.xTicks },
        grid: { display: false },
        border: { color: line }
      },
      y: { ticks: { color: ink, maxTicksLimit: CS.yTicks }, grid: { color: line + '99' }, border: { display: false } }
    }
  };
}
function dayAxis(base: string, win: { min: number; max: number }): Axis {
  const span = win.max - win.min;
  // Whole weeks a tick, about CS.dayTicks of them.
  const step = Math.max(WEEK_DAYS, Math.ceil(span / CS.dayTicks / WEEK_DAYS) * WEEK_DAYS);
  return {
    type: 'linear',
    min: win.min,
    max: win.max,
    ticks: {
      stepSize: step,
      includeBounds: false,
      maxRotation: 0,
      autoSkip: false,
      callback: v => fmtDate(addDays(base, Math.round(v)))
    }
  };
}
function mkChart(id: string, cfg: { type: string; data: unknown; options: unknown }): void {
  const c = document.getElementById(id);
  const C = window.Chart;
  if (!(c instanceof HTMLCanvasElement) || !C) return;
  try {
    charts.push(new C(c, cfg));
  } catch (e) {
    log('chart', e);
  }
}
/* Radar uses a polar scale (r), not x/y, so it needs its own options rather
   than baseOpts(). */
function radarOpts(max: number): unknown {
  const ink = cssv('--muted'),
    line = cssv('--line'),
    surf = cssv('--surface');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { labels: { color: ink, boxWidth: CS.radarLegendBox } },
      tooltip: {
        callbacks: {
          label: (it: TipItem) =>
            `${it.dataset.label}: ${it.dataset.real ? it.dataset.real[it.dataIndex] : it.formattedValue}%`
        }
      }
    },
    scales: {
      r: {
        min: 0,
        max,
        beginAtZero: true,
        // z:1 draws the tick labels above the datasets, so the 100% ring no longer
        // runs through the "100" label.
        ticks: {
          color: ink,
          stepSize: CS.radarStep,
          showLabelBackdrop: true,
          backdropColor: surf,
          backdropPadding: 2,
          font: { size: CS.tickFont },
          z: 1
        },
        grid: { color: line },
        angleLines: { color: line },
        pointLabels: { color: ink, font: { size: CS.font } }
      }
    }
  };
}

/** Draws Stats' charts into the canvases its template left. */
export function mountCharts(): void {
  const C = window.Chart;
  if (!C) return;
  const I = IDX();
  const blue = cssv('--blue'),
    green = cssv('--green'),
    muted = cssv('--muted'),
    yellow = cssv('--yellow');
  try {
    const D = C.defaults;
    D.font.family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    D.font.size = CS.font;
    D.color = muted;
    const tt = D.plugins.tooltip;
    tt.backgroundColor = cssv('--ink');
    tt.titleColor = cssv('--surface');
    tt.bodyColor = cssv('--surface');
    tt.padding = CS.tipPad;
    tt.cornerRadius = CS.tipRadius;
    tt.displayColors = false;
    tt.titleFont = { weight: '600' };
    D.elements.bar.borderRadius = CS.barRadius;
    D.elements.bar.borderSkipped = false;
    D.elements.line.borderWidth = CS.lineWidth;
    D.elements.point.hoverRadius = CS.hoverRadius;
  } catch (e) {
    log('chart', e);
  }
  const cur = weekStart(today());
  const sFirst = firstDate(state.sessions);
  /* Weekly bar charts share one x axis: the window from weekWindow(), weeks
     ahead drawn empty with a fainter label. */
  const weekAxis = (win: readonly { wk: string; fut: boolean }[], o: Opts): string[] => {
    const ink = cssv('--muted');
    const faded = ink + '80';
    o.scales.x.ticks = {
      ...o.scales.x.ticks,
      autoSkip: win.length > CHART_WEEKS,
      maxTicksLimit: win.length > CHART_WEEKS ? CS.xTicks : undefined,
      font: { size: CS.tickFont },
      color: c => {
        const w = win[c.tick ? c.tick.value : c.index];
        return w && w.fut ? faded : ink;
      }
    };
    return win.map(w => (w.wk === cur ? 'This wk' : fmtDate(w.wk)));
  };
  // muscle weekly
  {
    const win = weekWindow(sFirst, 'muscle', CHART_WEEKS);
    const m = MK.find(x => x === ui.dashMuscle);
    if (win.length && m) {
      const confV: (number | null)[] = [],
        assumV: (number | null)[] = [];
      for (const w of win) {
        if (w.fut) {
          confV.push(null);
          assumV.push(null);
          continue;
        }
        const tot = (I.weekSets[w.wk] || {})[m] || 0;
        const c = Math.min((I.weekConf[w.wk] || {})[m] || 0, tot);
        confV.push(r1(c));
        assumV.push(r1(tot - c));
      }
      const [lo, hi] = state.settings.bands[m];
      // The band lines sit on a second, hidden axis so that turning on stacking
      // for the bars cannot stack them on top of each other. Both axes are pinned
      // to the same explicit range so the lines land where they should.
      const yMax =
        Math.ceil((Math.max(hi + 2, ...confV.map((v, i) => (v || 0) + (assumV[i] || 0))) * CS.yHead) / CS.yRound) *
        CS.yRound;
      const mOpts = baseOpts();
      mOpts.scales.x.stacked = true;
      mOpts.scales.y.stacked = true;
      mOpts.scales.y.min = 0;
      mOpts.scales.y.max = yMax;
      mOpts.scales.y1 = {
        display: false,
        stacked: false,
        min: 0,
        max: yMax,
        position: 'right',
        grid: { drawOnChartArea: false }
      };
      mOpts.plugins.legend.labels.filter = it => it.text !== '_bandLo';
      mOpts.plugins.tooltip = {
        filter: it => !(win[it.dataIndex] || { fut: false }).fut || it.datasetIndex > 1,
        callbacks: {
          title: its => {
            const w = its[0] ? win[its[0].dataIndex] : undefined;
            return w ? `Week of ${fmtDate(w.wk)}${w.fut ? ' (ahead)' : ''}` : '';
          }
        }
      };
      const labels = weekAxis(win, mOpts);
      mkChart('chMuscle', {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: state.settings.rirMode === 'off' ? 'Hard sets' : 'RIR logged',
              data: confV,
              backgroundColor: blue,
              yAxisID: 'y'
            },
            { label: 'Assumed hard', data: assumV, backgroundColor: blue + '55', yAxisID: 'y' },
            // No target lines for a muscle with no target (r29; hasTargetIn since r58).
            ...(!hasTarget(m)
              ? []
              : [
                  {
                    type: 'line',
                    label: '_bandLo',
                    data: labels.map(() => lo),
                    borderColor: green + 'aa',
                    borderWidth: 1,
                    borderDash: CS.bandDash,
                    pointRadius: 0,
                    yAxisID: 'y1',
                    fill: false
                  },
                  {
                    type: 'line',
                    label: `Target ${lo} to ${hi}`,
                    data: labels.map(() => hi),
                    borderColor: green + 'aa',
                    borderWidth: 1,
                    borderDash: CS.bandDash,
                    backgroundColor: green + '22',
                    pointRadius: 0,
                    yAxisID: 'y1',
                    fill: '-1'
                  }
                ])
          ]
        },
        options: mOpts
      });
    }
  }
  // balance radar, built from the same source the table on screen uses
  const regs = regionBalance(regionSrc().src);
  // Drawn up to CS.radarMax (r29), the real share in the table and the tooltip.
  const rMax = Math.min(
    CS.radarMax,
    Math.max(CS.radarMin, Math.ceil(Math.max(...regs.map(x => x.pct)) / CS.radarStep) * CS.radarStep)
  );
  const realPct = regs.map(x => Math.round(x.pct));
  mkChart('chRadar', {
    type: 'radar',
    data: {
      labels: regs.map(x => x.label),
      datasets: [
        {
          label: 'Your volume',
          real: realPct,
          data: realPct.map(v => Math.min(v, CS.radarMax)),
          borderColor: blue,
          backgroundColor: blue + '33',
          pointBackgroundColor: blue,
          pointRadius: CS.radarPoint,
          borderWidth: 2
        },
        {
          label: `Minimum (${PERCENT}%)`,
          data: regs.map(() => PERCENT),
          borderColor: green,
          borderDash: CS.minDash,
          pointRadius: 0,
          borderWidth: 2,
          fill: false
        }
      ]
    },
    options: radarOpts(rMax)
  });

  const exId = typeof ui.dashEx === 'string' ? ui.dashEx : null;
  const all = exId ? I.byEx[exId] : undefined;
  if (exId && all && !noE1(EX(exId)) && all.length) {
    // The same choice as the section above: the 1RM estimate, or the top-set load.
    const exE = EX(exId);
    const e1Mode = isCompound(exE) && all.some(x => x.best != null);
    const exps = all.filter(x => (e1Mode ? x.best != null : x.topW != null));
    const e0 = exps[0];
    if (e0) {
      // Real dates on the x axis, counted in days from the first session.
      const base = e0.date;
      const xs = exps.map(x => daysBetween(base, x.date));
      const lastX = xs[xs.length - 1] ?? 0;
      /* The line plots the same estimate as the tile, the table and All-time
         bests, so their numbers agree; the headline says when the trend itself
         is read from loads and reps alone. */
      const vals = exps.map(x => (e1Mode ? +fmtE(x.best) : r1(toD(x.topW ?? 0) ?? 0)));
      // A PR as Recent PRs counts it (r58, 343 6): a session with a set stronger than every earlier one.
      const prOf = exps.map(x => I.prs.find(q => q.big && q.exId === exId && q.sid === x.sid) || null);
      const isPR = prOf.map(p => !!p);
      // A rep PR can land below an earlier best estimate, which read as a mistake
      // when every PR looked the same. New-best sessions are filled, rep PRs hollow.
      const prType = prOf.map(p => (p ? (p.type === 'Weight PR' && p.value != null ? 'WeightE1' : p.type) : null));
      const surf = cssv('--surface');
      // Monotone interpolation: a smoothed curve must never draw a value above or
      // below what was actually logged between two sessions.
      const ds: unknown[] = [
        {
          label: e1Mode ? `Best estimate (${U()})` : `Top set load (${U()}${loadNote(exE)})`,
          data: vals.map((v, i) => ({ x: xs[i], y: v })),
          borderColor: blue,
          backgroundColor: blue + '1f',
          fill: 'start',
          cubicInterpolationMode: 'monotone',
          yAxisID: 'y',
          pointRadius: isPR.map(x => (x ? CS.prRadius : CS.pointRadius)),
          pointStyle: isPR.map(x => (x ? 'rectRot' : 'circle')),
          pointBorderWidth: isPR.map(x => (x ? 2 : 1)),
          pointBackgroundColor: prType.map(t => (t === 'e1RM' || t === 'WeightE1' ? green : t ? surf : blue)),
          pointBorderColor: isPR.map(x => (x ? green : blue))
        }
      ];
      const eo = baseOpts();
      const win = dayWindow(base, lastX, 'ex', CS.exDays, 'all');
      const ax = dayAxis(base, win);
      eo.scales.x = { ...eo.scales.x, ...ax, ticks: { ...eo.scales.x.ticks, ...ax.ticks } };
      eo.interaction = { mode: 'nearest', axis: 'x', intersect: false };
      const prWords: Record<string, string> = {
        e1RM: e1Mode ? 'New best estimate' : 'PR',
        WeightE1: e1Mode ? 'Weight PR and a new best estimate' : 'Weight PR: more weight than ever before',
        'Weight PR': 'Weight PR: more weight than ever before'
      };
      eo.plugins.tooltip = {
        callbacks: {
          title: its => (its[0] ? fmtDateLong(addDays(base, Math.round(its[0].parsed.x))) : ''),
          afterLabel: it => {
            const t = prType[it.dataIndex];
            return it.datasetIndex === 0 && t ? prWords[t] || 'Rep PR: more reps at a load than ever before' : '';
          }
        }
      };
      if (exps.some(x => x.topRir != null)) {
        ds.push({
          label: 'RIR at top load',
          data: exps.map((x, i) => ({ x: xs[i], y: x.topRir == null ? null : r1(x.topRir) })),
          borderColor: yellow,
          backgroundColor: yellow,
          borderDash: CS.rirDash,
          borderWidth: CS.rirWidth,
          pointRadius: 2,
          spanGaps: true,
          fill: false,
          yAxisID: 'y1'
        });
        eo.scales.y1 = {
          position: 'right',
          min: 0,
          max: RIR_CALL_TOP,
          ticks: { color: cssv('--muted'), stepSize: 1 },
          grid: { drawOnChartArea: false },
          border: { display: false },
          title: { display: true, text: 'RIR', color: cssv('--muted') }
        };
      }
      mkChart('chEx', { type: 'line', data: { datasets: ds }, options: eo });
    }
  }
  /* One bar per week, split by the session it came from. Session-by-session
     bars alternated chest days with leg days, which are not comparable; weeks
     are. The unfinished current week is labelled as such. */
  {
    const win = weekWindow(sFirst, 'vol', CHART_WEEKS);
    const wks = win.map(w => w.wk);
    if (win.length) {
      const baseName = (n: string | null | undefined): string =>
        String(n || 'Session').replace(/ \((lighter|deload)\)$/, '');
      const types: string[] = [];
      const byT: Record<string, (number | null)[]> = {};
      for (const x of I.sessVol) {
        const i = wks.indexOf(weekStart(x.date));
        if (i < 0) continue;
        const t = baseName(x.day);
        let row = byT[t];
        if (!row) {
          row = byT[t] = wks.map((_, j) => ((win[j] || { fut: false }).fut ? null : 0));
          types.push(t);
        }
        row[i] = (row[i] || 0) + x.vol;
      }
      const pal = [blue, green, yellow, cssv('--red'), '#8b5cf6', '#14b8a6', '#f97316', muted];
      const vo = baseOpts();
      vo.scales.x.stacked = true;
      vo.scales.y.stacked = true;
      const labels = weekAxis(win, vo);
      vo.plugins.tooltip = {
        filter: it => it.raw != null,
        callbacks: {
          title: its => {
            const w = its[0] ? wks[its[0].dataIndex] : undefined;
            return w ? `Week of ${fmtDate(w)}` : '';
          },
          label: it => `${it.dataset.label}: ${Math.round(Number(it.raw)).toLocaleString()} ${U()}`,
          footer: its => {
            const it = its[0];
            if (!it) return '';
            const i = it.dataIndex;
            const tot = types.reduce((a, t) => a + (toD((byT[t] || [])[i] || 0) ?? 0), 0);
            return `Week total: ${Math.round(tot).toLocaleString()} ${U()}`;
          }
        }
      };
      mkChart('chVol', {
        type: 'bar',
        data: {
          labels,
          datasets: types.map((t, i) => ({
            label: t,
            data: (byT[t] || []).map(v => (v == null ? null : Math.round(toD(v) ?? 0))),
            backgroundColor: (pal[i % pal.length] || muted) + (i < pal.length ? '' : '99'),
            borderRadius: 2,
            stack: 'v'
          }))
        },
        options: vo
      });
    }
  }
  const bw = [...state.bodyweights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const b0 = bw[0];
  if (b0) {
    const avg = bw.map(b => {
      const from = addDays(b.date, -(WEEK_DAYS - 1));
      const w = bw.filter(x => x.date >= from && x.date <= b.date);
      return r1(toD(w.reduce((a, x) => a + x.kg, 0) / w.length) ?? 0);
    });
    const base = b0.date;
    const xs = bw.map(b => daysBetween(base, b.date));
    const win = dayWindow(base, xs[xs.length - 1] ?? 0, 'bw', CS.bwDays, 'all');
    const ax = dayAxis(base, win);
    const bo = baseOpts();
    bo.scales.x = { ...bo.scales.x, ...ax, ticks: { ...bo.scales.x.ticks, ...ax.ticks } };
    bo.interaction = { mode: 'nearest', axis: 'x', intersect: false };
    bo.plugins.tooltip = {
      callbacks: { title: its => (its[0] ? fmtDateLong(addDays(base, Math.round(its[0].parsed.x))) : '') }
    };
    mkChart('chBW', {
      type: 'line',
      data: {
        datasets: [
          {
            label: `Bodyweight (${U()})`,
            data: bw.map((b, i) => ({ x: xs[i], y: r1(toD(b.kg) ?? 0) })),
            borderColor: muted,
            backgroundColor: muted,
            pointRadius: 2,
            showLine: false
          },
          {
            label: `${WEEK_DAYS}-day average`,
            data: avg.map((v, i) => ({ x: xs[i], y: v })),
            borderColor: blue,
            pointRadius: 0,
            tension: CS.tension,
            borderWidth: 2
          }
        ]
      },
      options: bo
    });
  }
}
