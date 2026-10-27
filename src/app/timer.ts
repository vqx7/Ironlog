/* The rest timer and the screen kept on (r63, from the legacy script's
   18-ui.js). The bar is the page's (#timer), outside the screens; the
   session screen starts it on a tick and stops it with the session. */

import { html, render } from 'lit-html';
import { pad } from './util';
import { KEY, log, prefDel, prefGet, prefSet } from './storage';
import { state } from './store';
import { toast } from './toast';

/** The timer's times, in milliseconds: the bar redrawn, a second, a tip waiting for the toast before it to go, and the first wait before it. */
const TIMER_MS = { tick: 250, second: 1000, tipRetry: 500, tipFirst: 600, tipShow: 6000 } as const;
/** What +15 adds, in seconds. */
const ADD_S = 15;
/** The beep: two tones (G5 then C6), when each starts after the first, its gain at the peak, its rise, its fall and its length, in seconds, and the quiet a gain ramps from and to. */
const BEEP = { hz: [784, 1046], at: [0, 0.22], peak: 0.25, rise: 0.02, fall: 0.18, len: 0.2, quiet: 0.0001 } as const;
/** The vibration when the rest is over, in milliseconds: on, off, on. */
const BUZZ = [200, 100, 200] as const;
/** The seconds in a minute. */
const MINUTE_S = 60;

/** The rest timer: when it ends (an absolute time, so a hidden tab comes back right), the interval drawing it, whether it has sounded, and its full length. */
export const timer: { end: number; iv: ReturnType<typeof setInterval> | null; fired: boolean; total?: number } = {
  end: 0,
  iv: null,
  fired: false
};

declare global {
  interface Window {
    /** Safari's prefixed audio context, on older iPhones. */
    webkitAudioContext?: typeof AudioContext | undefined;
  }
}

/* navigator.vibrate does not exist on iOS Safari, so the timer used to finish
   in total silence on an iPhone. The audio context is created on the tap that
   starts the timer, which is a user gesture, so the beep is allowed to play
   later. A backgrounded tab can still suppress it, which is why the bar also
   changes state and the elapsed time is computed from an absolute end stamp
   rather than counted down. */
let actx: AudioContext | null = null;
function beep(): void {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    if (!actx) actx = new C();
    if (actx.state === 'suspended') actx.resume();
    const ctx = actx;
    const t0 = ctx.currentTime;
    BEEP.at.forEach((off, i) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = BEEP.hz[i];
      g.gain.setValueAtTime(BEEP.quiet, t0 + off);
      g.gain.exponentialRampToValueAtTime(BEEP.peak, t0 + off + BEEP.rise);
      g.gain.exponentialRampToValueAtTime(BEEP.quiet, t0 + off + BEEP.fall);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0 + off);
      o.stop(t0 + off + BEEP.len);
    });
  } catch (e) {
    log('audio', e);
  }
}
/** Readies the rest timer's sound, on a tap (a browser plays sound only after one). */
export function primeAudio(): void {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    if (!actx) actx = new C();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) {
    log('audio', e);
  }
}
/* A locked phone suspends the page, so the timer cannot sound or vibrate
   until you unlock it. Said once per device, the first time a rest starts
   with the keep-awake setting off, once no other message shows (r54: a PR's). */
function wakeTip(): void {
  if (state.settings.wakeLock) return;
  const k = KEY + '.tipWake';
  if (prefGet(k)) return;
  // Storage that refuses the mark would say it on every rest, so it is not said at all.
  if (!prefSet(k, '1')) return;
  const say = (): void => {
    const el = document.getElementById('toast');
    if (el && !el.hidden) {
      setTimeout(say, TIMER_MS.tipRetry);
      return;
    }
    toast(
      'A locked screen holds the rest alert until you unlock. Settings can keep the screen on.',
      false,
      TIMER_MS.tipShow
    );
  };
  setTimeout(say, TIMER_MS.tipFirst);
}
/* The end time is kept on this device, so a phone that reloads a backgrounded
   tab mid-rest comes back to the same countdown. The rest's full length is
   kept beside it (r29), so the bar along the top still empties from the right
   place after a reload. */
const TIMER_KEY = KEY + '.timer';
const bar = (): HTMLElement | null => document.getElementById('timer');
/** Keeps the rest's end and length on this device while the bar shows, and forgets them once it is gone. */
function timerSave(): void {
  const el = bar();
  if (timer.end && el && !el.hidden) {
    if (!prefSet(TIMER_KEY, String(timer.end)) || !prefSet(TIMER_KEY + 'Len', String(timer.total || 0)))
      log('timer', new Error('Storage refused the rest timer'));
  } else {
    prefDel(TIMER_KEY);
    prefDel(TIMER_KEY + 'Len');
  }
}
/** Starts the rest timer for so many seconds. */
export function startTimer(sec: number): void {
  wakeTip();
  timer.end = Date.now() + sec * TIMER_MS.second;
  timer.total = sec;
  timer.fired = false;
  primeAudio();
  const el = bar();
  if (el) el.hidden = false;
  timerBuild();
  timerSave();
  if (!timer.iv) timer.iv = setInterval(tick, TIMER_MS.tick);
  tick();
}
/** Brings back a rest that was running when the page was reloaded, while its session is open. */
export function timerResume(): void {
  const end = +(prefGet(TIMER_KEY) || 0) || 0;
  if (!state.draft || !(end > Date.now())) {
    prefDel(TIMER_KEY);
    return;
  }
  const len = +(prefGet(TIMER_KEY + 'Len') || 0) || 0;
  timer.end = end;
  timer.total = len > 0 ? len : Math.round((end - Date.now()) / TIMER_MS.second);
  timer.fired = false;
  const el = bar();
  if (el) el.hidden = false;
  timerBuild();
  if (!timer.iv) timer.iv = setInterval(tick, TIMER_MS.tick);
  tick();
}
/* Screen wake lock, optional. A locked phone suspends the page and with it the
   rest alert, so keeping the screen on is the only way a web page can
   guarantee the beep. Unsupported or refused requests fail quietly. */
