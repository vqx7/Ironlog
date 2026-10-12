/* ---------- MUSCLE MAP ----------
   A flat front and back outline. Each muscle is shaded by where its weekly hard
   sets sit against your own target band. Coordinates are for a 120 x 210 box;
   left-side shapes are mirrored to the right. */
const BM_BASE='<circle cx="60" cy="16" r="11"/><rect x="38" y="35" width="44" height="72" rx="12"/><rect x="23" y="39" width="14" height="42" rx="7"/><rect x="83" y="39" width="14" height="42" rx="7"/><rect x="21" y="78" width="11" height="36" rx="5.5"/><rect x="88" y="78" width="11" height="36" rx="5.5"/><circle cx="26" cy="118" r="5"/><circle cx="94" cy="118" r="5"/><rect x="37" y="102" width="21" height="54" rx="9"/><rect x="62" y="102" width="21" height="54" rx="9"/><rect x="40" y="152" width="14" height="46" rx="7"/><rect x="66" y="152" width="14" height="46" rx="7"/><ellipse cx="47" cy="202" rx="8" ry="4"/><ellipse cx="73" cy="202" rx="8" ry="4"/>';
/* ---------- 3D body (Today > Muscle map > 3D) ----------
   A stylized, sculpted body built from smooth shapes, one region per muscle
   group, shaded exactly like the flat map (below, on, above target, none,
   tracked only) from the same numbers. Drag sideways to turn it; the page
   still scrolls vertically. Tap a region for the same detail as the flat map.
   three.js loads only the first time 3D is opened, and the drawing happens
   only when something changes, so it costs nothing while idle. One renderer
   is kept for the whole visit: each re-render of Today moves its canvas into
   the new card instead of building a new one. */
const MAPVIEW_KEY=KEY+'.mapView';
const THREE_URLS=['https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.min.js','https://unpkg.com/three@0.159.0/build/three.module.min.js'];
const B3={state:'idle',wait:[],r:null,scene:null,cam:null,root:null,meshes:[],mats:{},yaw:0.35,anim:0,status:null,sel:null,fail:'',viewMem:null,drag:null,ex:null};
function mapView(){
  if(B3.viewMem)return B3.viewMem;
  try{B3.viewMem=localStorage.getItem(MAPVIEW_KEY)==='3d'?'3d':'flat';}catch(e){B3.viewMem='flat';}
  return B3.viewMem;
}
/* Shapes, in metres, for the right side (x > 0); the left side mirrors them.
   l: a lathe (a profile of [radius, height] turned around its own axis, for
   smooth tapered limbs and the torso), s: a sphere scaled to an ellipsoid,
   c: a capsule [radius, length]. kz flattens front to back. m names the
   muscle group; parts without one are the neutral body underneath, and the
   muscle shapes sit almost flush on it, like an anatomy figure. */
const B3_PARTS=[
  /* Proportions (r29, V: "still looks fat"): an athletic build, not a
     mannequin. Shoulders well outside the ribs, a narrow waist and pelvis, a
     torso flatter front to back, long lean legs that do not touch, slimmer
     arms, and muscles that sit close on the body instead of bulging. */
  // neutral body
  {g:'l',prof:[[0,.86],[.094,.87],[.11,.9],[.112,.94],[.1,1],[.092,1.06],[.1,1.13],[.126,1.21],[.156,1.3],[.168,1.38],[.15,1.445],[.085,1.495],[0,1.512]],p:[0,0,0],kz:.52,one:1},
  {g:'c',d:[.042,.1],p:[0,1.55,-.005],one:1},
  {g:'s',p:[0,1.69,.005],k:[.084,.106,.096],one:1},
  {g:'s',p:[.188,1.428,0],k:[.052,.052,.052]},
  {g:'l',prof:[[0,0],[.031,.01],[.034,.07],[.038,.17],[.041,.25],[.039,.3],[0,.31]],p:[.228,1.13,0],r:[0,0,.1]},
  {g:'s',p:[.228,1.13,0],k:[.031,.031,.031]},
  {g:'s',p:[.252,.815,.01],k:[.026,.058,.017]},
  {g:'l',prof:[[0,0],[.042,.01],[.048,.1],[.06,.24],[.068,.33],[.062,.38],[0,.39]],p:[.09,.49,0]},
  {g:'s',p:[.09,.47,.006],k:[.043,.043,.043]},
  {g:'l',prof:[[0,0],[.027,.02],[.03,.1],[.041,.25],[.038,.34],[0,.35]],p:[.09,.08,-.004]},
  {g:'s',p:[.092,.045,.04],k:[.038,.034,.098]},
  // muscle groups
  {m:'neck',g:'c',d:[.047,.07],p:[0,1.56,-.004],one:1},
  {m:'traps',g:'s',p:[.068,1.47,-.02],k:[.076,.03,.044],r:[0,0,-.42]},
  {m:'traps',g:'s',p:[0,1.38,-.07],k:[.06,.085,.03],one:1},
  {m:'frontDelts',g:'s',p:[.19,1.42,.03],k:[.046,.066,.04]},
  {m:'sideDelts',g:'s',p:[.212,1.422,0],k:[.04,.07,.044]},
  {m:'rearDelts',g:'s',p:[.19,1.42,-.031],k:[.046,.066,.04]},
  {m:'rotatorCuff',g:'s',p:[.096,1.35,-.072],k:[.032,.026,.016]},
  {m:'chest',g:'s',p:[.072,1.34,.07],k:[.076,.058,.026],r:[0,0,-.08]},
  {m:'serratus',g:'s',p:[.124,1.25,.036],k:[.02,.044,.022]},
  {m:'upperBack',g:'s',p:[0,1.3,-.066],k:[.084,.07,.026],one:1},
  {m:'lats',g:'s',p:[.118,1.24,-.034],k:[.044,.12,.03],r:[0,0,-.3]},
  {m:'lowerBack',g:'s',p:[.028,1.03,-.046],k:[.024,.075,.018]},
  {m:'abs',g:'s',p:[0,1.12,.044],k:[.042,.14,.017],one:1},
  {m:'obliques',g:'s',p:[.08,1.08,.03],k:[.024,.07,.03]},
  {m:'biceps',g:'s',p:[.211,1.28,.026],k:[.031,.092,.03],r:[0,0,.1]},
  {m:'triceps',g:'s',p:[.213,1.29,-.026],k:[.034,.1,.032],r:[0,0,.1]},
  {m:'forearms',g:'l',prof:[[0,0],[.024,.01],[.027,.08],[.035,.2],[.034,.25],[0,.26]],p:[.252,.87,.005],r:[0,0,.09]},
  {m:'glutes',g:'s',p:[.056,.9,-.044],k:[.054,.058,.034]},
  {m:'abductors',g:'s',p:[.106,.95,-.012],k:[.024,.048,.03]},
  {m:'quads',g:'s',p:[.092,.705,.03],k:[.05,.165,.036]},
  {m:'hamstrings',g:'s',p:[.09,.68,-.028],k:[.046,.145,.036]},
  {m:'adductors',g:'s',p:[.05,.72,.002],k:[.024,.125,.036]},
  {m:'calves',g:'s',p:[.09,.32,-.02],k:[.036,.095,.034]},
  {m:'tibialis',g:'s',p:[.094,.29,.024],k:[.019,.095,.019]}
];
function map3dColors(){
  const cs=getComputedStyle(document.documentElement);const v=n=>cs.getPropertyValue(n).trim();
  const dark=(document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))==='dark';
  return {base:dark?'#3b4048':'#d5d9de',none:dark?'#5d646d':'#a9b0b8',track:v('--muted'),under:v('--yellow'),part:v('--part'),in:v('--green'),over:v('--blue'),ex:v('--volt')};
}
/* An exercise's muscles on the body (r39, item 172): the same flat figures and
   the same 3D body, lit by what the exercise trains instead of by the week's
   sets. The main muscle in the accent, helpers lighter (they count half a
   set), the rest left neutral. One renderer serves both: while the sheet with
   #bm3dx is open the canvas sits there, and Today's map takes it back when the
   sheet closes. */
