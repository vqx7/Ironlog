/** A record with the unknown fields its source carried kept (above); `keepExtra.n` counts the fields kept, for the suites. */
export function keepExtra<O extends object>(src: unknown, out: O, known?: ReadonlySet<string>): O {
  const S = rec(src);
  if (!S || Array.isArray(src)) return out;
  let room = EXTRA_MAX,
    n = 0;
  for (const k of Object.keys(S)) {
    if (n >= EXTRA_KEYS) break;
    if (k in out || (known && known.has(k)) || !okExtraKey(k)) continue;
    const v = S[k];
    if (v === undefined || typeof v === 'function') continue;
    let j: string | undefined;
    try {
      j = JSON.stringify(v);
    } catch (e) {
      // A value JSON cannot write (a cycle, a BigInt) is not plain data, so it is not kept.
      continue;
    }
    const cost = j === undefined ? 0 : k.length + j.length + EXTRA_KEY_COST;
    if (j === undefined || cost > room) continue;
    room -= cost;
    n++;
    // Written as an assignment writes it, under a name okExtraKey allowed.
    Object.assign(out, { [k]: parseJson(j) });
    keepExtra.n++;
  }
  if (n) {
    /* The record's fields read once, then each taken out and written back,
       those the source has in its order first: a field written again stays
       where it stood, so taking it out first is what moves it. */
    const was: Rec = { ...out };
    const ks = Object.keys(S).filter(k => Object.prototype.hasOwnProperty.call(was, k));
    for (const k of [...ks, ...Object.keys(was).filter(k => !ks.includes(k))]) {
      Reflect.deleteProperty(out, k);
      Object.assign(out, { [k]: was[k] });
    }
  }
  return out;
}
keepExtra.n = 0;

/* ---------- records ---------- */

/** A cardio row of a workout in progress: a saved entry's fields, its minutes blank until typed. */
export type CardioRow = Omit<CardioEntry, 'min'> & { min: number | null };

/* One cardio or mobility entry, cleaned, its minutes the one field a saved
   entry and a workout's row read differently: a saved one's are 1 at the
   least (`none` 1), a row's may still be blank (`none` null). */
function cardioOf<M extends number | null>(c: unknown, none: M, i?: number): Omit<CardioEntry, 'min'> & { min: number | M } {
  const C = rec(c) || {};
  const m = numOr(C.min, NaN),
    hr = numOr(C.hr, NaN),
    dk = numOr(C.dist, NaN);
  return keepExtra(
    c,
    {
      id: typeof C.id === 'string' ? fixId(C.id) : did('c', c, i),
      date: typeof C.date === 'string' && isDate(C.date) ? C.date : today(),
      kind: typeof C.kind === 'string' && CARDIO_KINDS.has(C.kind) ? C.kind : 'other',
      min: isNum(m) && m > 0 ? Math.min(Math.round(m), LIMITS.minutes) : none,
      hr: isNum(hr) && hr >= LIMITS.hr[0] && hr <= LIMITS.hr[1] ? Math.round(hr) : null,
      when: typeof C.when === 'string' && CARDIO_WHENS.has(C.when) ? C.when : 'solo',
      note: typeof C.note === 'string' ? C.note.slice(0, LIMITS.cardioNote) : '',
      demo: !!C.demo,
      ...(isNum(dk) && dk > 0 ? { dist: Math.min(r3(dk), LIMITS.distKm) } : {})
    },
    KNOWN_CARDIO
  );
}
/** One saved cardio or mobility entry, cleaned. */
export const cleanCardio = (c: unknown, i?: number): CardioEntry => cardioOf(c, 1, i);
/** One cardio row of a workout in progress, cleaned: its minutes may still be blank. */
export const cleanDraftCardio = (c: unknown, i?: number): CardioRow => cardioOf(c, null, i);

/** A pair of numbers, as a rep range is kept. */
const pair = (a: number, b: number): [number, number] => [a, b];

/* A saved session, cleaned: called only on one okSess accepted (a record with
   a date and a list of exercises), which the reader of its exercises relies
   on; so its date is that string (the '' after it is never reached). */
