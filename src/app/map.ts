/* The muscle map (r59, phase 5): Today's card, a flat front and back
   outline, or a 3D body, each muscle shaded by where its weekly hard sets
   sit against its own target, drawn by lit-html as src/20-map.js drew it,
   with the actions that change what it shows. The exercise sheets (an
   exercise's muscles on the body, in the legacy script until the session
   screen moves, r60) draw the same figures and the same 3D body from here.

   The flat figures: coordinates for a 120 x 210 box, left-side shapes
   mirrored to the right.

   The 3D body: a stylized, sculpted body built from smooth shapes, one
   region per muscle group, shaded exactly like the flat map (below, on,
   above target, none, tracked only) from the same numbers. Drag sideways to
   turn it; the page still scrolls vertically. Tap a region for the same
   detail as the flat map. three.js loads only the first time 3D is opened,
   and the drawing happens only when something changes, so it costs nothing
   while idle. One renderer is kept for the whole visit: each draw of Today
   moves its canvas into the card instead of building a new one. */

import { html, nothing, svg } from 'lit-html';
import type { TemplateResult, SVGTemplateResult } from 'lit-html';
import { THREE_URLS } from './config';
import { loadModule } from './outside';
import { rec } from './records';
import { MK, ML } from './library';
import { ON_PLAN_TIP, avgWeeksTxt } from './weeks';
import type { MuscleStatus } from './weeks';
import { lowSt, metSt } from './volume';
import { musTrend } from './coach';
import { NIL } from './format';
import { andList, r1, today, weekStart } from './util';
import { IDX, actualAvg4, hasTarget, muscleStatus } from './live';
import { fx, state, ui } from './store';
import { MAPVIEW_KEY, log, prefGet, prefSet } from './storage';
import { noLog } from './display';
import { section, tipButton } from './view';

/* ---------- the flat figures ---------- */

/** The body under the muscles: head, torso, arms, hands, legs, feet. */
export const BM_BASE = svg`<circle cx="60" cy="16" r="11"></circle><rect x="38" y="35" width="44" height="72" rx="12"></rect><rect x="23" y="39" width="14" height="42" rx="7"></rect><rect x="83" y="39" width="14" height="42" rx="7"></rect><rect x="21" y="78" width="11" height="36" rx="5.5"></rect><rect x="88" y="78" width="11" height="36" rx="5.5"></rect><circle cx="26" cy="118" r="5"></circle><circle cx="94" cy="118" r="5"></circle><rect x="37" y="102" width="21" height="54" rx="9"></rect><rect x="62" y="102" width="21" height="54" rx="9"></rect><rect x="40" y="152" width="14" height="46" rx="7"></rect><rect x="66" y="152" width="14" height="46" rx="7"></rect><ellipse cx="47" cy="202" rx="8" ry="4"></ellipse><ellipse cx="73" cy="202" rx="8" ry="4"></ellipse>`;

/** One shape of a muscle: an ellipse (cx, cy, rx, ry), a rounded rect (x, y, w, h, r), or a polygon's points. */
export type BmShape =
  | readonly ['e', number, number, number, number]
  | readonly ['r', number, number, number, number, number]
  | readonly ['p', readonly (readonly [number, number])[]];
/** The muscles' shapes, front (f) and back (b), by muscle. */
export const BM: {
  readonly f: Readonly<Record<string, readonly BmShape[]>>;
  readonly b: Readonly<Record<string, readonly BmShape[]>>;
} = (() => {
  const E = (cx: number, cy: number, rx: number, ry: number): BmShape[] => [
    ['e', cx, cy, rx, ry],
    ['e', 120 - cx, cy, rx, ry]
  ];
  const Rr = (x: number, y: number, w: number, h: number, r: number): BmShape[] => [
    ['r', x, y, w, h, r],
    ['r', 120 - x - w, y, w, h, r]
  ];
  const P = (pts: [number, number][]): BmShape[] => [
    ['p', pts],
    ['p', pts.map(([x, y]): [number, number] => [120 - x, y])]
  ];
  return {
    f: {
      neck: [['r', 54, 27, 12, 9, 3]],
      traps: P([
        [45, 38],
        [54, 31],
        [55, 39]
      ]),
      sideDelts: E(29, 47, 4, 8),
      frontDelts: E(36, 45, 7, 8),
      serratus: E(40.5, 60, 2.4, 4.6),
      chest: Rr(41, 40, 18, 17, 7),
      biceps: E(30, 66, 5, 11),
      forearms: E(27, 93, 4.5, 13),
      abs: [['r', 51, 59, 18, 35, 6]],
      obliques: Rr(43, 61, 7, 28, 3),
      abductors: E(40, 106, 4, 7),
      quads: E(47, 131, 8, 23),
      adductors: Rr(54, 108, 5, 22, 2.5),
      tibialis: E(46, 176, 3.5, 15)
    },
    b: {
      neck: [['r', 54, 27, 12, 9, 3]],
      upperBack: [['r', 44, 44, 32, 21, 7]],
      traps: [
        [
          'p',
          [
            [60, 30],
            [75, 40],
            [60, 60],
            [45, 40]
          ]
        ]
      ],
      rotatorCuff: E(48.5, 52, 3.6, 4.2),
      sideDelts: E(29, 47, 4, 8),
      rearDelts: E(36, 45, 7, 8),
      lats: P([
        [40, 62],
        [51, 66],
        [54, 88],
        [44, 82]
      ]),
      triceps: E(30, 66, 5, 11),
      forearms: E(27, 93, 4.5, 13),
      lowerBack: [['r', 52, 84, 16, 18, 5]],
      abductors: E(41, 103, 4, 6),
      glutes: E(51, 112, 9, 9),
      hamstrings: E(47, 138, 8, 17),
      adductors: Rr(55, 118, 4, 18, 2),
      calves: E(47, 174, 6, 13)
    }
  };
})();
/** One shape, drawn. */
export function bmShape(x: BmShape): SVGTemplateResult {
  if (x[0] === 'e') return svg`<ellipse cx=${x[1]} cy=${x[2]} rx=${x[3]} ry=${x[4]}></ellipse>`;
  if (x[0] === 'r') return svg`<rect x=${x[1]} y=${x[2]} width=${x[3]} height=${x[4]} rx=${x[5]}></rect>`;
  return svg`<polygon points=${x[1].map(q => q.join(',')).join(' ')}></polygon>`;
}

