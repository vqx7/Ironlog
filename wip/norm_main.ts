/* Every field below is validated rather than trusted. The old version only
   checked that five keys were arrays, so a backup containing sessions:[{}]
   imported cleanly and then threw inside IDX() on the first render, leaving
   the app unusable with no obvious way back. normalize() runs on both load
   and import, so this also protects against a half-written localStorage
   record. Anything unusable is dropped; the count is reported to the caller
   via normalize.dropped. Each record is built against its type, so the
   compiler checks every field a reader relies on (r61, PENDING 351: until
   then the log was typed as the State once, at the end, by a cast). */
/** A save read as every build reads it (above); `normalize.dropped` counts the damaged records the last call left out. */
export function normalize(input: unknown): State {
  const f = freshState();
  normalize.dropped = 0;
  // A new device and Erase everything both start here, fully normalized:
  // the raw fresh state lacks fields (section order, folds) every view reads.
  const s: Rec = rec(input) || f;
  // drop() is one record; drop(n) is n, and drop(0) is none (it used to count 1).
  const drop = (n?: number): void => {
    normalize.dropped += n == null ? 1 : Math.max(0, n);
  };
  // The save as it came over the fresh log: each field read from here, and those this build does not know kept as they came.
  const raw: Rec = { ...f, ...s };
  const settings = cleanSettings(s, f);
  // Each list as it came, or none.
  const list = (k: string): unknown[] => arr(raw[k]) || [];

  const removedLib = settings.removedLib;
  // The library's own records go in beside the lifter's (below).
  const exercises: Exercise[] = list('exercises').flatMap(e0 => {
    const e = rec(e0);
    return e && typeof e.id === 'string' && typeof e.name === 'string' ? [cleanExercise(e0, e, e.name)] : [];
  });
  const have = new Set(exercises.map(e => e.id));
  const gone = new Set(removedLib);
  const lib = libExercises();
  for (const e of lib) if (!have.has(e.id) && !gone.has(e.id)) exercises.push(e);
  // v1 saves predate the per-side flag, so the built-ins in them all carry
  // perSide:false. Backfill it from the library by id, and only that one
  // field, so any other edit the user made to a built-in survives.
  if (numOr(s.version, 1) < V_PER_SIDE) {
    const libMap = new Map(lib.map(e => [e.id, e]));
    for (const e of exercises) {
      const L = !e.custom && libMap.get(e.id);
      if (L) e.perSide = L.perSide;
    }
  }
  /* v5: add serratus and rotator cuff where the library now lists them as
     secondary. Only those two keys are added, so any other edit survives. A
     built-in whose primary is one of them and reads Chest here was reset by
     an older build that did not know the muscle (its fallback is Chest), so
     it goes back to the library's primary. */
  if (numOr(s.version, 1) < V_NEW_MUSCLES) {
    const libMap = new Map(lib.map(e => [e.id, e]));
    for (const e of exercises) {
      const L = !e.custom && libMap.get(e.id);
      if (!L) continue;
      let sec = e.secondary;
      if (NEW_V5.has(L.primary) && e.primary === 'chest') {
        e.primary = L.primary;
        sec = sec.filter(m => m !== L.primary);
        e.secondary = sec;
        for (const m of L.secondary) if (!sec.includes(m)) sec.push(m);
      }
      for (const m of NEW_MUSCLES_V5) if (L.secondary.includes(m) && e.primary !== m && !sec.includes(m)) sec.push(m);
    }
  }

  // Numbered among the routines kept, as each one with no id of its own is named by its place (did).
  const kept: Routine[] = list('routines')
    .filter(r0 => {
      const r = rec(r0);
      return !!r && Array.isArray(r.days);
    })
    .map((r0, ri) => cleanRoutine(r0, ri));
  /* A save with no routine left gets the one a new install starts with, read
     as any routine is (r61: added as made until then, its items without the
     superset field the next load gave them). */
  const routines: Routine[] = kept.length ? kept : [cleanRoutine(starterRoutine(), 0)];

  const cutoff = addDays(today(), -TRASH_DAYS);
  let trash: Trashed[] = list('trash')
    .flatMap(t0 => {
      const t = rec(t0);
      const data = t ? rec(t.data) : null;
      const kind = t ? trashKind(t.kind) : null;
      return t &&
        typeof t.id === 'string' &&
        kind &&
        typeof t.date === 'string' &&
        isDate(t.date) &&
        t.date >= cutoff &&
        data
        ? [{ id: fixId(t.id), kind, date: t.date, data }]
        : [];
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, TRASH_MAX);
  while (trash.length > 1 && JSON.stringify(trash).length > TRASH_BYTES) trash.pop();
  const before = list('sessions').length;
  let sessions: Session[] = list('sessions')
    .filter(x => okSess(rec(x)))
    .map((x, i) => cleanSess(x, i))
    .filter(ss => ss.ex.length);
  drop(before - sessions.length);
  /* A trashed id is a tombstone, but only for the copy that was deleted. If
     the same session was edited afterwards (on another device, or in an edit
     that was open while it was deleted), the edit is newer than the delete:
     keep it and retire the tombstone, because keeping data is the mistake
     that can be undone. Sessions are compared in their cleaned form, so
     field order and defaults added by newer builds do not count as edits. */
  let cardio: CardioEntry[];
  {
    const tS = new Map<string, Trashed>(),
      tC = new Map<string, Trashed>();
    for (const t of trash) {
      if (t.kind === 'session') tS.set(t.id, t);
      else if (t.kind === 'cardio') tC.set(t.id, t);
    }
    const revived = new Set<string>();
    const same = (cur: unknown, data: Rec, clean: (x: unknown, i: number) => unknown, ok: (x: unknown) => boolean) => {
      try {
        return !ok(data) || canon(clean(data, 0)) === canon(cur);
      } catch (e) {
        // A copy that cannot be cleaned is read as the same record, so the deletion stands, as before the move.
        return true;
      }
    };
    sessions = sessions.filter(ss => {
      const t = tS.get(ss.id);
      if (!t) return true;
      if (
        same(
          { ...ss, id: ss.id },
          { ...t.data, id: ss.id },
          (x, i) => cleanSess(x, i),
          x => okSess(rec(x))
        )
      )
        return false;
      revived.add(t.id);
      return true;
    });
    cardio = list('cardio')
      .filter(c0 => {
        const c = rec(c0);
        return !!c && isDate(c.date) && isNum(numOr(c.min, NaN)) && numOr(c.min, 0) > 0;
      })
      .map((c, ci) => cleanCardio(c, ci))
      .filter(c => {
        const t = tC.get(c.id);
        if (!t) return true;
        if (
          same(
            c,
            { ...t.data, id: c.id },
            (x, i) => cleanCardio(x, i),
            x => !!x && typeof x === 'object'
          )
        )
          return false;
        revived.add(t.id);
        return true;
      });
    if (revived.size) trash = trash.filter(t => t.kind === 'routine' || !revived.has(t.id));
  }
  /* One id, two different copies: a session moved to a date in another
     half-month on one device while it was edited on another. Both used to be
     kept and counted twice. Keep the copy with more logged sets (then the
     later date) and put the other in Recently deleted under its own id, so
     nothing is lost. Every device resolves it the same way. */
  const dedupe = <T extends { id: string; date: string }>(
    list0: T[],
    kind: 'session' | 'cardio',
    size: (x: T) => number
  ): T[] => {
    const byId = new Map<string, T>(),
      extra: T[] = [];
    for (const x of list0) {
      const o = byId.get(x.id);
      if (!o) {
        byId.set(x.id, x);
        continue;
      }
      if (canon(o) === canon(x)) continue;
      const keepNew =
        size(x) > size(o) || (size(x) === size(o) && (x.date > o.date || (x.date === o.date && canon(x) > canon(o))));
      byId.set(x.id, keepNew ? x : o);
      extra.push(keepNew ? o : x);
    }
    if (!extra.length) return list0;
    for (const x of extra) {
      const id = fixId(x.id + '-dup' + hashStr(canon(x)).slice(0, DUP_HASH));
      if (!trash.some(t => t.id === id)) trash.unshift({ id, kind, date: today(), data: { ...rec(x), id } });
    }
    return [...byId.values()];
  };
  sessions = dedupe(sessions, 'session', x => x.ex.reduce((a, b) => a + b.sets.length, 0));
  cardio = dedupe(cardio, 'cardio', x => x.min);

  const bBefore = list('bodyweights').length;
  // Numbered among those kept, as one with no id is named by its place (did); each has a date (the filter), the '' never reached.
  const bodyweights: Bodyweight[] = list('bodyweights')
    .filter(b0 => {
      const b = rec(b0);
      return !!b && isDate(b.date) && isNum(numOr(b.kg, NaN)) && numOr(b.kg, 0) > 0;
    })
    .map((b0, bi) => {
      const b = rec(b0) || {};
      return keepExtra(b0, {
        id: typeof b.id === 'string' ? fixId(b.id) : did('b', b0, bi),
        date: typeof b.date === 'string' ? b.date : '',
        kg: Math.min(numOr(b.kg, 0), BW_MAX_KG),
        demo: !!b.demo
      });
    });
  drop(bBefore - bodyweights.length);

  const mBefore = list('measurements').length;
  // As the weigh-ins: numbered among those kept, each with a date.
  const measurements: Measurement[] = list('measurements')
    .filter(m0 => {
      const m = rec(m0);
      return !!m && isDate(m.date);
    })
    .map((m0, mi) => {
      const m = rec(m0) || {};
      const o: Measurement = {
        id: typeof m.id === 'string' ? fixId(m.id) : did('m', m0, mi),
        date: typeof m.date === 'string' ? m.date : '',
        demo: !!m.demo
      };
      for (const [k] of MEAS) {
        const v = numOr(m[k], NaN);
        if (isNum(v) && v > 0) o[k] = Math.min(v, MEAS_MAX_CM);
      }
      return keepExtra(m0, o, KNOWN_MEAS);
    });
  drop(mBefore - measurements.length);

  /* The draft is rendered by the logger, which reads plan, lastR and every set
     field directly. The old check only confirmed that ex was an array, so an
     imported backup carrying a half-written draft threw on first paint with no
     way back. Rebuilt field by field instead (cleanDraft); anything else is
     no workout in progress (r61: a false, a 0 or an empty string no build
     writes was kept as it came until then). */
  const d = rec(raw.draft);
  const draft = d && Array.isArray(d.ex) && typeof d.date === 'string' && isDate(d.date) ? cleanDraft(d, d.date) : null;
  const dw = raw.deloadWeek;
  // As the weigh-ins: numbered among those kept, each a muscle or a joint (the filter), the '' never reached.
  const injuries: Injury[] = (arr(raw.injuries) || [])
    .filter(x0 => {
      const x = rec(x0);
      return !!x && isMuscleOrJoint(x.m);
    })
    .map((x0, xi) => {
      const x = rec(x0) || {};
      return keepExtra(x0, {
        id: typeof x.id === 'string' ? fixId(x.id) : did('j', x0, xi),
        m: typeof x.m === 'string' ? x.m : '',
        note: typeof x.note === 'string' ? x.note : '',
        date: typeof x.date === 'string' && isDate(x.date) ? x.date : today()
      });
    });
  const ar = raw.activeRoutineId;
  const want = typeof ar === 'string' ? fixId(ar) : null;
  const activeRoutineId = want != null && routines.some(r => r.id === want) ? want : routines[0].id;
  /* The fields this build does not know, kept as they came and after its own,
     as a spread of the save over the fresh log puts them. Former bests
     belonged to the Comeback tracker, removed at the owner's request in r19
     together with any that were saved. Older saves, backups and cloud copies
     still carry them, so they are dropped here on every load, import and
     merge. */
  const extra: Rec = { ...s };
  for (const k of Object.keys(f)) delete extra[k];
  delete extra.priors;
  return {
    version: STATE_VERSION,
    settings,
    exercises,
    routines,
    activeRoutineId,
    sessions,
    bodyweights,
    measurements,
    draft,
    deloadWeek: typeof dw === 'string' && isDate(dw) ? dw : null,
    injuries,
    cardio,
    trash,
    ...extra
  };
}
normalize.dropped = 0;