function b3Host(){return document.getElementById('bm3dx')||document.getElementById('bm3d');}
function exMusParts(e){const help=(e.secondary||[]).filter(k=>k!==e.primary);return {main:e.primary,help};}
function exBodyFlat(e,small){
  const {main,help}=exMusParts(e);
  const fig=(view,label)=>`<figure class="bm"><svg viewBox="0 0 120 210" aria-hidden="true"><g class="bm-base">${BM_BASE}</g>${Object.entries(BM[view]).map(([k,sh])=>`<g class="mx ${k===main?'ex-main':help.includes(k)?'ex-help':''}">${sh.map(bmShape).join('')}</g>`).join('')}</svg><figcaption>${label}</figcaption></figure>`;
  return `<div class="bm-wrap${small?' bm-small':''}">${fig('f','Front')}${fig('b','Back')}</div>`;
}
function exMusWords(e){const {main,help}=exMusParts(e);return `<p class="small" style="margin:0"><b>Main</b>: ${esc(ML[main]||main)}${help.length?`. <b>Helpers</b>: ${esc(andList(help.map(k=>ML[k]||k)))} ${tipi('A helper muscle counts half a set toward its weekly total (Pelland 2025).','About helper muscles')}`:''}</p>`;}
function exMusLegend(e){return `<div class="bm-legend small"><span><i class="ex-main"></i>Main</span>${exMusParts(e).help.length?'<span><i class="ex-help"></i>Helper</span>':''}</div>`;}
function map3dLoad(cb){
  if(B3.state==='ready'||B3.state==='fail'){cb();return;}
  B3.wait.push(cb);if(B3.state==='loading')return;
  B3.state='loading';
  // three.js as a module, from each address in turn: this build's own copy
  // first where there is one.
  const load=(urls,done)=>{if(!urls.length){done(false);return;}import(urls[0]).then(mod=>{window.THREE=mod;done(true);},()=>load(urls.slice(1),done));};
  load(THREE_URLS,ok=>{
    if(!ok||!window.THREE){B3.state='fail';B3.fail='The 3D view could not load. Check your connection; the flat view still works.';}
    else{try{map3dBuild();B3.state='ready';}catch(e){log('map3d',e);B3.state='fail';B3.fail='This phone or browser cannot draw 3D here. The flat view shows the same numbers.';}}
    const w=B3.wait;B3.wait=[];w.forEach(f=>{try{f();}catch(e){log('map3d',e);}});
  });
}
function map3dBuild(){
  const T=window.THREE;
  const r=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  r.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  const scene=new T.Scene();
  const cam=new T.PerspectiveCamera(28,1,.1,20);cam.position.set(0,.93,3.8);cam.lookAt(0,.9,0);
  scene.add(new T.HemisphereLight(0xffffff,0x40444a,1.15));
  const key=new T.DirectionalLight(0xffffff,1.7);key.position.set(1.6,2.6,3);scene.add(key);
  const rim=new T.DirectionalLight(0xffffff,1.1);rim.position.set(-2.2,1.6,-2.6);scene.add(rim);
  const root=new T.Group();scene.add(root);
  const sph=new T.SphereGeometry(1,40,28);const caps={};
  const mat=m=>B3.mats[m]||(B3.mats[m]=new T.MeshStandardMaterial({roughness:.55,metalness:.05}));
  const add=(pt,side)=>{
    const g=pt.g==='s'?sph:pt.g==='l'?new T.LatheGeometry(pt.prof.map(([r,y])=>new T.Vector2(r,y)),40):(caps[pt.d.join()]||(caps[pt.d.join()]=new T.CapsuleGeometry(pt.d[0],pt.d[1],10,28)));
    const me=new T.Mesh(g,mat(pt.m||'_base'));
    me.position.set(pt.p[0]*side,pt.p[1],pt.p[2]);
    if(pt.k)me.scale.set(pt.k[0],pt.k[1],pt.k[2]);
    if(pt.kz)me.scale.set(1,1,pt.kz);
    if(pt.r)me.rotation.set(pt.r[0],pt.r[1],pt.r[2]*side);
    me.userData.m=pt.m||null;root.add(me);B3.meshes.push(me);
  };
  for(const pt of B3_PARTS){add(pt,1);if(!pt.one)add(pt,-1);}
  // A soft shadow on the floor grounds the figure.
  {const cv=document.createElement('canvas');cv.width=cv.height=64;const x=cv.getContext('2d');const gr=x.createRadialGradient(32,32,2,32,32,32);gr.addColorStop(0,'rgba(0,0,0,.45)');gr.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gr;x.fillRect(0,0,64,64);
   const sh=new T.Mesh(new T.PlaneGeometry(.7,.34),new T.MeshBasicMaterial({map:new T.CanvasTexture(cv),transparent:true,depthWrite:false}));sh.rotation.x=-Math.PI/2;sh.position.y=.002;scene.add(sh);}
  const c=r.domElement;c.className='bm3d-canvas';
  // Sideways drags turn the body; vertical moves stay page scrolls.
  c.addEventListener('pointerdown',e=>{B3.drag={x:e.clientX,y:e.clientY,yaw:B3.yaw,moved:false};cancelAnimationFrame(B3.anim);});
  c.addEventListener('pointermove',e=>{const d=B3.drag;if(!d)return;const dx=e.clientX-d.x;if(Math.abs(dx)>4)d.moved=true;if(d.moved){B3.yaw=d.yaw+dx*.012;map3dDraw();}});
  const end=e=>{const d=B3.drag;B3.drag=null;if(d&&!d.moved&&e.type==='pointerup')map3dTap(e.clientX,e.clientY);};
  c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);c.addEventListener('pointerleave',()=>{B3.drag=null;});
  Object.assign(B3,{r,scene,cam,root});
}
function map3dPick(cx,cy){
  const T=window.THREE;if(!B3.r)return null;
  const rc=B3.r.domElement.getBoundingClientRect();
  const v=new T.Vector2(((cx-rc.left)/rc.width)*2-1,-((cy-rc.top)/rc.height)*2+1);
  const ray=new T.Raycaster();ray.setFromCamera(v,B3.cam);
  const hit=ray.intersectObjects(B3.root.children,false).find(h=>h.object.userData.m);
  return hit?hit.object.userData.m:null;
}
function map3dTap(cx,cy){const m=map3dPick(cx,cy);if(!m)return;
  // On an exercise's body a tap names the muscle; the week's numbers are on Today.
  const hb=b3Host();if(hb&&hb.id==='bm3dx'&&B3.ex){toast(`${ML[m]||m}${m===B3.ex.main?': main':B3.ex.help.includes(m)?': helper':''}`);return;}
  ui.mapSel=ui.mapSel===m?null:m;rerenderKeepScroll();}