/** A saved session, cleaned field by field. */
export function cleanSess(raw: unknown, si: number): Session {
  const ss = rec(raw) || {};
  const durMin = Number(ss.durMin),
    t = Number(ss.t);
  return keepExtra(raw, {
    id: typeof ss.id === 'string' ? fixId(ss.id) : did('s', raw, si),
    date: typeof ss.date === 'string' ? ss.date : '',
    dayIdx: clampN(ss.dayIdx, 0, MAX_DAYS - 1, 0),
    dayId: typeof ss.dayId === 'string' ? fixId(ss.dayId) : null,
    durMin: Number.isFinite(durMin) && durMin >= 1 && durMin <= LIMITS.minutes ? Math.round(durMin) : null,
    dayName: typeof ss.dayName === 'string' ? ss.dayName : 'Session',
    routineId: typeof ss.routineId === 'string' && ss.routineId ? fixId(ss.routineId) : '',
    notes: typeof ss.notes === 'string' ? ss.notes : '',
    demo: !!ss.demo,
    deload: !!ss.deload,
    light:
      ss.light === true || (ss.light == null && typeof ss.dayName === 'string' && / \(lighter\)$/.test(ss.dayName)),
    // Freestyle: not tied to a routine day. Check-in: the three pre-session taps.
    free: ss.free === true ? true : undefined,
    chk: cleanChk(rec(ss.chk)) || undefined,
    ex: (arr(ss.ex) || [])
      .flatMap((b0): SessionEx[] => {
        const b = rec(b0);
        if (!b || typeof b.exId !== 'string' || !Array.isArray(b.sets)) return [];
        const rr = arr(b.rr);
        return [
          keepExtra(
            b0,
            {
              exId: fixId(b.exId),
              note: typeof b.note === 'string' ? b.note : '',
              // Planned rep range at the time, [min,max]. Older sessions have none.
              rr:
                rr && rr.length === 2 && rr.every(v => Number.isFinite(Number(v)) && Number(v) > 0)
                  ? pair(Math.round(Number(rr[0])), Math.round(Number(rr[1])))
                  : null,
              // Marked trimmed (Short on time, under half its sets) until r53. Neither written nor read since r54 (V's one rule reads the log); kept, here and in drafts, so a record saved before keeps its shape and hash.
              cut: b.cut === true ? true : undefined,
              // One exercise made lighter mid-session (r31, Make it lighter): out of trends and targets, the rest of the session counts.
              light: b.light === true ? true : undefined,
              // Held for a flagged injury, its key (r54): left out of the stall test. Absent unless held, so earlier records keep their hash.
              ...(typeof b.inj === 'string' && isMuscleOrJoint(b.inj) ? { inj: b.inj } : {}),
              sets: (arr(b.sets) || []).flatMap((x0): LoggedSet[] => {
                const x = rec(x0);
                if (!x) return [];
                return [
                  keepExtra(x0, {
                    // Below 0 only for assisted sets (bodyweight minus the machine's help).
                    w: clampN(x.w, LOAD_MIN, LOAD_MAX, 0),
                    r: Math.round(clampN(x.r, 0, LIMITS.reps, 0)),
                    rir: x.rir == null || x.rir === '' ? null : clampN(x.rir, 0, EFFORT_TOP, null),
                    warm: !!x.warm,
                    drop: !!x.drop && !x.warm,
                    cal: x.warm ? undefined : cleanCal(rec(x.cal)) || undefined,
                    // The row's own id (r56.1), last, where a build before it kept the unknown field.
                    ...(typeof x.rid === 'string' ? { rid: fixId(x.rid) } : {})
                  })
                ];
              }),
              // The sets its routine's plan gave it when saved (r58, 339 h), last, as Finish writes it; absent unless recorded, so older records keep their hash.
              ...(typeof b.ps === 'number' && Number.isInteger(b.ps) && b.ps >= 1 && b.ps <= LIMITS.sets
                ? { ps: b.ps }
                : {})
            },
            KNOWN_SEX
          )
        ];
      })
      .filter(b => b.sets.length),
    // When the session started (r34): orders two sessions on one day. Absent on older ones, so their records hash as before; kept only as a time a Date can hold (r56.1).
    t: isTime(Math.round(t)) ? Math.round(t) : undefined,
    // The sessions a week its routine planned when saved (r55, pwOf); absent unless recorded, so older records keep their hash.
    pw: typeof ss.pw === 'number' && Number.isInteger(ss.pw) && ss.pw >= 1 && ss.pw <= WEEK_DAYS ? ss.pw : undefined
  });
}