/* ---------- the 3D body ---------- */

/* What the 3D body uses of three.js, which loads as a module only the first
   time 3D is opened (THREE_URLS), so the page carries no copy of its types. */
interface V2 {
  x: number;
  y: number;
}
interface T3Color {
  set(c: string | T3Color): T3Color;
  copy(c: T3Color): T3Color;
  lerp(c: T3Color, k: number): T3Color;
}
interface T3Material {
  color: T3Color;
  emissive?: T3Color;
  emissiveIntensity: number;
}
interface T3Object {
  position: { set(x: number, y: number, z: number): void; y: number };
  rotation: { set(x: number, y: number, z: number): void; x: number; y: number };
  scale: { set(x: number, y: number, z: number): void };
  userData: { m?: string | null };
  add(o: T3Object): void;
  children: T3Object[];
}
interface T3Camera extends T3Object {
  aspect: number;
  lookAt(x: number, y: number, z: number): void;
  updateProjectionMatrix(): void;
}
interface T3Renderer {
  domElement: HTMLCanvasElement;
  setPixelRatio(r: number): void;
  setSize(w: number, h: number, style: boolean): void;
  render(scene: T3Object, cam: T3Camera): void;
}
interface T3Hit {
  object: T3Object;
}
type T3Geometry = object;
/** The parts of three.js the 3D body builds with. */
interface Three {
  WebGLRenderer: new (o: { antialias: boolean; alpha: boolean; powerPreference: string }) => T3Renderer;
  Scene: new () => T3Object;
  Group: new () => T3Object;
  PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => T3Camera;
  HemisphereLight: new (sky: number, ground: number, k: number) => T3Object;
  DirectionalLight: new (c: number, k: number) => T3Object;
  SphereGeometry: new (r: number, w: number, h: number) => T3Geometry;
  LatheGeometry: new (pts: V2[], seg: number) => T3Geometry;
  CapsuleGeometry: new (r: number, len: number, cap: number, seg: number) => T3Geometry;
  PlaneGeometry: new (w: number, h: number) => T3Geometry;
  Vector2: new (x: number, y: number) => V2;
  Mesh: new (g: T3Geometry, m: T3Material | object) => T3Object;
  MeshStandardMaterial: new (o: { roughness: number; metalness: number }) => T3Material;
  MeshBasicMaterial: new (o: { map: object; transparent: boolean; depthWrite: boolean }) => object;
  CanvasTexture: new (c: HTMLCanvasElement) => object;
  Color: new (r: number | string, g?: number, b?: number) => T3Color;
  Raycaster: new () => {
    setFromCamera(v: V2, cam: T3Camera): void;
    intersectObjects(o: T3Object[], deep: boolean): T3Hit[];
  };
}
declare global {
  interface Window {
    /** three.js, once the 3D body has loaded it. */
    THREE?: Three | undefined;
  }
}

/* Shapes, in metres, for the right side (x > 0); the left side mirrors them.
   l: a lathe (a profile of [radius, height] turned around its own axis, for
   smooth tapered limbs and the torso), s: a sphere scaled to an ellipsoid,
   c: a capsule [radius, length]. kz flattens front to back. m names the
   muscle group; parts without one are the neutral body underneath, and the
   muscle shapes sit almost flush on it, like an anatomy figure. */