function map3dTurnTo(to){
  if(!B3.r)return;cancelAnimationFrame(B3.anim);
  // The shorter way round.
  let from=B3.yaw;const tau=Math.PI*2;from=((from%tau)+tau)%tau;let d=to-from;if(d>Math.PI)d-=tau;if(d<-Math.PI)d+=tau;
  let reduce=false;try{reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){/* animate */}
  if(reduce){B3.yaw=to;map3dDraw();return;}
  const t0=performance.now(),dur=420;
  const step=t=>{const k=Math.min(1,(t-t0)/dur);const e=1-Math.pow(1-k,3);B3.yaw=from+d*e;map3dDraw();if(k<1)B3.anim=requestAnimationFrame(step);};
  B3.anim=requestAnimationFrame(step);
}
function map3dDraw(){
  const hb=b3Host();const host=hb&&hb.querySelector('.bm3d-stage');if(!B3.r||!host)return;
  const w=Math.max(200,host.clientWidth||320),h=Math.round(Math.min(440,w*1.12));
  const c=B3.r.domElement;
  if(c.parentNode!==host)host.appendChild(c);
  if(B3.w!==w||B3.h!==h){B3.r.setSize(w,h,false);c.style.width='100%';c.style.height=h+'px';B3.cam.aspect=w/h;B3.cam.updateProjectionMatrix();B3.w=w;B3.h=h;}
  B3.root.rotation.y=B3.yaw;B3.r.render(B3.scene,B3.cam);
}
function mount3D(){
  const host=b3Host();if(!host)return;const exm=host.id==='bm3dx'&&B3.ex;
  const msg=host.querySelector('.bm3d-msg');
  if(B3.state!=='ready'){
    if(B3.state==='fail'){msg.hidden=false;msg.textContent=B3.fail;host.querySelector('.bm3d-turn').hidden=true;return;}
    msg.hidden=false;msg.textContent='Loading the 3D body';
    map3dLoad(()=>{if(b3Host())mount3D();});return;
  }
  msg.hidden=true;
  const col=map3dColors();const T=window.THREE;
  for(const [m,mt] of Object.entries(B3.mats)){
    mt.emissive=mt.emissive||new T.Color(0,0,0);
    if(exm){
      // Helpers halfway between the accent and the body, so they read as the same
      // colour, lighter, on both themes.
      if(m===B3.ex.main)mt.color.set(col.ex);else if(B3.ex.help.includes(m))mt.color.set(col.ex).lerp(new T.Color(col.base),.5);else mt.color.set(m==='_base'?col.base:col.none);
      mt.emissive.set('#000000');mt.emissiveIntensity=0;continue;
    }
    const st=m==='_base'?null:B3.status&&B3.status[m];
    mt.color.set(m==='_base'?col.base:st?col[st.st]||col.none:col.none);
    // White lifts a tapped muscle on the dark theme; on the light one it washed
    // it out to pale, so there the muscle glows in its own colour (r29).
    const lightUI=(document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))!=='dark';
    if(m===B3.sel){if(lightUI)mt.emissive.copy(mt.color);else mt.emissive.set('#ffffff');}else mt.emissive.set('#000000');mt.emissiveIntensity=m===B3.sel?(lightUI?.45:.28):0;
  }
  map3dDraw();
}
const BM=(()=>{
  const E=(cx,cy,rx,ry)=>[['e',cx,cy,rx,ry],['e',120-cx,cy,rx,ry]];
  const Rr=(x,y,w,h,r)=>[['r',x,y,w,h,r],['r',120-x-w,y,w,h,r]];
  const P=pts=>[['p',pts],['p',pts.map(([x,y])=>[120-x,y])]];
  return {
    f:{neck:[['r',54,27,12,9,3]],traps:P([[45,38],[54,31],[55,39]]),sideDelts:E(29,47,4,8),frontDelts:E(36,45,7,8),serratus:E(40.5,60,2.4,4.6),chest:Rr(41,40,18,17,7),biceps:E(30,66,5,11),forearms:E(27,93,4.5,13),abs:[['r',51,59,18,35,6]],obliques:Rr(43,61,7,28,3),abductors:E(40,106,4,7),quads:E(47,131,8,23),adductors:Rr(54,108,5,22,2.5),tibialis:E(46,176,3.5,15)},
    b:{neck:[['r',54,27,12,9,3]],upperBack:[['r',44,44,32,21,7]],traps:[['p',[[60,30],[75,40],[60,60],[45,40]]]],rotatorCuff:E(48.5,52,3.6,4.2),sideDelts:E(29,47,4,8),rearDelts:E(36,45,7,8),lats:P([[40,62],[51,66],[54,88],[44,82]]),triceps:E(30,66,5,11),forearms:E(27,93,4.5,13),lowerBack:[['r',52,84,16,18,5]],abductors:E(41,103,4,6),glutes:E(51,112,9,9),hamstrings:E(47,138,8,17),adductors:Rr(55,118,4,18,2),calves:E(47,174,6,13)}
  };
})();
function bmShape(x){
  if(x[0]==='e')return `<ellipse cx="${x[1]}" cy="${x[2]}" rx="${x[3]}" ry="${x[4]}"/>`;
  if(x[0]==='r')return `<rect x="${x[1]}" y="${x[2]}" width="${x[3]}" height="${x[4]}" rx="${x[5]}"/>`;
  return `<polygon points="${x[1].map(q=>q.join(',')).join(' ')}"/>`;
}
/* Below or above a weekly target, judged at the precision the screen shows
   (one decimal, r29): an average of 9.96 reads "10" and is not called below
   a minimum of 10. A minimum of 0 is never missed. */
