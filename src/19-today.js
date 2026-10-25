/* ---------- TODAY'S SHEETS ----------
   Today is drawn by src/app/today.ts since r59, and the session screen by
   src/app/workout.ts since r60. What they open stays here until the sheets
   move (r61): Change, the install steps, the new icon's steps, and a lift's
   history. */
/* Change, on either card: one sheet with every other way to start. */
function startAltSheet(m){
  const R=activeRoutine();const di=Math.min(+m.di||0,R.days.length-1);const day=R.days[di];
  const playable=!!day&&!day.rest&&day.items.length>0;const deload=isDeloadWeek();
  const weekly=R.schedule==='weekly';const wd=(new Date().getDay()+6)%7;const cs=weekly?null:cycleState(R);
  const mark=i=>weekly?(i===wd?' · today':''):(i===cs.next?' · next':i===cs.last?' · last done':'');
  const opt=(go,title,what,extra)=>`<button class="ob-opt" data-act="altGo" data-go="${go}"${extra||''}><b>${title}</b><span>${what}</span></button>`;
  const opts=[];
  if(m.free&&playable)opts.push(opt('startSession',`Plan: ${esc(day.name)}`,`${day.items.length} exercises from your plan`,` data-day="${di}"`));
  if(!m.free&&playable&&!deload)opts.push(opt('startSession','Lighter day','Every exercise, half the sets, about 90% loads',` data-day="${di}" data-light="1"`));
  if(!m.free&&playable)opts.push(opt('startShort','Short on time','Your minutes; the main work stays at full effort',` data-day="${di}"`));
  if(!m.free)opts.push(opt('startFree','Blank session','Add exercises as you go; your plan stays where it is'));
  opts.push(opt('pickToday','Pick for me','The day that fits today best, and why'));
  const days=R.days.map((d,i)=>`<button type="button" class="btn block pastday${i===di&&!m.free?' on':''}" data-act="dayPick" data-i="${i}" aria-current="${i===di&&!m.free}"><span>${esc(dayLabel(R,i))}: ${esc(d.name)}</span><small>${d.rest?'Rest day':`${d.items.length} exercises`}${mark(i)}</small></button>`).join('');
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="saH"><div class="sheet-h"><h3 id="saH">Start something else</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
  <div class="ob-opts">${opts.join('')}</div><p class="small muted" style="margin:14px 0 6px">Another day</p><div class="stack">${days}</div></div>`;
}
/* ---------- install (the installable build opened in a browser) ----------
   Android and desktop Chrome offer a real install: the build catches that
   offer and Install uses it. An iPhone has no install button for websites
   (Apple allows only Share > Add to Home Screen), so there Install opens a
   short picture guide for the browser in use. Nothing shows once installed,
   inside Claude, or in the plain source file. */
/* Where this copy of the app lives, for the install pictures and steps, so
   they stay right when the app moves to its own domain (r27). */
function siteHost(){return location.host&&/^https?:$/.test(location.protocol)?location.host:SITE_HOST;}
function siteDir(){const p=location.pathname.replace(/[^/]*$/,'').replace(/\/$/,'');return /^https?:$/.test(location.protocol)?p:SITE_DIR_FALLBACK;}
window.ironlogInstallReady=()=>{if(ui.tab==='today'||ui.tab==='settings')rerenderKeepScroll();};
function iconSheet(){
  const safe=!!acct.user&&cloud.on;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="icH"><div class="sheet-h"><h3 id="icH">Get the new icon</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
  ${safe?'<p class="small" style="margin:0 0 10px">Your log is in your account, so nothing is lost.</p>'
    :`<p class="small callout yellow" style="margin:0 0 10px"><b>Removing ${APP_NAME} from the home screen also removes the log on this phone.</b> Sign in first so it is kept in your account, or save a backup.</p><div class="row" style="margin-bottom:10px">${AUTH()?'<button class="btn sm primary" data-act="acctOpen" data-mode="signin">Sign in</button>':''}<button class="btn sm" data-act="export">Save a backup</button></div>`}
  <ol class="steps"><li>Press and hold ${APP_NAME} on your home screen and remove it.</li><li>Open ${esc(location.host+location.pathname.replace(/index\.html$/,''))} in Safari, tap Share, then Add to Home Screen.</li><li>Open the new icon${safe?' and sign in':''}.</li></ol>
  <button class="btn block" style="margin-top:12px" data-act="iconLater">Done</button></div>`;
}
/* Where the button is, drawn: Safari 26's compact bar (⋯ beside the
   address), older Safari's bottom toolbar (Share in the middle), Chrome's
   address bar (Share at its right). The ring marks the one to tap. */
