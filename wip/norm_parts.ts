/** A word from a list, as the list holds it, or undefined when the value is none of them. */
const pick = <W extends string>(v: unknown, list: readonly W[]): W | undefined => list.find(w => w === v);
/** The strings of a list that pass a test, in their order. */
const strings = (l: readonly unknown[], ok: (s: string) => boolean): string[] =>
  l.flatMap(k => (typeof k === 'string' && ok(k) ? [k] : []));
/** The muscle keys of a list, in its order (a key twice is kept twice). */
const muscles = (l: readonly unknown[]): MuscleKey[] =>
  l.flatMap(k => {
    const m = MK.find(x => x === k);
    return m ? [m] : [];
  });

/* The settings, merged over the defaults (a save from before a setting
   existed reads it as the app behaved then, not as a new install starts,
   r28: auto-mark off, nothing hidden, the code's own section order; only a
   new device or Erase everything, s the fresh state itself, gets the
   new-install layout and auto-mark on). Each field is worked out from the
   merged copy and written back into it, the copy's own order kept: a field
   it has stays where it stands, and the four a build added after the others
   (the section order, the folds, the fold flag and the height) go last when
   it lacks them, as every build since r28 has put them, so the synced
   settings keep one key order across builds and no build rewrites another's.
   A setting a newer build saved is kept beside these, unread. Optional
   settings stay absent unless set, so older records keep their fingerprints
   and sync does not see them as edited. */