/** One part of the 3D body. */
export interface B3Part {
  g: 'l' | 's' | 'c';
  m?: string;
  prof?: readonly (readonly [number, number])[];
  d?: readonly [number, number];
  p: readonly [number, number, number];
  k?: readonly [number, number, number];
  r?: readonly [number, number, number];
  kz?: number;
  one?: 1;
}
/** The 3D body's parts, the neutral body first, then the muscle groups. */
export const B3_PARTS: readonly B3Part[] = [
  /* Proportions (r29, V: "still looks fat"): an athletic build, not a
     mannequin. Shoulders well outside the ribs, a narrow waist and pelvis, a
     torso flatter front to back, long lean legs that do not touch, slimmer
     arms, and muscles that sit close on the body instead of bulging. */
  // neutral body
  {
    g: 'l',
    prof: [
      [0, 0.86],
      [0.094, 0.87],
      [0.11, 0.9],
      [0.112, 0.94],
      [0.1, 1],
      [0.092, 1.06],
      [0.1, 1.13],
      [0.126, 1.21],
      [0.156, 1.3],
      [0.168, 1.38],
      [0.15, 1.445],
      [0.085, 1.495],
      [0, 1.512]
    ],
    p: [0, 0, 0],
    kz: 0.52,
    one: 1
  },
  { g: 'c', d: [0.042, 0.1], p: [0, 1.55, -0.005], one: 1 },
  { g: 's', p: [0, 1.69, 0.005], k: [0.084, 0.106, 0.096], one: 1 },
  { g: 's', p: [0.188, 1.428, 0], k: [0.052, 0.052, 0.052] },
  {
    g: 'l',
    prof: [
      [0, 0],
      [0.031, 0.01],
      [0.034, 0.07],
      [0.038, 0.17],
      [0.041, 0.25],
      [0.039, 0.3],
      [0, 0.31]
    ],
    p: [0.228, 1.13, 0],
    r: [0, 0, 0.1]
  },
  { g: 's', p: [0.228, 1.13, 0], k: [0.031, 0.031, 0.031] },
  { g: 's', p: [0.252, 0.815, 0.01], k: [0.026, 0.058, 0.017] },
  {
    g: 'l',
    prof: [
      [0, 0],
      [0.042, 0.01],
      [0.048, 0.1],
      [0.06, 0.24],
      [0.068, 0.33],
      [0.062, 0.38],
      [0, 0.39]
    ],
    p: [0.09, 0.49, 0]
  },
  { g: 's', p: [0.09, 0.47, 0.006], k: [0.043, 0.043, 0.043] },
  {
    g: 'l',
    prof: [
      [0, 0],
      [0.027, 0.02],
      [0.03, 0.1],
      [0.041, 0.25],
      [0.038, 0.34],
      [0, 0.35]
    ],
    p: [0.09, 0.08, -0.004]
  },
  { g: 's', p: [0.092, 0.045, 0.04], k: [0.038, 0.034, 0.098] },
  // muscle groups
  { m: 'neck', g: 'c', d: [0.047, 0.07], p: [0, 1.56, -0.004], one: 1 },
  { m: 'traps', g: 's', p: [0.068, 1.47, -0.02], k: [0.076, 0.03, 0.044], r: [0, 0, -0.42] },
  { m: 'traps', g: 's', p: [0, 1.38, -0.07], k: [0.06, 0.085, 0.03], one: 1 },
  { m: 'frontDelts', g: 's', p: [0.19, 1.42, 0.03], k: [0.046, 0.066, 0.04] },
  { m: 'sideDelts', g: 's', p: [0.212, 1.422, 0], k: [0.04, 0.07, 0.044] },
  { m: 'rearDelts', g: 's', p: [0.19, 1.42, -0.031], k: [0.046, 0.066, 0.04] },
  { m: 'rotatorCuff', g: 's', p: [0.096, 1.35, -0.072], k: [0.032, 0.026, 0.016] },
  { m: 'chest', g: 's', p: [0.072, 1.34, 0.07], k: [0.076, 0.058, 0.026], r: [0, 0, -0.08] },
  { m: 'serratus', g: 's', p: [0.124, 1.25, 0.036], k: [0.02, 0.044, 0.022] },
  { m: 'upperBack', g: 's', p: [0, 1.3, -0.066], k: [0.084, 0.07, 0.026], one: 1 },
  { m: 'lats', g: 's', p: [0.118, 1.24, -0.034], k: [0.044, 0.12, 0.03], r: [0, 0, -0.3] },
  { m: 'lowerBack', g: 's', p: [0.028, 1.03, -0.046], k: [0.024, 0.075, 0.018] },
  { m: 'abs', g: 's', p: [0, 1.12, 0.044], k: [0.042, 0.14, 0.017], one: 1 },
  { m: 'obliques', g: 's', p: [0.08, 1.08, 0.03], k: [0.024, 0.07, 0.03] },
  { m: 'biceps', g: 's', p: [0.211, 1.28, 0.026], k: [0.031, 0.092, 0.03], r: [0, 0, 0.1] },
  { m: 'triceps', g: 's', p: [0.213, 1.29, -0.026], k: [0.034, 0.1, 0.032], r: [0, 0, 0.1] },
  {
    m: 'forearms',
    g: 'l',
    prof: [
      [0, 0],
      [0.024, 0.01],
      [0.027, 0.08],
      [0.035, 0.2],
      [0.034, 0.25],
      [0, 0.26]
    ],
    p: [0.252, 0.87, 0.005],
    r: [0, 0, 0.09]
  },
  { m: 'glutes', g: 's', p: [0.056, 0.9, -0.044], k: [0.054, 0.058, 0.034] },
  { m: 'abductors', g: 's', p: [0.106, 0.95, -0.012], k: [0.024, 0.048, 0.03] },
  { m: 'quads', g: 's', p: [0.092, 0.705, 0.03], k: [0.05, 0.165, 0.036] },
  { m: 'hamstrings', g: 's', p: [0.09, 0.68, -0.028], k: [0.046, 0.145, 0.036] },
  { m: 'adductors', g: 's', p: [0.05, 0.72, 0.002], k: [0.024, 0.125, 0.036] },
  { m: 'calves', g: 's', p: [0.09, 0.32, -0.02], k: [0.036, 0.095, 0.034] },
  { m: 'tibialis', g: 's', p: [0.094, 0.29, 0.024], k: [0.019, 0.095, 0.019] }
];