let wakeSentinel: WakeLockSentinel | null = null;
let wakeWarned = false;
/** Keeps the screen on during a session, where the setting asks and the browser allows it. */
export async function wakeOn(): Promise<void> {
  if (!state.settings.wakeLock || !state.draft || wakeSentinel) return;
  try {
    if (navigator.wakeLock && navigator.wakeLock.request) {
      const s = await navigator.wakeLock.request('screen');
      wakeSentinel = s;
      if (s.addEventListener)
        s.addEventListener('release', () => {
          wakeSentinel = null;
        });
    }
  } catch (e) {
    // Refused (a page in the background, a low battery): said once, and the session goes on.
    wakeSentinel = null;
    if (!wakeWarned) {
      wakeWarned = true;
      toast('This browser would not keep the screen on');
    }
  }
}
/** Lets the screen sleep again. */
export function wakeOff(): void {
  try {
    if (wakeSentinel) wakeSentinel.release();
  } catch (e) {
    // Already released.
  }
  wakeSentinel = null;
}
/** Stops the rest timer and hides its bar. */
export function stopTimer(): void {
  if (timer.iv) clearInterval(timer.iv);
  timer.iv = null;
  timer.fired = false;
  const el = bar();
  if (el) el.hidden = true;
  document.body.classList.remove('timer-on');
  timerSave();
}
/* The bar is built once per start (or when its style setting changes) and
   each tick only rewrites the time. Rebuilding its buttons four times a
   second made clicks land on a button that no longer existed and threw
   keyboard focus back to the page. */
function timerBuild(): void {
  const el = bar();
  if (!el) return;
  const compact = !!state.settings.timerCompact;
  if (el.dataset.mode === (compact ? 'c' : 'f') && el.firstChild) return;
  el.dataset.mode = compact ? 'c' : 'f';
  el.classList.toggle('compact', compact);
  render(
    compact
      ? html`<span class="tv" data-t="v"></span><button data-act="tAdd" aria-label="Add 15 seconds">+15</button><button data-act="tStop" aria-label="Dismiss timer">✕</button>`
      : html`<span data-t="l"></span><span class="tv" data-t="v"></span><span class="row"><button data-act="tAdd">+15s</button><button data-act="tStop">Dismiss</button></span>`,
    el
  );
}
/** Draws the rest's time left, and sounds once when it is over. */
export function tick(): void {
  const left = Math.max(0, Math.round((timer.end - Date.now()) / TIMER_MS.second));
  const el = bar();
  if (!el) return;
  timerBuild();
  document.body.classList.toggle('timer-on', !el.hidden);
  const v = el.querySelector('[data-t="v"]'),
    l = el.querySelector('[data-t="l"]');
  const txt = Math.floor(left / MINUTE_S) + ':' + pad(left % MINUTE_S);
  if (v && el.dataset.mode === 'c') {
    const t = left ? txt : 'Go';
    if (v.textContent !== t) v.textContent = t;
    v.setAttribute('aria-label', left ? 'Rest remaining' : 'Rest done');
  } else if (v && l) {
    if (v.textContent !== txt) v.textContent = txt;
    const lt = left ? 'Rest' : 'Rest done';
    if (l.textContent !== lt) l.textContent = lt;
  }
  el.classList.toggle('done', !left);
  // The bar along the top empties as the rest runs down; +15s lengthens it.
  const tot = Math.max(timer.total || 0, left, 1);
  el.style.setProperty('--tp', String(Math.max(0, Math.min(1, left / tot))));
  if (!left) {
    if (timer.iv) clearInterval(timer.iv);
    timer.iv = null;
    if (!timer.fired) {
      timer.fired = true;
      if (state.settings.timerSound) {
        beep();
        try {
          if (navigator.vibrate) navigator.vibrate([...BUZZ]);
        } catch (e) {
          // Vibration is optional.
        }
      }
    }
  }
}
/* Once the rest is over, +15 counts from now (not from the old end, which
   left it at 0:00) and the alert is armed again. */
/** Adds 15 seconds to the rest. */
export function timerAdd(): void {
  const was = Math.max(0, (timer.end - Date.now()) / TIMER_MS.second);
  timer.total = was > 0 ? Math.max(timer.total || 0, was) + ADD_S : ADD_S;
  timer.end = Math.max(timer.end, Date.now()) + ADD_S * TIMER_MS.second;
  timer.fired = false;
  timerSave();
  if (!timer.iv) timer.iv = setInterval(tick, TIMER_MS.tick);
  tick();
}
/** Draws the rest timer again in its current style, when it is showing. */
export function timerRefresh(): void {
  const el = bar();
  if (el && !el.hidden) tick();
}