/** The settings of a save, cleaned (above). */
function cleanSettings(s: Rec, f: Fresh): Settings {
  const fresh = s === f;
  const base = fresh ? f.settings : { ...f.settings, autoDone: false, hidden: [] };
  const st: Rec = { ...base, ...spread(s.settings || {}) };
  // The settings as they came, read beside the merged ones for the two fields whose absence means something (the folds, the removed built-ins).
  const sIn = rec(s.settings) || {};
  const accent = pick(st.accent, ['blue', 'volt', 'ember', 'pink']);
  const bwEvery = bwEveryKept(st.bwEvery);
  const restWeeks = (() => {
    const rw = arr(st.restWeeks);
    return rw ? [...new Set(strings(rw, isDate))].sort().slice(-LIMITS.restWeeks) : [];
  })();
  const rirScale = pick(st.rirScale, ['half', 'rpe']);
  const userName = typeof st.userName === 'string' ? st.userName.replace(/\s+/g, ' ').trim().slice(0, LIMITS.name) : '';
  const secOrder = (() => {
    const so = st.secOrder === undefined && fresh ? defaultOrder() : st.secOrder;
    const clean: Record<string, string[]> = {};
    const O = rec(so);
    if (O)
      for (const t of SEC_TABS) {
        const l = arr(O[t]);
        if (l) clean[t] = strings(l, k => safeKey(k) && k.length < LIMITS.secKey).slice(0, LIMITS.secKey);
      }
    return clean;
  })();
  const gym = gymClean(rec(st.gym));
  const profile = profClean(rec(st.profile));
  // The floors a first-run routine pick set (r44): whole sets 0 to 100, in muscle order.
  const bandsFit = (() => {
    const F = rec(st.bandsFit);
    const o: Partial<Record<MuscleKey, number>> = {};
    if (F && !Array.isArray(F))
      for (const m of MK) {
        const v = F[m];
        if (!TRACK_ONLY.has(m) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= LIMITS.weeklySets)
          o[m] = v;
      }
    return o;
  })();
  // The muscles the lifter gave a target with Set a target (r58): in muscle order, never one with a target by default.
  const ownTargets = (() => {
    const o = arr(st.ownTargets);
    return o ? MK.filter(m => !TARGETED.has(m) && o.includes(m)) : [];
  })();
  const hf = arr(st.homeFolded),
    fl = arr(st.folds),
    h = arr(st.hidden),
    pr = arr(st.priorities),
    df = arr(sIn.dashFolded);
  const hc = numOr(st.heightCm, NaN),
    tb = numOr(st.timeBudget, NaN),
    bk = numOr(st.barKg, NaN),
    bg = numOr(st.bwGoalPct, NaN);
  // Built-in exercises the user deleted. Without this the library list silently puts every one of them back on the next load.
  const removedLib = (arr(sIn.removedLib) || []).filter(x => typeof x === 'string').map(fixId);
  const inBands = spread(sIn.bands || {});
  const band = (m: MuscleKey): [number, number] => {
    const b = arr(inBands[m]);
    const lo = b ? clampN(b[0], 0, LIMITS.weeklySets, BANDS[m][0]) : BANDS[m][0];
    const hi = b ? clampN(b[1], 0, LIMITS.weeklySets, BANDS[m][1]) : BANDS[m][1];
    return lo > hi ? [hi, lo] : [lo, hi];
  };
  /* Every muscle's band, in muscle order. Built over an empty record of the
     bands' type and filled for every muscle key just after, which is what the
     cast says: MK is MUSCLES' keys, and MUSCLES names every MuscleKey. */
  const bands = {} as Record<MuscleKey, [number, number]>;
  for (const m of MK) bands[m] = band(m);
  // Each optional setting absent unless set (each kept below is one the merged copy has, so it stays where it stands).
  const vals: Settings = {
    unit: st.unit === 'kg' ? 'kg' : 'lb',
    theme: pick(st.theme, ['system', 'dark', 'light']) ?? 'system',
    // Timer and logging preferences. Older saves have none of these, so each falls back to exactly how the app behaved before they existed.
    timerMode: pick(st.timerMode, ['auto', 'manual', 'off']) ?? 'auto',
    timerSound: st.timerSound !== false,
    timerCompact: st.timerCompact === true,
    autoDone: st.autoDone === true,
    // Optional settings added in r20 stay undefined unless set.
    ...(accent ? { accent } : {}),
    ...(st.rirAsk === true ? { rirAsk: true } : {}),
    // Count RIR 4 to 5 as half a set (r40): absent unless on.
    ...(st.rirHalf === true ? { rirHalf: true } : {}),
    // r34: adjusting the next sets is on unless turned off; only false is stored, so older saves hash as before.
    ...(st.autoAdj === false ? { autoAdj: false } : {}),
    // r34: weigh-in reminder in days (0 off); absent is every BW_EVERY_DEFAULT days.
    ...(bwEvery !== undefined ? { bwEvery } : {}),
    // r34: Today opens on a blank session; absent is the plan's day.
    ...(st.todayStart === 'free' ? { todayStart: 'free' } : {}),
    // r34: rest weeks, week-start dates; the last two years kept.
    ...(restWeeks.length ? { restWeeks } : {}),
    // r33 (item 206): effort in half points or RPE; absent is whole RIR, so older saves hash as before.
    ...(rirScale ? { rirScale } : {}),
    // r25: suggested loads show grey until typed; 'fill' puts them in the rows as before. Unset means grey (V's choice).
    ...(st.loadFill === 'fill' ? { loadFill: 'fill' } : {}),
    ...(userName ? { userName } : {}),
    homeFolded: hf ? strings(hf, k => oneOf(k, ['map', 'body', 'week', 'tiles', 'coach', 'injuries'])) : [],
    // Section order per tab (drag the ⠿ in a section header): a new install starts in the default order (r28).
    secOrder,
    folds: fl ? strings(fl, k => safeKey(k) && k.length < LIMITS.foldKey).slice(0, LIMITS.folds) : [],
    wakeLock: st.wakeLock === true,
    // Small change plates (r29, item 98): absent unless on, so saves without it hash as before.
    ...(st.smallPlates === true ? { smallPlates: true } : {}),
    // Your gym (r33, item 207) and the profile (r44, item 271): absent unless set, rebuilt in one key order.
    ...(gym ? { gym } : {}),
    ...(profile ? { profile } : {}),
    ...(Object.keys(bandsFit).length ? { bandsFit } : {}),
    ...(ownTargets.length ? { ownTargets } : {}),
    // RIR: on (as logged), cal (on, shifted by your calibration sets), off.
    rirMode: pick(st.rirMode, ['on', 'off', 'cal']) ?? 'on',
    hidden: h ? [...new Set(strings(h, k => HIDEABLE_KEYS.has(k)))] : [],
    onboarded: st.onboarded === true,
    calSnooze: typeof st.calSnooze === 'string' && isDate(st.calSnooze) ? st.calSnooze : null,
    // Legacy fold flag from older builds; unused, kept so old saves round-trip.
    tidyV: numOr(st.tidyV, 0) >= 1 ? 1 : 0,
    // Height in cm for waist-to-height; the one body measure that does not change.
    heightCm: isNum(hc) && hc >= LIMITS.heightCm[0] && hc <= LIMITS.heightCm[1] ? r1(hc) : null,
    timeBudget: isNum(tb) && tb >= LIMITS.budgetMin[0] ? Math.min(Math.round(tb), LIMITS.budgetMin[1]) : null,
    priorities: pr ? muscles(pr) : [],
    // Absent (older saves) means the defaults apply once; after that the user's folds win.
    dashFolded: df ? strings(df, k => oneOf(k, DSEC_KEYS)) : DSEC_FOLDED.slice(),
    lastExport: typeof st.lastExport === 'string' && isDate(st.lastExport) ? st.lastExport : null,
    removedLib,
    barKg: isNum(bk) && bk > 0 ? Math.min(bk, LIMITS.barKg) : null,
    bwGoalPct: isNum(bg) ? Math.min(Math.max(bg, -LIMITS.bwRatePct), LIMITS.bwRatePct) : null,
    bands
  };
  for (const k of OPTIONAL_SETTINGS) if (!(k in vals)) delete st[k];
  return Object.assign(st, vals);
}
/** The settings absent unless set: each is taken out of the merged copy when it is not (cleanSettings). */
const OPTIONAL_SETTINGS = [
  'accent',
  'rirAsk',
  'rirHalf',
  'autoAdj',
  'bwEvery',
  'todayStart',
  'restWeeks',
  'rirScale',
  'loadFill',
  'userName',
  'smallPlates',
  'gym',
  'profile',
  'bandsFit',
  'ownTargets'
] as const satisfies readonly (keyof Settings)[];