/* The one renderer, kept for the visit: where it stands (idle, loading,
   ready, failed, and why), three.js's scene, camera, body and materials, the
   way the body faces, a turn running, the statuses it is shaded by and the
   muscle picked, the view remembered, a drag under way, an exercise's
   muscles when a sheet shows them (and the way Today's body faced). */
/** The 3D body's state for the visit. */
export const B3: {
  state: 'idle' | 'loading' | 'ready' | 'fail';
  wait: (() => void)[];
  r: T3Renderer | null;
  scene: T3Object | null;
  cam: T3Camera | null;
  root: T3Object | null;
  meshes: T3Object[];
  mats: Record<string, T3Material>;
  yaw: number;
  anim: number;
  status: Record<string, MuscleStatus> | null;
  sel: string | null;
  fail: string;
  viewMem: 'flat' | '3d' | null;
  drag: { x: number; y: number; yaw: number; moved: boolean } | null;
  ex: { main: string; help: string[] } | null;
  yawKeep: number | null;
  w?: number;
  h?: number;
} = {
  state: 'idle',
  wait: [],
  r: null,
  scene: null,
  cam: null,
  root: null,
  meshes: [],
  mats: {},
  yaw: 0.35,
  anim: 0,
  status: null,
  sel: null,
  fail: '',
  viewMem: null,
  drag: null,
  ex: null,
  yawKeep: null
};

/** The map's view on this device: flat or 3D. */
export function mapView(): 'flat' | '3d' {
  if (B3.viewMem) return B3.viewMem;
  B3.viewMem = prefGet(MAPVIEW_KEY) === '3d' ? '3d' : 'flat';
  return B3.viewMem;
}

function darkTheme(): boolean {
  return (
    (document.documentElement.dataset['theme'] ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'
  );
}
/** The 3D body's colours, from the theme: the body, each status, and the accent an exercise's muscles take. */
export function map3dColors(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string): string => cs.getPropertyValue(n).trim();
  const dark = darkTheme();
  return {
    base: dark ? '#3b4048' : '#d5d9de',
    none: dark ? '#5d646d' : '#a9b0b8',
    track: v('--muted'),
    under: v('--yellow'),
    part: v('--part'),
    plan: v('--part'),
    in: v('--green'),
    over: v('--blue'),
    ex: v('--volt')
  };
}
/* An exercise's muscles on the body (r39, item 172): the same flat figures and
   the same 3D body, lit by what the exercise trains instead of by the week's
   sets. While the sheet with #bm3dx is open the canvas sits there, and
   Today's map takes it back when the sheet closes. */
function b3Host(): HTMLElement | null {
  return document.getElementById('bm3dx') || document.getElementById('bm3d');
}
function map3dLoad(cb: () => void): void {
  if (B3.state === 'ready' || B3.state === 'fail') {
    cb();
    return;
  }
  B3.wait.push(cb);
  if (B3.state === 'loading') return;
  B3.state = 'loading';
  // three.js as a module, from each address in turn: this build's own copy first where there is one.
  void loadModule(THREE_URLS).then(got => {
    if (got && isThree(got.mod)) window.THREE = got.mod;
    // A file that loaded but is not three.js is said too, or the 3D view would fail with nothing in the log to say why.
    else if (got) log('map3d', new Error(`${got.url} loaded, but it is not three.js`));
    if (!window.THREE) {
      B3.state = 'fail';
      B3.fail = 'The 3D view could not load. Check your connection; the flat view still works.';
    } else {
      try {
        map3dBuild(window.THREE);
        B3.state = 'ready';
      } catch (e) {
        log('map3d', e);
        B3.state = 'fail';
        B3.fail = 'This phone or browser cannot draw 3D here. The flat view shows the same numbers.';
      }
    }
    const w = B3.wait;
    B3.wait = [];
    w.forEach(f => {
      try {
        f();
      } catch (e) {
        log('map3d', e);
      }
    });
  });
}
/* A cast in the form of a type predicate: an address gives a module of no
   known shape, and three.js is taken to be what it is once the parts the
   body is built with are there. */