function belowMin(v,lo){return lo>0&&r1(v||0)<lo;}
function aboveMax(v,hi){return r1(v||0)>hi;}
/* soFar (r29): the week is still going, so a muscle short of its minimum is
   under way ('part'), not below target; amber on a Tuesday read as behind
   for training that had not happened yet. With no sets a muscle is 'none'
   whatever its target: one whose minimum was brought down to 0 (a routine
   that does not train it) showed green before a single set (V, r29).
   On an average, a muscle with a minimum and no sets is below target, and
   shows so on the map, in its legend and in the summary alike. */
function muscleStatus(src,soFar){
  const b=state.settings.bands;const out={};
  for(const m of MK){const v=src?(src[m]||0):0;const [lo,hi]=b[m];out[m]={v,lo,hi,st:TRACK_ONLY.has(m)?'track':v<=0?(!soFar&&src&&lo>0?'under':'none'):belowMin(v,lo)?(soFar?'part':'under'):aboveMax(v,hi)?'over':'in'};}
  return out;
}
const lowSt=x=>x.st==='under'||(x.st==='none'&&x.lo>0);
function bodyMapCard(){
  const I=IDX();const avg=actualAvg4();
  const src=(ui.mapSrc==='week'||!avg)?'week':'avg';
  const st=muscleStatus(src==='avg'?avg:(I.weekSets[weekStart(today())]||{}),src==='week');
  // "1 hard set", and no target for a tracked-only muscle (r34.2, from the review).
  const hsw=v=>`${r1(v)} hard set${r1(v)===1?'':'s'} a week`;const tgt=m=>TRACK_ONLY.has(m)?', tracked only':`, target ${st[m].lo} to ${st[m].hi}`;
  const lab=m=>noLog()?`${ML[m]}: nothing logged yet${tgt(m)}`:`${ML[m]}: ${hsw(st[m].v)}${tgt(m)}`;
  const fig=(view,label)=>`<figure class="bm"><svg viewBox="0 0 120 210" aria-label="${label} of body"><g class="bm-base">${BM_BASE}</g>${Object.entries(BM[view]).map(([m,sh])=>`<g class="mm st-${st[m].st}${ui.mapSel===m?' sel':''}" data-act="mapSel" data-m="${m}" role="button" tabindex="0" aria-label="${esc(lab(m))}"><title>${esc(lab(m))}</title>${sh.map(bmShape).join('')}</g>`).join('')}</svg><figcaption>${label}</figcaption></figure>`;
  const counts={under:0,part:0,in:0,over:0,none:0,track:0};for(const m of MK)counts[st[m].st]++;
  if(noLog())for(const k in counts)counts[k]=NIL;
  const sel=ui.mapSel&&st[ui.mapSel]?ui.mapSel:null;
  let detail;
  if(sel){
    const x=st[sel];const sc=I.scores.find(y=>y.m===sel);
    const where=x.st==='none'?(src==='week'?'Not yet this week':'Not trained'):x.st==='track'?'Tracked only':x.st==='under'?`${r1(x.lo-x.v)} below target`:x.st==='part'?`${r1(x.lo-x.v)} to go`:x.st==='over'?`${r1(x.v-x.hi)} above target`:'On target';
    const tr=sc?`${musTrend(sc)}${sc.indirect?', read from exercises that train it indirectly':''}.`:'Not enough sessions yet for a strength trend.';
    detail=`<div class="bm-detail"><div class="row spread"><b>${ML[sel]}</b><span class="tag ${x.st==='in'?'green':x.st==='under'?'yellow':x.st==='over'?'blue':''}">${where}</span></div><p class="small" style="margin:4px 0 6px">${src==='avg'?`${hsw(x.v)} on average over ${avgWeeksTxt(avg)}`:`${r1(x.v)} hard set${r1(x.v)===1?'':'s'} so far this week`}${tgt(sel)}. ${tr}</p><div class="row"><button class="btn sm" data-act="goDash" data-sec="volume" data-m="${sel}">Weekly trend</button><button class="btn sm" data-act="mapSel" data-m="${sel}">Close</button></div></div>`;
  }else{
    const low=MK.filter(m=>!TRACK_ONLY.has(m)&&lowSt(st[m]));
    detail=`<p class="small muted" style="margin:6px 0 0">Tap a muscle ${tipi(`${mapView()==='3d'?'Drag sideways to turn it. ':''}Tap a muscle for its numbers.${src==='week'?' This is the week so far, so most muscles read low early in the week.':''}`,'About the map')}</p>${low.length&&src==='avg'?`<div class="row" style="margin-top:6px;gap:4px"><span class="small muted">Below target:</span>${low.slice(0,8).map(m=>`<button class="chip" data-act="mapSel" data-m="${m}">${ML[m]}</button>`).join('')}</div>`:''}`;
  }
  const msub=(()=>{if(!avg){if(!state.sessions.length)return 'none logged yet';const n=MK.filter(m=>st[m].st==='in'||st[m].st==='over').length;return `this week so far, ${n} at target`;}const sa=muscleStatus(avg);const inA=MK.filter(m=>sa[m].st==='in'||sa[m].st==='over').length;const lowA=MK.filter(m=>!TRACK_ONLY.has(m)&&lowSt(sa[m])).length;return lowA?`${inA} at target, ${lowA} below on average`:`${inA} at target on average`;})();
  const v3=mapView()==='3d';
  B3.status=st;B3.sel=sel;
  const stage=v3?`<div class="bm3d" id="bm3d"><div class="bm3d-stage" role="img" aria-label="3D body, shaded by hard sets a week. Drag sideways to turn it, tap a muscle for its numbers. The same numbers are in the flat view."></div><p class="bm3d-msg small muted" hidden></p><div class="seg bm3d-turn" role="group" aria-label="Turn the body"><button class="chip" data-act="map3dTurn" data-v="0">Front</button><button class="chip" data-act="map3dTurn" data-v="1">Side</button><button class="chip" data-act="map3dTurn" data-v="2">Back</button></div></div>`:`<div class="bm-wrap">${fig('f','Front')}${fig('b','Back')}</div>`;
  return sec({sk:'today:map',key:'map',title:'Muscle map',sub:msub,body:`<div class="row spread"><div class="seg" role="group" aria-label="View"><button class="chip ${v3?'':'on'}" data-act="mapView" data-v="flat" aria-pressed="${!v3}">Flat</button><button class="chip ${v3?'on':''}" data-act="mapView" data-v="3d" aria-pressed="${v3}">3D</button></div><div class="seg" role="group" aria-label="Time range">${avg?`<button class="chip ${src==='avg'?'on':''}" data-act="mapSrc" data-v="avg" aria-pressed="${src==='avg'}">4-week avg</button>`:''}<button class="chip ${src==='week'?'on':''}" data-act="mapSrc" data-v="week" aria-pressed="${src==='week'}">This week</button></div></div>
  ${stage}
  <div class="bm-legend small">${src==='week'?`<span class="hastip" data-tip="The week is still going: short of the minimum so far, not behind."><i class="st-part"></i>Under way ${counts.part}</span>`:`<span><i class="st-under"></i>Below target ${counts.under}</span>`}<span><i class="st-in"></i>On target ${counts.in}</span><span><i class="st-over"></i>Above ${counts.over}</span><span><i class="st-none"></i>${src==='week'?'Not yet':'None'} ${counts.none}</span>${counts.track?`<span class="hastip" data-tip="Serratus, rotator cuff, neck, and tibialis: sets are counted, but no study sets a weekly dose, so they are never called under or over."><i class="st-track"></i>Tracked only ${counts.track}</span>`:''}</div>
  ${detail}`});
}
/* Session length measured from Start to Finish. Sessions logged for a past date,
   left open over six hours, or shorter than a minute are not timed. */