function installPic(how){
  const hl=(x,y)=>`<circle cx="${x}" cy="${y}" r="25" class="ip-hl"/>`;
  const url=(x,y,w)=>`<rect x="${x}" y="${y}" width="${w}" height="40" rx="20" class="ip-b"/><text x="${x+w/2}" y="${y+25}" text-anchor="middle" class="ip-t">${esc(siteHost())}</text>`;
  const share=(x,y)=>`<g class="ip-i" transform="translate(${x-12} ${y-13})"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></g>`;
  let g,lbl;
  if(how==='ios-safari26'){lbl="Safari's bar at the bottom of the screen. The ⋯ button is to the right of the address.";
    g=`<circle cx="36" cy="48" r="20" class="ip-b"/><path class="ip-i" d="M40 40l-8 8 8 8"/>${url(64,28,190)}<circle cx="284" cy="48" r="20" class="ip-b"/><circle cx="276" cy="48" r="2.6" class="ip-d"/><circle cx="284" cy="48" r="2.6" class="ip-d"/><circle cx="292" cy="48" r="2.6" class="ip-d"/>${hl(284,48)}`;}
  else if(how==='ios-safari'){lbl="Safari's toolbar at the bottom of the screen. Share is the middle button.";
    g=`${url(40,4,240)}<path class="ip-i" d="M36 62l-8 8 8 8"/><path class="ip-i ip-dim" d="M96 62l8 8-8 8"/>${share(160,71)}<path class="ip-i ip-dim" d="M214 63c5-2 11-2 17 1v16c-6-3-12-3-17-1zM248 63c-5-2-11-2-17 1v16c6-3 12-3 17-1z"/><rect x="276" y="66" width="15" height="15" rx="3" class="ip-i ip-dim"/><path class="ip-i ip-dim" d="M281 62h11a3 3 0 0 1 3 3v11"/>${hl(160,70)}`;}
  else if(how==='ios-chrome'){lbl="Chrome's address bar at the top of the screen. Share is at its right end.";
    g=`<rect x="16" y="24" width="288" height="44" rx="22" class="ip-b"/><text x="140" y="51" text-anchor="middle" class="ip-t">${esc(siteHost())}</text>${share(274,46)}${hl(274,46)}`;}
  else return '';
  return `<svg class="ipic" viewBox="0 0 320 96" role="img" aria-label="${esc(lbl)}">${g}</svg>`;
}
function installSheet(m){
  const step=(n,html)=>`<li><span class="stepn">${n}</span><span>${html}</span></li>`;
  const ios=/^ios/.test(m.how);
  const add=step(2,`Tap <b>Add to Home Screen</b> ${ADD_ICON}, then <b>Add</b>.`);
  let body;
  if(m.how==='ios-safari26')body=`<ol class="isteps">${step(1,'Tap <b>⋯</b> right of the address, then <b>Share</b> '+SHARE_ICON+'.')}${add}</ol>`;
  else if(m.how==='ios-safari')body=`<ol class="isteps">${step(1,`Tap <b>Share</b> ${SHARE_ICON} in the bar at the bottom.`)}${add}</ol>`;
  else if(m.how==='ios-chrome')body=`<ol class="isteps">${step(1,`Tap <b>Share</b> ${SHARE_ICON} at the right of the address bar.`)}${add}</ol>`;
  else if(m.how==='ios-other')body=`<ol class="isteps">${step(1,`Open <b>${esc(siteHost()+siteDir())}</b> in Safari.`)}${step(2,'Tap <b>⋯</b>, then <b>Share</b>, then <b>Add to Home Screen</b>.')}</ol>`;
  else body=`<ol class="isteps">${step(1,"Open your browser's menu (⋮ or ⋯).")}${step(2,'Choose <b>Install app</b> or <b>Add to Home screen</b>, then confirm.')}</ol>`;
  /* The reasons go in a tip (item 56). One line stays on screen only when it
     matters: a log already kept in this browser does not follow the app. */
  const tip=(ios?'An iPhone installs web apps only from the Share menu; Apple allows no install button. If Add to Home Screen is not in the list, scroll down or tap More. Keep Open as Web App on if it is shown. ':'')+`Then open ${APP_NAME} from your home screen: it starts full screen and works offline. A log kept in this browser does not move by itself: sign in inside the app, or export a backup here and import it there.`;
  const hasLog=state.sessions.some(x=>!x.demo)&&!acct.user;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="instH"><div class="sheet-h"><h3 id="instH">${ios?'Add to Home Screen':`Install ${APP_NAME}`}</h3>${tipi(tip,'About installing')}<button class="ib" aria-label="Close" data-act="mClose" style="margin-left:auto">✕</button></div>${installPic(m.how)}${body}${hasLog?'<p class="small" style="margin:10px 0 0">Your log here does not move by itself. Sign in in the app, or use a backup.</p>':''}<button type="button" class="btn primary block" style="margin-top:14px" data-act="mClose">Done</button></div>`;
}
/* ---------- INSIGHTS ----------
   What the home screen and the dashboard summary say first. Every number here
   is read from the same analytics the detailed sections use (IDX, exStats,
   scores, actualAvg4), so a headline and the section under it cannot
   disagree. This layer only decides what to say, never how to calculate. */
// Counted PRs only (r32): the ones marked big.
// PRs worth announcing within any window. The screens use recent4w (src/app/display.ts); the
// suites reach for this one to check a window of their own.
function prsWithin(days){const from=addDays(today(),-days);return IDX().prs.filter(x=>x.date>=from&&x.big);}
/* A lift's history from inside a session (r32, from the third review: a
   Strong or Hevy user expects it a tap away, not only the Last line). The
   recent sessions as logged, labelled as the Last line labels them
   (sessionWord), a line of the strength reading (direction only), the best,
   and a link to the full view in Stats. */
function exHistSheet(exId){
  const ex=EX(exId);const all=IDX().byEx[exId]||[];const st=IDX().exStats[exId]||{};const be=(allTimeBests(exId)||{}).est; // the best estimate All-time bests says (PENDING 338 1)
  const head=`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="exhH"><div class="sheet-h"><h3 id="exhH">${esc(ex.name)}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>`;
  if(!all.length)return head+'<p class="muted">Not logged yet. Its history and chart start with this session.</p></div>';
  const pts=all.filter(x=>x.tv!=null&&!lighter(x)).slice(-12);
  let chart='';
  if(pts.length>=2){const W=300,H=64,P=6;const v=pts.map(x=>x.tv);const lo=Math.min(...v),hi=Math.max(...v);const span=hi-lo||hi*0.02||1;
    const xy=pts.map((x,i)=>[P+i*(W-2*P)/(pts.length-1),H-P-(x.tv-lo)/span*(H-2*P)]);
    chart=`<figure class="exh-chart" style="margin:4px 0 0"><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Strength reading over the last ${pts.length} full sessions"><polyline fill="none" stroke="var(--volt)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${xy.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ')}"/>${xy.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="var(--volt)"/>`).join('')}</svg>
      <figcaption class="small muted row spread"><span>${fmtDate(pts[0].date)}</span><span class="hastip" data-tip="Each full session's working sets read as one number from loads, reps, and RIR when it is rated on most sets. It shows direction only and is not a 1RM. Sessions where the lift was done lighter are left out.">Strength reading</span><span>${fmtDate(pts[pts.length-1].date)}</span></figcaption></figure>`;}
  const bs=bestSet(exId);
  const best=be&&isCompound(ex)?`Best estimate ${fmtE(be.v)} ${U()}${loadNote(ex)}`:bs?`Best set ${setShort(ex,bs.w,bs.r)}${ex.bw?'':' '+U()}`:'';
  // The sets as logged (warm-ups and drops marked, RIR as typed), from the saved session.
  const setsOf=x=>{const ss=state.sessions.find(q=>q.id===x.sid);const bl=ss&&ss.ex.find(q=>q.exId===exId);return bl?bl.sets.map(q=>setStr(ex,q)).join(', '):x.pts.map(q=>setShort(ex,q.w,q.r)).join(', ');};
  const rows=all.slice(-10).reverse().map(x=>{const kind=sessionWord(x);
    return `<li style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="row spread"><b>${fmtDate(x.date)}</b>${kind?`<span class="tag">${kind}</span>`:''}</div><span class="small">${esc(setsOf(x))}</span></li>`;}).join('');
  return head+`${best?`<p style="margin:0"><b>${esc(best)}</b></p>`:''}${liftTrend(exId)}${chart}
    <ul style="list-style:none;margin:8px 0 0;padding:0">${rows}</ul>
    ${all.length>10?`<p class="small muted" style="margin:6px 0 0">The last 10 of ${all.length} sessions.</p>`:''}
    <button class="btn block" style="margin-top:10px" data-act="goDash" data-sec="exercise" data-ex="${esc(exId)}">Open in Stats</button></div>`;
}