/** Whether what an address gave is three.js: the parts the body is built with are there. */
function isThree(m: unknown): m is Three {
  const r = rec(m);
  return (
    !!r &&
    typeof r['WebGLRenderer'] === 'function' &&
    typeof r['Scene'] === 'function' &&
    typeof r['Raycaster'] === 'function'
  );
}
function map3dBuild(T: Three): void {
  const r = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(28, 1, 0.1, 20);
  cam.position.set(0, 0.93, 3.8);
  cam.lookAt(0, 0.9, 0);
  scene.add(new T.HemisphereLight(0xffffff, 0x40444a, 1.15));
  const key = new T.DirectionalLight(0xffffff, 1.7);
  key.position.set(1.6, 2.6, 3);
  scene.add(key);
  const rim = new T.DirectionalLight(0xffffff, 1.1);
  rim.position.set(-2.2, 1.6, -2.6);
  scene.add(rim);
  const root = new T.Group();
  scene.add(root);
  const sph = new T.SphereGeometry(1, 40, 28);
  const caps: Record<string, T3Geometry> = {};
  const mat = (m: string): T3Material =>
    B3.mats[m] || (B3.mats[m] = new T.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }));
  const add = (pt: B3Part, side: number): void => {
    const d = pt.d || [0, 0];
    const g =
      pt.g === 's'
        ? sph
        : pt.g === 'l'
          ? new T.LatheGeometry(
              (pt.prof || []).map(([rr, y]) => new T.Vector2(rr, y)),
              40
            )
          : caps[d.join()] || (caps[d.join()] = new T.CapsuleGeometry(d[0], d[1], 10, 28));
    const me = new T.Mesh(g, mat(pt.m || '_base'));
    me.position.set(pt.p[0] * side, pt.p[1], pt.p[2]);
    if (pt.k) me.scale.set(pt.k[0], pt.k[1], pt.k[2]);
    if (pt.kz) me.scale.set(1, 1, pt.kz);
    if (pt.r) me.rotation.set(pt.r[0], pt.r[1], pt.r[2] * side);
    me.userData.m = pt.m || null;
    root.add(me);
    B3.meshes.push(me);
  };
  for (const pt of B3_PARTS) {
    add(pt, 1);
    if (!pt.one) add(pt, -1);
  }
  // A soft shadow on the floor grounds the figure.
  {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const x = cv.getContext('2d');
    if (x) {
      const gr = x.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,.45)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 64);
    }
    const sh = new T.Mesh(
      new T.PlaneGeometry(0.7, 0.34),
      new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.002;
    scene.add(sh);
  }
  const c = r.domElement;
  c.className = 'bm3d-canvas';
  // Sideways drags turn the body; vertical moves stay page scrolls.
  c.addEventListener('pointerdown', e => {
    B3.drag = { x: e.clientX, y: e.clientY, yaw: B3.yaw, moved: false };
    cancelAnimationFrame(B3.anim);
  });
  c.addEventListener('pointermove', e => {
    const d = B3.drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    if (d.moved) {
      B3.yaw = d.yaw + dx * 0.012;
      map3dDraw();
    }
  });
  const end = (e: PointerEvent): void => {
    const d = B3.drag;
    B3.drag = null;
    if (d && !d.moved && e.type === 'pointerup') map3dTap(e.clientX, e.clientY);
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('pointerleave', () => {
    B3.drag = null;
  });
  Object.assign(B3, { r, scene, cam, root });
}
/** The muscle under a point on the 3D body, or null (the suites read it through window.__ironlog). */
export function map3dPick(cx: number, cy: number): string | null {
  const T = window.THREE;
  if (!T || !B3.r || !B3.cam || !B3.root) return null;
  const rc = B3.r.domElement.getBoundingClientRect();
  const v = new T.Vector2(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1);
  const ray = new T.Raycaster();
  ray.setFromCamera(v, B3.cam);
  const hit = ray.intersectObjects(B3.root.children, false).find(h => h.object.userData.m);
  return hit ? hit.object.userData.m || null : null;
}
function map3dTap(cx: number, cy: number): void {
  const m = map3dPick(cx, cy);
  if (!m) return;
  // On an exercise's body a tap names the muscle; the week's numbers are on Today.
  const hb = b3Host();
  if (hb && hb.id === 'bm3dx' && B3.ex) {
    fx.toast(`${ML[m] || m}${m === B3.ex.main ? ': main' : B3.ex.help.includes(m) ? ': helper' : ''}`);
    return;
  }
  ui.mapSel = ui.mapSel === m ? null : m;
  fx.rerenderKeepScroll();
}
/** Turns the 3D body to face a way (radians), the shorter way round, eased unless motion is reduced. */
export function map3dTurnTo(to: number): void {
  if (!B3.r) return;
  cancelAnimationFrame(B3.anim);
  const tau = Math.PI * 2;
  const from = ((B3.yaw % tau) + tau) % tau;
  let d = to - from;
  if (d > Math.PI) d -= tau;
  if (d < -Math.PI) d += tau;
  let reduce = false;
  try {
    reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    // No media queries here: the turn is animated.
  }
  if (reduce) {
    B3.yaw = to;
    map3dDraw();
    return;
  }
  const t0 = performance.now(),
    dur = 420;
  const step = (t: number): void => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    B3.yaw = from + d * e;
    map3dDraw();
    if (k < 1) B3.anim = requestAnimationFrame(step);
  };
  B3.anim = requestAnimationFrame(step);
}
function map3dDraw(): void {
  const hb = b3Host();
  const host = hb && hb.querySelector<HTMLElement>('.bm3d-stage');
  if (!B3.r || !host || !B3.cam || !B3.root || !B3.scene) return;
  const w = Math.max(200, host.clientWidth || 320),
    h = Math.round(Math.min(440, w * 1.12));
  const c = B3.r.domElement;
  if (c.parentNode !== host) host.appendChild(c);
  if (B3.w !== w || B3.h !== h) {
    B3.r.setSize(w, h, false);
    c.style.width = '100%';
    c.style.height = h + 'px';
    B3.cam.aspect = w / h;
    B3.cam.updateProjectionMatrix();
    B3.w = w;
    B3.h = h;
  }
  B3.root.rotation.y = B3.yaw;
  B3.r.render(B3.scene, B3.cam);
}
/** Puts the 3D body in the card or sheet on the page (#bm3d, #bm3dx), shaded, loading three.js the first time. */
export function mount3D(): void {
  const host = b3Host();
  if (!host) return;
  const exm = host.id === 'bm3dx' ? B3.ex : null;
  const msg = host.querySelector<HTMLElement>('.bm3d-msg');
  if (B3.state !== 'ready') {
    if (B3.state === 'fail') {
      if (msg) {
        msg.hidden = false;
        msg.textContent = B3.fail;
      }
      const turn = host.querySelector<HTMLElement>('.bm3d-turn');
      if (turn) turn.hidden = true;
      return;
    }
    if (msg) {
      msg.hidden = false;
      msg.textContent = 'Loading the 3D body';
    }
    map3dLoad(() => {
      if (b3Host()) mount3D();
    });
    return;
  }
  // The card is kept between draws now (lit-html), so the loading line it showed goes as well as being hidden.
  if (msg) {
    msg.hidden = true;
    msg.textContent = '';
  }
  const col = map3dColors();
  const T = window.THREE;
  if (!T) return;
  const C = (k: string): string => col[k] || col['none'] || '';
  for (const [m, mt] of Object.entries(B3.mats)) {
    const em = mt.emissive || (mt.emissive = new T.Color(0, 0, 0));
    if (exm) {
      // Helpers halfway between the accent and the body, so they read as the same colour, lighter, on both themes.
      if (m === exm.main) mt.color.set(C('ex'));
      else if (exm.help.includes(m)) mt.color.set(C('ex')).lerp(new T.Color(C('base')), 0.5);
      else mt.color.set(m === '_base' ? C('base') : C('none'));
      em.set('#000000');
      mt.emissiveIntensity = 0;
      continue;
    }
    const st = m === '_base' ? null : B3.status && B3.status[m];
    mt.color.set(m === '_base' ? C('base') : st ? C(st.st) : C('none'));
    // White lifts a tapped muscle on the dark theme; on the light one it washed it out to pale, so there the muscle glows in its own colour (r29).
    const lightUI = !darkTheme();
    if (m === B3.sel) {
      if (lightUI) em.copy(mt.color);
      else em.set('#ffffff');
    } else em.set('#000000');
    mt.emissiveIntensity = m === B3.sel ? (lightUI ? 0.45 : 0.28) : 0;
  }
  map3dDraw();
}