function sessionLength(){
  const from=addDays(today(),-28);const R=activeRoutine();
  const ss=state.sessions.filter(x=>x.date>=from&&x.durMin);
  // An average of one is not an average (r30): shown from 3 timed sessions.
  if(ss.length<3)return null;
  const avg=Math.round(ss.reduce((a,x)=>a+x.durMin,0)/ss.length);
  const pl=ss.filter(x=>x.routineId===R.id).map(x=>{const i=sessDayIdx(R,x);return i>=0?dayMinutes(R.days[i],x.light||x.deload):0;}).filter(x=>x>0);
  return {avg,n:ss.length,plan:pl.length?Math.round(pl.reduce((a,b)=>a+b,0)/pl.length):null};
}
/* The bests a lift had up to a date, for a past session entered after later
   ones: the same fields exStats gives for the whole log (best in the current
   rep range, best per band of reps to failure, best overall). No "easier"
   read, since that is about the lift now. */
function statsUpTo(exId,exps){
  const now=IDX().exStats[exId]||{};let best=null,bestAll=null;const byBand={};
  for(const x of exps){if(x.best==null)continue;if(sameRR(x.rr,now.rr))best=best==null?x.best:Math.max(best,x.best);bestAll=bestAll==null?x.best:Math.max(bestAll,x.best);}
  for(const x of exps)if(x.pb!=null)byBand[x.pbb]=Math.max(byBand[x.pbb]||0,x.pb);
  return {best,bestAll,byBand,rr:now.rr,easier:null};
}
/* A set is a PR live if its estimate beats your best, or no earlier set matched
   it on both load and reps: the same two tests the PR list uses. Only sets
   logged up to the session's date count, so a past session entered late is
   judged against what came before it. */