/* An exercise, cleaned: called only on one whose id and name are strings
   (the reader above), so its name is given as read. */
/** One exercise of the log, cleaned field by field. */
function cleanExercise(e0: unknown, e: Rec, name: string): Exercise {
  const sc = arr(e.secondary);
  const g = rec(e.goal);
  const inc = numOr(e.inc, NaN),
    bwf = numOr(e.bwf, NaN),
    ml = numOr(e.maxLoad, NaN),
    bar = numOr(e.barKg, NaN);
  const gw = g ? numOr(g.w, NaN) : NaN,
    gr = g ? Math.round(numOr(g.r, NaN)) : NaN;
  return keepExtra(e0, {
    id: fixId(e.id),
    name,
    primary: typeof e.primary === 'string' && isMuscle(e.primary) ? e.primary : 'chest',
    secondary: sc ? strings(sc, m => isMuscle(m) && m !== e.primary) : [],
    equip: typeof e.equip === 'string' ? e.equip : 'other',
    bw: !!e.bw,
    rare: !!e.rare,
    perSide: !!e.perSide,
    note: typeof e.note === 'string' ? e.note : '',
    custom: !!e.custom,
    archived: !!e.archived,
    // Load step for this exercise everywhere it appears; null falls back to the routine item.
    inc: isNum(inc) && inc > 0 ? Math.min(inc, LIMITS.step) : null,
    plates: pick(e.plates, ['bar', 'side', 'sleeve', 'none']) ?? null,
    // How the load number reads; absent means the exercise's default.
    load: pick(e.load, ['each', 'total', 'side', 'stack']),
    // Timed: the reps column holds seconds. Heaviest available: the top of the
    // stack or rack, past which progression moves to reps. Absent when unset,
    // so records saved before these existed hash exactly as before.
    timed: e.timed === true ? true : undefined,
    // Compound or isolation, when set in the editor (r27); absent reads it from the name.
    kind: e.kind === 'compound' || e.kind === 'iso' ? e.kind : undefined,
    // Assisted (item 45): the load number is the machine's help, stored below 0.
    assist: e.assist === true && !!e.bw ? true : undefined,
    bwf: isNum(bwf) && bwf > 0 && bwf <= LIMITS.bwShare ? Math.round(bwf * HUNDREDTHS) / HUNDREDTHS : undefined,
    maxLoad: isNum(ml) && ml > 0 ? Math.min(ml, LOAD_MAX) : undefined,
    // This lift's own bar (r29, item 98): a trap or EZ bar instead of the bar in Settings. Absent when unset.
    barKg: isNum(bar) && bar > 0 ? Math.min(bar, LIMITS.barKg) : undefined,
    // A lift goal (r38, item 188): a load (added load on a bodyweight lift) for a number of reps. Absent when unset.
    goal:
      g && isNum(gw) && gw >= 0 && gw <= LOAD_MAX && gr >= 1 && gr <= LIMITS.goalReps && !e.timed && !e.assist
        ? { w: gw, r: gr }
        : undefined
  });
}