/* ---------- Today's card ---------- */

/** The muscle map on Today: flat or 3D, the 4-week average or this week, the legend, and a muscle's numbers when one is picked. */
export function mapCard(): TemplateResult {
  const I = IDX();
  const avg = actualAvg4();
  const src = ui.mapSrc === 'week' || !avg ? 'week' : 'avg';
  const st = muscleStatus(src === 'avg' ? avg : I.weekSets[weekStart(today())] || {}, src === 'week');
  const S = (m: string): MuscleStatus => st[m] || { v: 0, lo: 0, hi: 0, st: 'none' };
  // "1 hard set", and no target for a tracked-only muscle (r34.2, from the review).
  const hsw = (v: number): string => `${r1(v)} hard set${r1(v) === 1 ? '' : 's'} a week`;
  const tgt = (m: string): string => (!hasTarget(m) ? ', tracked only' : `, target ${S(m).lo} to ${S(m).hi}`);
  const lab = (m: string): string =>
    noLog() ? `${ML[m]}: nothing logged yet${tgt(m)}` : `${ML[m]}: ${hsw(S(m).v)}${tgt(m)}`;
  const fig = (view: 'f' | 'b', label: string): TemplateResult =>
    html`<figure class="bm"><svg viewBox="0 0 120 210" aria-label=${`${label} of body`}><g class="bm-base">${BM_BASE}</g>${Object.entries(
      BM[view]
    ).map(
      ([m, sh]) =>
        svg`<g class=${`mm st-${S(m).st}${ui.mapSel === m ? ' sel' : ''}`} data-act="mapSel" data-m=${m} role="button" tabindex="0" aria-label=${lab(m)}><title>${lab(m)}</title>${sh.map(bmShape)}</g>`
    )}</svg><figcaption>${label}</figcaption></figure>`;
  const counts: Record<string, number | string> = { under: 0, part: 0, plan: 0, in: 0, over: 0, none: 0, track: 0 };
  for (const m of MK) counts[S(m).st] = +(counts[S(m).st] || 0) + 1;
  if (noLog()) for (const k in counts) counts[k] = NIL;
  const sel = typeof ui.mapSel === 'string' && st[ui.mapSel] ? ui.mapSel : null;
  let detail: TemplateResult;
  if (sel) {
    const x = S(sel);
    const sc = I.scores.find(y => y.m === sel);
    const where =
      x.st === 'none'
        ? src === 'week'
          ? 'Not yet this week'
          : 'Not trained'
        : x.st === 'track'
          ? 'Tracked only'
          : x.st === 'under'
            ? `${r1(x.lo - x.v)} below target`
            : x.st === 'part'
              ? `${r1(x.lo - x.v)} to go`
              : x.st === 'plan'
                ? 'On plan'
                : x.st === 'over'
                  ? `${r1(x.v - x.hi)} above target`
                  : 'On target';
    const tr = sc
      ? `${musTrend(sc)}${sc.indirect ? ', read from exercises that train it indirectly' : ''}.`
      : 'Not enough sessions yet for a strength trend.';
    const tagCls =
      x.st === 'in'
        ? 'green'
        : x.st === 'under'
          ? 'yellow'
          : x.st === 'over'
            ? 'blue'
            : x.st === 'plan'
              ? 'hastip'
              : '';
    detail = html`<div class="bm-detail"><div class="row spread"><b>${ML[sel]}</b><span class=${`tag ${tagCls}`} data-tip=${x.st === 'plan' ? ON_PLAN_TIP : nothing}>${where}</span></div><p class="small" style="margin:4px 0 6px">${
      src === 'avg' && avg
        ? `${hsw(x.v)} on average over ${avgWeeksTxt(avg)}`
        : `${r1(x.v)} hard set${r1(x.v) === 1 ? '' : 's'} so far this week`
    }${tgt(sel)}. ${tr}</p><div class="row"><button class="btn sm" data-act="goDash" data-sec="volume" data-m=${sel}>Weekly trend</button><button class="btn sm" data-act="mapSel" data-m=${sel}>Close</button></div></div>`;
  } else {
    const low = MK.filter(m => hasTarget(m) && lowSt(S(m)));
    detail = html`<p class="small muted" style="margin:6px 0 0">Tap a muscle ${tipButton(
      `${mapView() === '3d' ? 'Drag sideways to turn it. ' : ''}Tap a muscle for its numbers.${src === 'week' ? ' This is the week so far, so most muscles read low early in the week.' : ''}`,
      'About the map'
    )}</p>${
      low.length && src === 'avg'
        ? html`<div class="row" style="margin-top:6px;gap:4px"><span class="small muted">Below target:</span>${low.slice(0, 8).map(m => html`<button class="chip" data-act="mapSel" data-m=${m}>${ML[m]}</button>`)}</div>`
        : nothing
    }`;
  }
  /* The summary is a count out of the muscles with a target (V, r42): "15 of 19 on target". Tracked-only muscles have no target, so they are in neither number. */
  const N = MK.filter(m => hasTarget(m)).length;
  const msub = ((): string => {
    if (!avg) {
      if (!state.sessions.length) return 'none logged yet';
      const n = MK.filter(m => hasTarget(m) && metSt(S(m))).length;
      return `${n} of ${N} on target so far`;
    }
    const sa = muscleStatus(avg);
    const inA = MK.filter(m => {
      const q = sa[m];
      return hasTarget(m) && !!q && metSt(q);
    }).length;
    return `${inA} of ${N} on target`;
  })();
  const v3 = mapView() === '3d';
  B3.status = st;
  B3.sel = sel;
  const stage = v3
    ? html`<div class="bm3d" id="bm3d"><div class="bm3d-stage" role="img" aria-label="3D body, shaded by hard sets a week. Drag sideways to turn it, tap a muscle for its numbers. The same numbers are in the flat view."></div><p class="bm3d-msg small muted" hidden></p><div class="seg bm3d-turn" role="group" aria-label="Turn the body"><button class="chip" data-act="map3dTurn" data-v="0">Front</button><button class="chip" data-act="map3dTurn" data-v="1">Side</button><button class="chip" data-act="map3dTurn" data-v="2">Back</button></div></div>`
    : html`<div class="bm-wrap">${fig('f', 'Front')}${fig('b', 'Back')}</div>`;
  const on = (x: boolean): string => `chip ${x ? 'on' : ''}`;
  return section({
    sk: 'today:map',
    key: 'map',
    title: 'Muscle map',
    sub: msub,
    body: html`<div class="row spread"><div class="seg" role="group" aria-label="View"><button class=${on(!v3)} data-act="mapView" data-v="flat" aria-pressed=${String(!v3)}>Flat</button><button class=${on(v3)} data-act="mapView" data-v="3d" aria-pressed=${String(v3)}>3D</button></div><div class="seg" role="group" aria-label="Time range">${
      avg
        ? html`<button class=${on(src === 'avg')} data-act="mapSrc" data-v="avg" aria-pressed=${String(src === 'avg')}>4-week avg</button>`
        : nothing
    }<button class=${on(src === 'week')} data-act="mapSrc" data-v="week" aria-pressed=${String(src === 'week')}>This week</button></div></div>
${stage}
<div class="bm-legend small">${
      src === 'week'
        ? html`<span class="hastip" data-tip="The week is still going: short of the minimum so far, not behind."><i class="st-part"></i>Under way ${counts['part']}</span>`
        : html`<span><i class="st-under"></i>Below target ${counts['under']}</span>${counts['plan'] ? html`<span class="hastip" data-tip=${ON_PLAN_TIP}><i class="st-plan"></i>On plan ${counts['plan']}</span>` : nothing}`
    }<span><i class="st-in"></i>On target ${counts['in']}</span><span><i class="st-over"></i>Above ${counts['over']}</span><span><i class="st-none"></i>${src === 'week' ? 'Not yet' : 'None'} ${counts['none']}</span>${
      counts['track']
        ? html`<span class="hastip" data-tip="Counted, with no weekly target, so never called under or over. Give one a target in Settings, Weekly set targets."><i class="st-track"></i>Tracked only ${counts['track']}</span>`
        : nothing
    }</div>
${detail}`
  });
}