function livePR(exId,s,date){
  if(!s||s.warm||s.drop||!(+s.r>0))return null;
  const I=IDX();const every=I.byEx[exId];if(!every||!every.length)return null;
  const exps=date?every.filter(x=>x.date<=date):every;if(!exps.length)return null;
  const ex=EX(exId);const load=prLoad(ex,s,date);
  const st=exps.length<every.length?statsUpTo(exId,exps):I.exStats[exId];const q0=rirEst(s,ex);const v=noE1(ex)?null:e1(load,+s.r,q0);
  /* Announced only when stronger than ever (r32, as the list's big): by the
     same score as the rep PR floor, against every earlier set. A lift with
     no estimate (timed, joint rotation) or no load known keeps every kind. */
  const scq=(l,r,q)=>e1(l,r,q)||l*(1+r/30);let top=0,dom=false;
  for(const x of exps)for(const q of x.pts){if(q.pl>=load-1e-6&&q.r>=+s.r)dom=true;top=Math.max(top,scq(q.pl,q.r,q.rq));}
  const judge=!noE1(ex)&&!ex.timed&&load>0;const stronger=!judge||scq(load,+s.r,q0)>top+1e-9;
  // More weight than any earlier working set comes first (r29), as in the PR
  // list, and before the load check: an assisted set with no bodyweight
  // logged has no load to estimate from, but less help is still a PR.
  if(!ex.timed&&s.w!==''&&s.w!=null&&isNum(+s.w)){let mw=-Infinity;for(const x of exps)for(const q of x.pts)if(q.r>0)mw=Math.max(mw,q.w);if(+s.w>mw+1e-6&&stronger)return 'Weight PR';}
  if(!(load>0)&&!ex.timed)return null;
  // A new best is judged within the set's own band of reps to failure.
  if(v!=null&&st){const bd=st.byBand&&st.byBand[rtfBand(rtfOf(+s.r,q0))];if(bd!=null&&v>bd+1e-6)return 'Best';}
  if(dom||!stronger)return null;
  // At 90% or more of the strongest set before it, as in the PR list (r30).
  if(!ex.timed&&scq(load,+s.r,q0)<top*REP_PR_SHARE-1e-9)return null;
  return ex.timed?'Time PR':'Rep PR';
}
function refreshPR(bi,si,announce){
  const d=state.draft;if(!d)return;const b=d.ex[bi];const s=b&&b.sets[si];if(!s)return;
  const btn=document.querySelector(`[data-act="sDone"][data-b="${bi}"][data-s="${si}"]`);const row=btn&&btn.closest('.sg');if(!row)return;
  const was=row.classList.contains('pr');let pr=s.done&&!d.light&&!d.deload&&!b.light?livePR(b.exId,s,d.date):null;
  /* Not a PR when an earlier set in this session was as strong (r32, second
     check: 100 x 10, then 100 x 9 announced as a new best). Lighter and
     deload work is never one. */
  if(pr){const ex=EX(b.exId);const scq=x=>{const l=prLoad(ex,x,d.date);return e1(l,+x.r,rirEst(x,ex))||l*(1+(+x.r)/30);};const me=scq(s);
    if(b.sets.some((x,i)=>i<si&&x.done&&!x.warm&&!x.drop&&+x.r>0&&scq(x)>=me-1e-9))pr=null;}
  row.classList.toggle('pr',!!pr);
  if(pr)row.setAttribute('data-pr',pr);else row.removeAttribute('data-pr');
  if(announce&&pr&&!was){
    toast(`${pr==='Best'?(isCompound(EX(b.exId))?'New best estimate':'PR'):pr}: ${exName(b.exId)}, ${setShort(EX(b.exId),+s.w||0,s.r)}${prBeat(b.exId,s,d.date,pr)}`,false,4200,'pr');
    /* The PR moment (item 28): a short gold pulse on the row, and a buzz where
       the phone allows it (Android; iPhones give web apps no vibration). */
    row.classList.remove('prflash');void row.offsetWidth;row.classList.add('prflash');
    try{if(navigator.vibrate)navigator.vibrate([30,50,30]);}catch(e){/* optional */}
  }
}
/* What a live PR beat, as a short tail for the toast: the old best estimate in
   the set's band, or the most reps done at this load or heavier. */