/* A routine, cleaned: called only on one whose days are a list (the reader
   above), numbered ri among those kept. Anything that is not explicitly
   fixed-weekday becomes a cycle, which is how every pre-v3 routine migrates.
   A "weekly" routine with more than 7 days cannot exist through the UI; if
   one arrives, all its days are kept as a cycle rather than any cut off. */
/** One routine of the log, cleaned field by field. */
function cleanRoutine(r0: unknown, ri: number): Routine {
  const r = rec(r0) || {};
  const rid = typeof r.id === 'string' ? fixId(r.id) : did('r', r0, ri);
  const rdays = arr(r.days) || [];
  const schedule = r.schedule === 'weekly' && rdays.length <= WEEK_DAYS ? 'weekly' : 'cycle';
  const src = rdays.slice(0, MAX_DAYS);
  const count = schedule === 'weekly' ? WEEK_DAYS : Math.max(1, src.length);
  const days: Day[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const d0 = src[i];
    const d = rec(d0);
    if (!d) {
      days.push(
        schedule === 'weekly'
          ? { id: rid + '-w' + i, name: i === SUNDAY ? 'Rest' : 'Training day', rest: i === SUNDAY, items: [] }
          : { id: rid + '-p' + i, name: 'Training day', rest: false, items: [] }
      );
      continue;
    }
    const dbase = typeof d.id === 'string' ? fixId(d.id) : rid + '-d' + i;
    const items: PlanItem[] = (arr(d.items) || [])
      .filter(it0 => {
        const it = rec(it0);
        return !!it && typeof it.exId === 'string';
      })
      .map((it0, ii) => {
        const it = rec(it0) || {};
        return keepExtra(
          it0,
          {
            uid: typeof it.uid === 'string' ? fixId(it.uid) : dbase + '-i' + ii,
            exId: fixId(it.exId),
            ...planNums(it),
            ss: typeof it.ss === 'string' && it.ss ? fixId(it.ss) : null,
            ...jumpOf(it)
          },
          KNOWN_ITEM
        );
      })
      .map(it => (it.repMax < it.repMin ? { ...it, repMax: it.repMin } : it));
    fixSupersets(items);
    let id = dbase;
    if (seen.has(id)) id = id + '-' + i;
    seen.add(id);
    days.push(
      keepExtra(d0, {
        id,
        name: typeof d.name === 'string' ? d.name : schedule === 'weekly' ? DAYS[i] : `Day ${i + 1}`,
        rest: !!d.rest,
        items
      })
    );
  }
  return keepExtra(r0, { id: rid, name: typeof r.name === 'string' ? r.name : 'Routine', schedule, days });
}