/* ---------- the map's taps ---------- */

type Tap = { dataset: DOMStringMap };
/** The map's taps: a muscle picked (or unpicked), the weeks it reads, flat or 3D (kept on this device), and the 3D body turned. */
export const MAP_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  mapSel(t) {
    const m = t.dataset['m'] ?? null;
    ui.mapSel = ui.mapSel === m ? null : m;
    fx.rerenderKeepScroll();
  },
  mapSrc(t) {
    ui.mapSrc = t.dataset['v'] ?? null;
    fx.rerenderKeepScroll();
  },
  mapView(t) {
    const v = t.dataset['v'] === '3d' ? '3d' : 'flat';
    // Remembered for this visit only when the device keeps no preferences.
    prefSet(MAPVIEW_KEY, v);
    B3.viewMem = v;
    fx.rerenderKeepScroll();
  },
  map3dTurn(t) {
    map3dTurnTo([0, Math.PI / 2, Math.PI][+(t.dataset['v'] || 0)] || 0);
  }
};

/* ---------- an exercise's muscles (the exercise sheets) ---------- */

/* An exercise's muscles on the body (r39, item 172), for the exercise sheets
   in the legacy script (r60 moves them): the same flat figures, the main
   muscle in the accent, helpers lighter (they count half a set), the rest
   left neutral. */