function prBeat(exId,s,date,pr){
  const I=IDX();const every=I.byEx[exId];if(!every)return '';
  const exps=date?every.filter(x=>x.date<=date):every;const ex=EX(exId);const load=prLoad(ex,s,date);
  const st=exps.length<every.length?statsUpTo(exId,exps):I.exStats[exId];const q=rirEst(s,ex);const bd=st&&st.byBand&&st.byBand[rtfBand(rtfOf(+s.r,q))];const v=noE1(ex)?null:e1(load,+s.r,q);
  /* The estimate a set beats is the best from sets of a similar number of
     reps (its band), so the toast names the band (r30): "new best estimate
     279" read as wrong beside an overall best of 301 from heavier sets. */
  const bandW=BAND_WORDS[rtfBand(rtfOf(+s.r,q))]||'';
  if(pr==='Best'){if(bd==null||v==null)return '';
    // The overall best before this set, so "was" never names a band's best that reads as lower than the bests board (r34.2).
    let all=null;for(const x of exps)if(x.pb!=null&&!(date&&x.date===date))all=all==null?x.pb:Math.max(all,x.pb);
    if(!isCompound(ex))return ` (your best for ${bandW})`;
    return all==null||v>all+1e-6?` (estimated 1RM ${fmtE(v)} ${U()}${all!=null?`; was ${fmtE(all)}`:''})`:` (your best for ${bandW}, ${fmtE(v)} ${U()})`;}
  if(pr==='Weight PR'){let mw=-Infinity;for(const x of exps)for(const p of x.pts)if(p.r>0)mw=Math.max(mw,p.w);
    const was=ex.assist?`less help than ever`:`heaviest before ${ex.bw?loadLabel(ex,mw):fmtW(mw)+' '+U()}`;
    return ` (${was}${isCompound(ex)&&bd!=null&&v!=null&&v>bd+1e-6?`; best estimate for ${bandW} now ${fmtE(v)}`:''})`;}
  let m=0;for(const x of exps)for(const p of x.pts)if(p.pl>=load-1e-6)m=Math.max(m,p.r);
  return m?` (was ${m} ${ex.timed?'s':'reps'})`:' (heaviest yet)';
}
/* ---------- READINESS ----------
   The three check-in taps against how the session went: the share of lifts
   that set a PR (a new best estimate or a rep PR), per answer. First sessions
   of a lift, and deload, lighter and trimmed work, are left out because they
   cannot show progress. */
const chkWord=n=>n==='OK'?'OK':n.toLowerCase();
const CHK_Q=[['sleep','Sleep',['Poor','OK','Good']],['energy','Energy',['Low','OK','High']],['joints','Aches',['Sore','A little','None']]];
function readiness(){
  const I=IDX();const bySid={};
  for(const id in I.byEx)I.byEx[id].forEach((x,i)=>{if(i===0||offSession(x))return;const o=bySid[x.sid]||(bySid[x.sid]={n:0,p:0});o.n++;if(x.progress)o.p++;});
  const sess=state.sessions.filter(s=>!s.demo&&s.chk&&bySid[s.id]);
  const rows=CHK_Q.map(([k,l,names])=>({k,l,groups:[3,2,1].map(v=>{const g=sess.filter(s=>s.chk[k]===v);const n=g.reduce((a,s)=>a+bySid[s.id].n,0),p=g.reduce((a,s)=>a+bySid[s.id].p,0);return {v,name:names[v-1],sessions:g.length,rate:n?p/n*100:null};})}));
  return {n:sess.length,rows};
}
function readinessBody(){
  const r=readiness();
  if(r.n<6)return `<p class="small muted hastip" style="margin:0" data-tip="Answer the three check-in taps at the start of a session (sleep, energy, aches). After 6 sessions with answers, this shows whether they line up with how your lifts go.">Needs 6 sessions with a check-in${r.n?`; ${r.n} so far`:''}.</p>`;
  return r.rows.map(q=>`<p class="small" style="margin:6px 0"><b>${q.l}.</b> ${q.groups.map(g=>g.sessions>=2&&g.rate!=null?`${chkWord(g.name)}: ${Math.round(g.rate)}% of lifts set a PR (${g.sessions} sessions)`:`${chkWord(g.name)}: ${g.sessions?`${g.sessions} session${g.sessions===1?'':'s'}, too few`:'none yet'}`).join('; ')}.</p>`).join('')
    +`<p class="small muted hastip" style="margin:6px 0 0" data-tip="A pattern in your own log, not proof of cause. A gap of a few points is noise.">From ${r.n} sessions</p>`;
}
function checkinCard(d){
  const c=d.chk||{};
  const sum=CHK_Q.filter(([k])=>c[k]).map(([k,l,n])=>`${l.toLowerCase()} ${chkWord(n[c[k]-1])}`).join(', ');
  const low=CHK_Q.filter(([k])=>c[k]===1).length;
  return sec({sk:'logger:checkin',title:'Check-in',sub:sum?esc(sum):'optional',body:`${CHK_Q.map(([k,l,names])=>`<div class="ci-row"><span class="small">${l}</span><div class="seg" role="group" aria-label="${l}">${names.map((n,i)=>`<button class="chip ${c[k]===i+1?'on':''}" data-act="chk" data-k="${k}" data-v="${i+1}" aria-pressed="${c[k]===i+1}">${n}</button>`).join('')}</div></div>`).join('')}
  `})+readyCard(d,low);
}
/* What the check-in offers (r30). Answering it changed nothing, and the
   advice sat inside the check-in, which folds itself once all three are
   answered, so nobody saw it. It now sits below the check-in with the two
   changes that answer it. Two or more low answers: a lighter session is
   offered first; one: a note to keep a rep more in reserve. */
function readyCard(d,low){
  if(!low||d.light||d.deload||d.editingId||d.past)return '';
  const open=d.ex.some(b=>!b.light&&!b.sets.some(x=>!x.warm&&!rowBlank(b,x)));const left=remainMin(d);
  // Already made lighter: say so instead of offering it again.
  if(low>=2&&!open&&d.ex.some(b=>b.light))return `<p class="callout" style="margin:8px 0 0" id="readyCard">Made lighter: the exercises not started are half the sets at about 90% loads.</p>`;
  if(low<2)return `<p class="callout" style="margin:8px 0 0" id="readyCard">One low answer: keep the loads and leave a rep more in reserve than planned if it feels heavy.</p>`;
  return `<div class="callout yellow" style="margin:8px 0 0" id="readyCard"><p style="margin:0">Low readiness today. ${tipi('A lighter or shorter session fits a low day better than pushing. Make it lighter changes only the exercises not started: half the sets, about 90% loads, nothing to beat.')}</p><div class="row" style="margin-top:8px">${open?'<button class="btn sm" data-act="makeLight">Make it lighter</button>':''}${left>0?'<button class="btn sm" data-act="shortOpen">Short on time</button>':''}</div></div>`;
}
/* ---------- SHORT ON TIME ----------
   Minutes of lifting left in the session, counted like the plan estimate:
   40 seconds a set plus its rest (none inside a superset), and 3 minutes of
   setup for an exercise not started yet. */
function blockRest(d,bi){const b=d.ex[bi],nx=d.ex[bi+1];return (b.plan.ss&&nx&&nx.plan.ss===b.plan.ss)?0:(+b.plan.rest||0);}
/* Minutes left for the header: none once every set is done (min5 shows at least 1, so 0 left read "about 1 min left"). */
function leftMin(d){if(!d||d.editingId||d.free||d.past)return 0;const m=remainMin(d);return m>0?min5(m):0;}
function remainMin(d){
  // No rest is taken after the very last set, the same as the plan's estimate.
  let s=0,cN=0,lastRest=0;
  d.ex.forEach((b,bi)=>{const ex=EX(b.exId);const su=setupSecs(ex,cN);if(isCompound(ex))cN++;const n=b.sets.filter(x=>!x.done&&!x.warm).length;if(!n)return;const r=blockRest(d,bi);s+=n*(setSecs(ex,b.plan)+r)+(b.sets.some(x=>x.done)?0:su);lastRest=r;});
  return Math.round(Math.max(0,s-lastRest)/60);
}
/* The whole session's planned minutes as it stands, with every set it has
   now (r30): after Short on time the recap compared the time taken with the
   untrimmed routine day ("planned about 77" after trimming to 45). */
function draftPlanMin(d){
  if(!d||!d.ex.length)return 0;
  return dayMinutes({items:d.ex.map(b=>({...b.plan,exId:b.exId,sets:b.sets.filter(x=>!x.warm).length,rest:+b.plan.rest||0}))},false);
}
/* Trim to fit. Lowest priority first: sets come off down to 2 per exercise,
   then whole exercises not started yet drop out, then exercises in progress
   finish with what is done. An exercise whose muscle another kept exercise
   already trains goes before one that is the only work for its muscle, so
   every muscle keeps at least one movement for as long as possible. Priority
   and lagging muscles are kept longest, then the earlier exercise, since a
   routine usually puts its main lifts first. Done sets are never touched. */
function shortPlan(d,mins){
  const pri=new Set(state.settings.priorities);const lag=new Set(IDX().scores.filter(x=>x.label==='lagging').map(x=>x.m));
  let cN=0;
  // Typed but not ticked counts as done here: trimming takes only blank rows (rowBlank).
  const bl=d.ex.map((b,bi)=>{const ex=EX(b.exId);const undone=b.sets.filter(x=>!x.warm&&rowBlank(b,x)).length;const done=b.sets.filter(x=>!x.warm&&!rowBlank(b,x)).length;const started=b.sets.some(x=>!rowBlank(b,x));
    const su=setupSecs(ex,cN);if(isCompound(ex))cN++;
    // Main (compound) lifts rank above isolation work, as the Short on time
    // help promises; priority and lagging muscles above both.
    return {bi,ex,undone,done,started,keep:undone,rest:blockRest(d,bi),per:setSecs(ex,b.plan),su,score:(pri.has(ex.primary)?4:0)+(lag.has(ex.primary)?2:0)+(isCompound(ex)?1:0)-bi*0.01};});
  const cost=()=>bl.reduce((a,x)=>a+(x.keep?x.keep*(x.per+x.rest)+(x.started?0:x.su):0),0)/60;
  const byLow=arr=>arr.slice().sort((a,b)=>a.score-b.score);
  let guard=0;
  while(cost()>mins&&guard++<500){const c=byLow(bl.filter(x=>x.keep>0&&x.done+x.keep>2));if(!c.length)break;c[0].keep--;}
  const kept=x=>x.keep>0||x.done>0;
  // A fly does not cover a bench press: only a compound covers a compound.
  const covered=x=>bl.some(y=>y!==x&&kept(y)&&y.ex.primary===x.ex.primary&&(isCompound(y.ex)||!isCompound(x.ex)));
  while(cost()>mins&&guard++<1000){const c=bl.filter(x=>x.keep>0&&!x.started);if(!c.length)break;const red=c.filter(covered);byLow(red.length?red:c)[0].keep=0;}
  while(cost()>mins&&guard++<1500){const c=byLow(bl.filter(x=>x.keep>0&&x.started));if(!c.length)break;c[0].keep--;}
  const changes=[];
  for(const x of bl){if(x.keep===x.undone)continue;
    if(x.keep===0&&!x.started)changes.push(`Skip ${x.ex.name}`);
    else changes.push(`${x.ex.name}: ${x.done+x.undone} → ${x.done+x.keep} set${x.done+x.keep===1?'':'s'}${x.done?` (${x.done} done)`:''}`);}
  return {bl,changes,est:Math.round(cost()),over:cost()>mins};
}