/** An exercise's main muscle and its helpers. */
export function exMusParts(e: { primary: string; secondary?: readonly string[] | undefined }): {
  main: string;
  help: string[];
} {
  const help = (e.secondary || []).filter(k => k !== e.primary);
  return { main: e.primary, help };
}
/** An exercise's muscles on the flat figures, front and back (small in the editor). */
export function exBodyFlat(
  e: { primary: string; secondary?: readonly string[] | undefined },
  small?: boolean
): TemplateResult {
  const { main, help } = exMusParts(e);
  const fig = (view: 'f' | 'b', label: string): TemplateResult =>
    html`<figure class="bm"><svg viewBox="0 0 120 210" aria-hidden="true"><g class="bm-base">${BM_BASE}</g>${Object.entries(
      BM[view]
    ).map(
      ([k, sh]) =>
        svg`<g class=${`mx ${k === main ? 'ex-main' : help.includes(k) ? 'ex-help' : ''}`}>${sh.map(bmShape)}</g>`
    )}</svg><figcaption>${label}</figcaption></figure>`;
  return html`<div class=${small ? 'bm-wrap bm-small' : 'bm-wrap'}>${fig('f', 'Front')}${fig('b', 'Back')}</div>`;
}
/** An exercise's muscles in words: the main one and the helpers, with what a helper counts. */
export function exMusWords(e: { primary: string; secondary?: readonly string[] | undefined }): TemplateResult {
  const { main, help } = exMusParts(e);
  return html`<p class="small" style="margin:0"><b>Main</b>: ${ML[main] || main}${
    help.length
      ? html`. <b>Helpers</b>: ${andList(help.map(k => ML[k] || k))} ${tipButton(
          "A helper muscle counts half a set toward its weekly total (Pelland 2025). Which muscles are helpers on a lift is the library's own call, including grip and holding muscles such as the forearms and traps on a deadlift, which the study behind the half credit did not measure.",
          'About helper muscles'
        )}`
      : nothing
  }</p>`;
}
/** The key to an exercise's figures: main, and helper when it has helpers. */
export function exMusLegend(e: { primary: string; secondary?: readonly string[] | undefined }): TemplateResult {
  return html`<div class="bm-legend small"><span><i class="ex-main"></i>Main</span>${exMusParts(e).help.length ? html`<span><i class="ex-help"></i>Helper</span>` : nothing}</div>`;
}
