/* ---------- TODAY ---------- */
function viewToday(){
  if(state.draft)return viewLogger();
  if(obActive())return obView();
  const R=activeRoutine();const wd=(new Date().getDay()+6)%7;
  const weekly=R.schedule==='weekly';const cs=weekly?null:cycleState(R);
  if(ui.todayDay!=null&&ui.todayDay>=R.days.length)ui.todayDay=null;
  const di=ui.todayDay==null?(weekly?wd:cs.next):ui.todayDay;const day=R.days[di];
  // "Next up" is said once, in Change day below (r28): on the card it made the
  // date line wrap and leave "UP" on a line of its own on a phone.
  // On a scheduled rest day the card shows the next training day, and says so (r30: "Day 1 of 7" beside "rest today, Day 7").
  const eyebrow=weekly?(di===wd?'Today':`Viewing ${DAYS[di]}`):`${cs&&cs.restToday&&ui.todayDay==null?'Next: ':''}${dayLabel(R,di)}`;
  let note='';
  if(cs&&ui.todayDay==null){
    if(cs.lastDate===today())note=`${dayLabel(R,cs.last)} done today.`;
    else if(cs.restToday)note=`<b>Scheduled rest today</b> (${dayLabel(R,cs.restIdx)} of your cycle). ${esc(R.days[cs.next].name)} is ready whenever you want it.`;
  }
  const playable=!day.rest&&day.items.length>0;
  const deload=isDeloadWeek();
  /* Freestyle by default (r34, V): for a lifter who never follows a plan,
     Today opens on a blank session (Settings > Rest timer and logging). The
     plan's day stays one tap away, and Change day shows it as before. */
  const free=state.settings.todayStart==='free'&&ui.todayDay==null;
  const hello=state.settings.userName?`<p class="hello">${esc(greeting())}, ${esc(state.settings.userName)}</p>`:'';
  if(free){
    let h=welcomeCard()+acctBar()+installBar()+iconBar()+`<section class="hero" data-day="free"><div class="hero-top"><div class="hero-t">${hello}<p class="eyebrow">${esc(todayEye())} · Freestyle${deload?' · deload week':''}</p><h2>Blank session</h2>
    <p class="muted small" style="margin:0">${noLog()?'Add exercises as you go.':(()=>{const w=weekStats();return w.doneDays?`${w.doneDays} session${w.doneDays===1?'':'s'}, ${r1(w.got)} hard sets this week`:'Nothing yet this week.';})()}</p></div></div>
    <button class="btn primary block big" data-act="startFree">Start session</button>
    <div class="row" style="margin-top:8px">${changeBtn(di,true)}${moreBtn(deload)}</div>${moreRow(deload,false,di)}</section>`;
    return h+bwDueCard()+todayRest({playable:false,di,cs,day,deload});
  }
  let h=welcomeCard()+acctBar()+installBar()+iconBar()+`<section class="hero" data-day="${di}"><div class="hero-top"><div class="hero-t">${state.settings.userName?`<p class="hello">${esc(greeting())}, ${esc(state.settings.userName)}</p>`:''}<p class="eyebrow">${esc(todayEye())} · ${esc(eyebrow)}${deload?' · deload week':isRestWeek(weekStart(today()))?' · rest week':''}</p><h2>${esc(day.name)}</h2>
  <p class="muted small" style="margin:0" data-tip="${esc('Routine: '+R.name)}">${playable?`${day.items.length} exercises · ${deload?day.items.reduce((a,it)=>a+Math.max(1,Math.ceil(it.sets/2)),0)+' sets (deload)':daySets(day)+' sets'} · ${minTxt(dayMinutes(day,deload))}`:(day.rest?'Rest day':'No exercises planned')}</p></div>${heroRing(weekStats())}</div>
  ${note?`<p class="hero-note small">${note}</p>`:''}`;
  /* Four ways to start besides the plan as written, each saying on its face
     what it changes. Lighter and Short on time answer different problems:
     Lighter is for a body that needs less today (every exercise, half the
     sets, about 90% loads); Short on time is for a clock that allows less (full
     effort on what matters most, the rest trimmed to your minutes). */
  /* One way to start (r35, V): Start, and Change for everything else (a
     lighter day, short on time, a blank session, Pick for me, another day of
     the plan), so the card is not five buttons and a list deep. */
  if(playable)h+=`<button class="btn primary block big" data-act="startSession" data-day="${di}">${deload?'Start deload session':'Start session'}</button>`;
  else h+=`<p class="small" style="margin:10px 0 0">${day.rest?'Rest day.':'Nothing planned for this day.'}</p>`;
  // Deload, equipment, injury and cardio are occasional, so they sit behind
  // More. An active deload still shows in the eyebrow and on its button.
  h+=`<div class="row" style="margin-top:8px">${changeBtn(di,false)}${moreBtn(deload)}<span style="margin-left:auto"></span>${helpBtn('starts')}</div>
  ${helpText('starts','In <b>Change</b>: <b>Lighter day</b>: every exercise on the day, half the sets (rounded up), about 90% of the loads, 3 or more reps in reserve, and no target to beat: a one-day deload. For a day you are run down or sore, or slept badly. It does not count against your trends. <b>Short on time</b>: tell it your minutes; it keeps priority and lagging muscles and your main lifts at full effort and trims the rest. <b>Pick for me</b>: ranks your routine\'s days for today from what each muscle got in the last 7 days, how recently it was trained hard, injuries, and where you are in the cycle, then says why. <b>Blank session</b>: log anything; your cycle stays put. <b>Deload week</b> (More options): a whole week of half sets at about 90% loads. <b>Limited equipment</b> (More options): today\'s workout with each exercise your gym cannot do swapped for the closest match it can.')}`;
  h+=moreRow(deload,playable,di);
  h+='</section>';
  return h+bwDueCard()+todayRest({playable,di,cs,day,deload});
}
/* Change, on either card: one sheet with every other way to start. */
function changeBtn(di,free){return `<button class="btn sm" data-act="startAltOpen" data-day="${di}"${free?' data-free="1"':''}>Change</button>`;}
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
/* More options on either card (r34.2, from the review: the blank-session
   card had none, so a freestyler could not mark a rest week, a deload, an
   injury, or cardio from Today). */
function moreBtn(deload){return `<button class="btn sm" data-act="heroMore" aria-expanded="${!!ui.heroMore}">${ui.heroMore?'Fewer options':'More options'}</button>${deload&&!ui.heroMore?'<span class="tag blue">Deload week on</span>':''}`;}
function moreRow(deload,playable,di){
  if(!ui.heroMore)return '';
  return `<div class="row" style="margin-top:8px"><button class="btn sm ${deload?'noted':''}" data-act="deloadToggle" aria-pressed="${deload}">${deload?'Deload week: on':'Deload week'}</button>${playable?`<button class="btn sm" data-act="eqOpen" data-day="${di}">Limited equipment</button>`:''}<button class="btn sm ${isRestWeek(weekStart(today()))||isRestWeek(addDays(weekStart(today()),-7))?'noted':''}" data-act="restWkOpen">Rest week</button><button class="btn sm" data-act="injAdd">Flag an injury</button><button class="btn sm" data-act="cardioNew">Log cardio</button></div>`;
}
/* Everything on Today below the Start card, the same for both kinds of card;
   the Workout preview only with a plan's day on the card. */
function todayRest({playable,di,cs,day,deload}){
  let h='';
  /* Nothing logged yet: say where lifts done before this app go, since that
     is how a new lifter's bests and targets start from what they can already
     do (r48, V). History's empty state says the same; Today said nothing. */
  if(noLog()&&!state.draft)h+=`<p class="small muted" id="preApp" style="margin:0 0 10px">Lifted before this app? <button class="linkbtn" data-act="pastOpen">Log a past workout</button> to bring your bests in; targets then start from them.</p>`;
  // Every section below the Start card can be dragged into any order by its
  // ⠿ handle; a new install starts in DEFAULT_ORDER.
  h+=weekCard();
  // Item 62: a section's subtitle states a number, not what the section is about.
  h+=sec({sk:'today:tiles',key:'tiles',title:'At a glance',sub:(()=>{const n=weekStreak().weeks;return noLog()?'Nothing logged yet':`${n}-week streak`;})(),body:homeTiles()});
  const c=coach();
  const startIdx=playable?di:(cs?cs.next:di);
  const toneWord={red:'Act now',yellow:'One change',green:'On track',blue:'Note'}[c.tone]||'Note';
  h+=sec({sk:'today:coach',key:'coach',title:'Coach',sub:`<span class="pill ${c.tone}">${toneWord}</span>`,body:`<p style="margin:0">${esc(c.text)}${c.why?' '+tipi(c.why,'Why'):''}</p>${coachButton(c,startIdx)}`});
  h+=injuryCard();
  h+=bodyMapCard();
  if(playable){
    // Only a stall is worth a word in the title; a PR last time or a load due is good news (r28: "5 flagged" was five green PR tags).
    const flagged=day.items.filter(it=>{const st=IDX().exStats[it.exId];return st&&st.stalled;}).length;
    const letters=ssLetters(day.items);
    let pv='';let fresh=0;
    day.items.forEach((it,k)=>{const ex=EX(it.exId);const sg=suggest(it.exId,it,{deload});
      // The target alone; the full reasoning is a hold or hover away. A lift
      // with no history says so once for the whole day, not on every row.
      // Its trend lives on Stats (r41, V: guidance before a session, not history).
      const none=!sg.last&&!sg.inj&&!sg.target;if(none)fresh++;
      const short=none?'':sg.target?`Today: ${sg.target}`:sg.inj?'Injury flagged: start light, stop on pain.':(sg.last&&String(sg.text).startsWith(sg.last)?String(sg.text).slice(sg.last.length).trim():String(sg.text||''));
      pv+=`<div class="pvi"${k?' style="border-top:1px solid var(--line-soft);padding-top:10px;margin-top:10px"':''}><div class="row spread"><span><b>${esc(ex.name)}</b> <span class="muted small">${it.sets} × ${repSpan(it.repMin,it.repMax,'-')}${ex.timed?'s':''}${ex.perSide?' per side':''}${rirShow(ex)?`, ${effTgt(it.rir)}`:''}</span>${it.ss?` <span class="tag blue">Superset ${letters[it.ss]}</span>`:''}${sg.inj?` <span class="tag red">Injury: ${injLabel(sg.inj)}</span>`:''}</span>${liftTags(it.exId)}</div>${short?`<p class="small muted hastip" style="margin-bottom:0" data-tip="${esc(sg.text)}">${esc(short)}</p>`:''}</div>`;});
    if(fresh)pv=`<p class="small muted" style="margin:0 0 10px">${fresh===day.items.length?'First time':`${fresh} new`}: start lighter than you think and stop while the reps still move well. Warm up on the first big lift. ${tipi('No history yet, so there is no target. Pick a load you think you could lift for the top of the rep range plus the reps in reserve shown, erring light, and stop when the reps start to slow. On a barbell or other big lift, do 1 or 2 lighter sets of 5 first. From the next session the app works the load out, catching up quickly over the first few.','About first sessions')}</p>`+pv;
    h+=sec({sk:'today:session',key:'session',title:'Workout preview',sub:flagged?`<span class="pill yellow">${flagged} stalled</span>`:`${day.items.length} exercises`,body:pv});
  }
  h+=bodyCard()+moreLine('today');
  return h;
}
/* Signed out: one slim line on Today, because a log that lives only on the
   phone is the biggest risk to it. It comes before the Install line in a
   browser (item 55). "Not now" hides it on this device until an account is
   used. Never shown inside Claude, during a first run (the welcome card
   offers it there), or before the sign-in check. */
function acctBar(){
  if(!AUTH()||window.claude||!acct.checked||acct.user||cloud.on||!state.settings.onboarded)return '';
  try{if(localStorage.getItem(ACCT_LATER))return '';}catch(e){/* storage blocked: show it */}
  /* Someone who just chose Continue without an account is not asked again
     on the next screen (r32, from the third review: two bars and a toast on
     the first Today). The line comes back once a session is saved. */
  try{if(localStorage.getItem(OB_ACCT)==='later'&&!state.sessions.some(x=>!x.demo))return '';}catch(e){/* show it */}
  return `<div class="acctbar" id="acctBar"><span class="small"><b>Only on this phone.</b><span class="ab-more"> Sync it with an account.</span></span><button class="btn sm primary" data-act="acctOpen" data-mode="signup">Set up sync</button><button class="ib" aria-label="Not now" data-act="acctLater">✕</button></div>`;
}
/* ---------- install (the installable build opened in a browser) ----------
   Android and desktop Chrome offer a real install: the build catches that
   offer and Install uses it. An iPhone has no install button for websites
   (Apple allows only Share > Add to Home Screen), so there Install opens a
   short picture guide for the browser in use. Nothing shows once installed,
   inside Claude, or in the plain source file. */
const INSTALL_LATER=KEY+'.installLater';
/* Where this copy of the app lives, for the install pictures and steps, so
   they stay right when the app moves to its own domain (r27). */
function siteHost(){return location.host&&/^https?:$/.test(location.protocol)?location.host:SITE_HOST;}
function siteDir(){const p=location.pathname.replace(/[^/]*$/,'').replace(/\/$/,'');return /^https?:$/.test(location.protocol)?p:SITE_DIR_FALLBACK;}
window.ironlogInstallReady=()=>{if(ui.tab==='today'||ui.tab==='settings')rerenderKeepScroll();};
/* The new icon (r25). iPhone keeps a home-screen icon exactly as it was when
   added and never refreshes it, so an app installed before r25 shows the old
   barbell until it is removed and added again, and removing it also removes
   the log kept on the phone. So an existing iPhone install is told once, with
   the safe order of steps; a new install already has the new icon, and
   Android refreshes it by itself. */
const ICON_NOTE=KEY+'.icon25';
function iconNoteDue(){
  try{if(localStorage.getItem(ICON_NOTE))return false;}catch(e){return false;}
  const ios=/^ios/.test(installKind());
  if(!device.hadLog||!isStandalone()||!ios){try{localStorage.setItem(ICON_NOTE,'1');}catch(e){/* shown again next time: harmless */}return false;}
  return true;
}
function iconBar(){
  if(!window.IRONLOG_APP||!iconNoteDue())return '';
  return `<div class="acctbar" id="iconBar"><span class="small"><b>New app icon.</b><span class="ab-more"> Your home screen keeps the old one until ${APP_NAME} is added again.</span></span><button class="btn sm" data-act="iconHow">How</button><button class="ib" aria-label="Not now" data-act="iconLater">✕</button></div>`;
}
function iconSheet(){
  const safe=!!acct.user&&cloud.on;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="icH"><div class="sheet-h"><h3 id="icH">Get the new icon</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
  ${safe?'<p class="small" style="margin:0 0 10px">Your log is in your account, so nothing is lost.</p>'
    :`<p class="small callout yellow" style="margin:0 0 10px"><b>Removing ${APP_NAME} from the home screen also removes the log on this phone.</b> Sign in first so it is kept in your account, or save a backup.</p><div class="row" style="margin-bottom:10px">${AUTH()?'<button class="btn sm primary" data-act="acctOpen" data-mode="signin">Sign in</button>':''}<button class="btn sm" data-act="export">Save a backup</button></div>`}
  <ol class="steps"><li>Press and hold ${APP_NAME} on your home screen and remove it.</li><li>Open ${esc(location.host+location.pathname.replace(/index\.html$/,''))} in Safari, tap Share, then Add to Home Screen.</li><li>Open the new icon${safe?' and sign in':''}.</li></ol>
  <button class="btn block" style="margin-top:12px" data-act="iconLater">Done</button></div>`;
}
function installBar(){
  if(!canInstallHere())return '';
  try{if(localStorage.getItem(INSTALL_LATER))return '';}catch(e){/* storage blocked: show it */}
  // An iPhone has no install, only Add to Home Screen, so the button says that (item 56).
  const ios=/^ios/.test(installKind());
  return `<div class="acctbar" id="installBar"><span class="small"><b>Get the app.</b>${ios?'':`<span class="ab-more"> Install ${APP_NAME} on your home screen.</span>`}</span><button class="btn sm primary" data-act="install">${ios?'Add to Home Screen':'Install'}</button><button class="ib" aria-label="Not now" data-act="installLater">✕</button></div>`;
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
/* First run (r22). A new install opens on its own pages instead of Today:
   first the account (Create account, I have an account, Not now), then an
   optional name and the units above the ways to start. Nothing is required:
   Not now and the start choices skip everything. The account comes first
   because a log kept only on one phone is the biggest risk to it, and signing
   in is also how an existing log arrives on a new phone. Any session, demo
   data or a session in progress ends it, and so does a sign-in that brings a
   log with it. Whether the account page was passed is kept per device. */
const OB_ACCT=KEY+'.obAcct';
/* Signing out goes back to the first page (r33, V: "sign out should go to
   the main page"), with or without a copy of the log kept on the phone.
   Continue without an account then opens that copy, and signing in brings
   the account's log. Kept per device; a sign-in clears it. */
const OB_OUT=KEY+'.signedOut';
/* The flag is cleared by a sign-in the lifter makes here (obOutClear), not
   by any signed-in moment: a confirmation link opened in this browser signs
   it in only until it is told where Ironlog is used (review of r33). A
   session in progress always shows, signed out or not (review: signing out
   mid-session with a copy kept hid the tabs around it). */
function obGate(){
  if(!AUTH()||window.claude||acct.user)return false;
  try{return localStorage.getItem(OB_OUT)==='1';}catch(e){return false;}
}
function obOutClear(){try{localStorage.removeItem(OB_OUT);}catch(e){/* per device only */}}
function obActive(){return !state.draft&&(obGate()||(!state.settings.onboarded&&!state.sessions.length));}
function obAcctOffered(){
  if(!AUTH()||window.claude||acct.user)return false;
  try{return localStorage.getItem(OB_ACCT)!=='later';}catch(e){return true;}
}
/* The first page's tour (r33, V: the tiles read as an About box; make it
   informational and swipeable: logging each session, the plan, progress,
   history, and the picture by muscle). Each slide shows a small piece of
   the screen it describes, with sample numbers in the unit chosen. */
const obTour={i:0,auto:null,user:false,t:null};
function obTourSlides(){
  /* Five slides naming what the app does for a lifter (r34, V: say the
     promises plainly, no line under each title): logging, the next weights
     worked out (progressive overload), the next sets adjusting as you lift,
     a plan or freestyle, and progress. Sample numbers in the unit chosen,
     following the app's own rules: 65 for 10, 10 and 10 at the top of 8 to 10
     means 70 next; a first set with 4 in reserve moves the next ones up. */
  const kg=U()==='kg';const u=U();const w=kg?[30,32.5,35]:[65,70,75];
  const f=v=>fmtW(fromD(v));
  const log=`<div class="obv" aria-hidden="true"><div class="row spread"><b>Incline DB Press</b><span class="mu">Last ${f(w[0])} × 10, 10, 10</span></div>
    <div class="obv-row"><b class="mu">1</b><span>${f(w[1])}</span><span>10</span><i class="on"></i></div>
    <div class="obv-row"><b class="mu">2</b><span>${f(w[1])}</span><span>9</span><i class="on"></i></div>
    <div class="obv-row"><b class="mu">3</b><span class="g fill">${f(w[1])}</span><span class="g fill">9</span><i class="on tick"></i></div></div>`;
  const next=`<div class="obv" aria-hidden="true"><b>Incline DB Press</b>
    <div class="obv-next"><span class="mu">Last</span><b>${f(w[0])} ${u}</b><span class="mu">10, 10, 10</span></div>
    <div class="obv-next now"><span>Next</span><b>${f(w[1])} ${u}</b><span>8 or more</span></div></div>`;
  const adjust=`<div class="obv" aria-hidden="true"><b>Incline DB Press</b>
    <div class="obv-row"><b class="mu">1</b><span>${f(w[1])}</span><span>13</span><i class="on"></i></div>
    <div class="obv-adj">Next sets: ${f(w[2])} ${u}, up</div>
    <div class="obv-row"><b class="mu">2</b><span class="g">${f(w[2])}</span><span class="g">10</span><i></i></div></div>`;
  const days=[['M',1],['T',1],['W',0],['T',1],['F',1],['S',0],['S',0]];
  const plan=`<div class="obv" aria-hidden="true"><div class="obv-week">${days.map(([d,t])=>`<div class="${t?'t':''}"><b></b>${d}</div>`).join('')}</div>
    <div class="obv-plan"><div><b>Bench Press</b><span class="mu">3 × 6-10</span></div><div><b>Chest-Supported Row</b><span class="mu">3 × 8-12</span></div><div class="free"><b>Freestyle</b><span class="mu">add as you go</span></div></div></div>`;
  const ys=[70,64,66,57,54,48,43,34,31,22];const pts=ys.map((y,i)=>[8+i*30,y]);
  const e1=kg?[102,110]:[225,242];
  const prog=`<div class="obv" aria-hidden="true"><b>Bench Press</b> <span class="mu">est. 1RM ${e1[0]} to ${e1[1]} ${u}</span><span class="obv-chip">PR</span>
    <svg viewBox="0 0 290 80" style="margin-top:6px">${[24,48,72].map(y=>`<line class="gl" x1="0" x2="290" y1="${y}" y2="${y}"/>`).join('')}
    <polyline class="ln" points="${pts.map(p=>p.join(',')).join(' ')}"/>${pts.slice(0,-1).map(([x,y])=>`<circle class="pt" cx="${x}" cy="${y}" r="3.2"/>`).join('')}<circle class="pr" cx="${pts[9][0]}" cy="${pts[9][1]}" r="5.5"/></svg></div>`;
  return [[log,'Log a set in one tap'],[next,'Next weights, worked out'],[adjust,'Adjusts as you lift'],[plan,'Your plan, or freestyle'],[prog,'See every lift progress']];
}
function obTourHTML(){
  const sl=obTourSlides();const n=sl.length;const i=Math.min(obTour.i,n-1);
  return `<section class="ob-tour" aria-roledescription="carousel" aria-label="What ${APP_NAME} does">
  <div class="ob-track" id="obTrack">${sl.map(([v,t],k)=>`<article class="ob-slide${k===i?' on':''}" role="group" aria-roledescription="slide" aria-label="${k+1} of ${n}: ${esc(t)}" data-i="${k}">${v}<h2>${esc(t)}</h2></article>`).join('')}</div>
  <div class="ob-pips" role="group" aria-label="Slides">${sl.map(([,t],k)=>`<button type="button" data-act="obTourPick" data-i="${k}" aria-label="Show ${esc(t)}"${k===i?' aria-current="true"':''}></button>`).join('')}</div></section>`;
}
function obTourStop(){clearInterval(obTour.auto);obTour.auto=null;}
function obTourSet(i){
  const tr=document.getElementById('obTrack');if(!tr)return;obTour.i=i;
  tr.querySelectorAll('.ob-slide').forEach(el=>el.classList.toggle('on',+el.dataset.i===i));
  document.querySelectorAll('.ob-pips button').forEach(b=>{if(+b.dataset.i===i)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');});
}
function obTourGo(i,smooth){
  const tr=document.getElementById('obTrack');if(!tr)return;const el=tr.children[i];if(!el)return;
  tr.scrollTo({left:el.offsetLeft-tr.firstElementChild.offsetLeft,behavior:smooth?'smooth':'auto'});obTourSet(i);
}
function mountObTour(){
  obTourStop();const tr=document.getElementById('obTrack');if(!tr)return;
  if(obTour.i)obTourGo(obTour.i,false);
  tr.addEventListener('scroll',()=>{clearTimeout(obTour.t);obTour.t=setTimeout(()=>{
    const kids=[...tr.children];const x=tr.scrollLeft;let best=0;
    kids.forEach((el,k)=>{if(Math.abs(el.offsetLeft-kids[0].offsetLeft-x)<Math.abs(kids[best].offsetLeft-kids[0].offsetLeft-x))best=k;});
    if(best!==obTour.i)obTourSet(best);},90);},{passive:true});
  // Any touch, key or focus inside stops it moving on its own, for good.
  const mine=()=>{obTour.user=true;obTourStop();};
  for(const ev of ['pointerdown','touchstart','keydown','focusin','wheel'])tr.parentNode.addEventListener(ev,mine,{passive:true});
  let reduce=false;try{reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){/* animate */}
  // Test browsers run it only when asked, so screenshots and suites stay still.
  if(reduce||obTour.user||(navigator.webdriver&&!window.IRONLOG_TOUR_AUTO))return;
  // Every 4 seconds (r37, V): a slide is a title and a small picture, read in about 2; at 5.5 a pass took 22 seconds.
  obTour.auto=setInterval(()=>{
    if(!document.getElementById('obTrack')){obTourStop();return;}
    if(document.hidden)return;
    // One pass through, then it stays on the last slide (r34, V: less moving while reading the page).
    const n=document.getElementById('obTrack').children.length;if(obTour.i>=n-1){obTour.user=true;obTourStop();return;}obTourGo(obTour.i+1,true);},4000);
}
function obView(){
  // Still finding out whether this device is signed in, or pulling its log: show nothing that could flash away.
  if(!cloudChecked||(AUTH()&&!window.claude&&!acct.checked)||(cloud.on&&!cloud.lastPull))return `<div class="ob"><div class="ob-splash"><p class="ob-logo">${LOCKUP}</p></div></div>`;
  const acctStep=!!AUTH()&&!window.claude;
  /* The first page (r31.2, V): what the app does, in three lines, before
     anything is asked; then the account, said to be optional and what it is
     for, and Continue without an account as a plain, clearly worded link. A page that opened on an account
     request alone lost a friend at the first screen. */
  if(obAcctOffered())return `<div class="ob" id="obPage" data-step="acct">
  <div class="ob-top"><h1 class="ob-logo">${LOCKUP}</h1></div>
  ${obTourHTML()}
  <div class="ob-card"><h2>Save your log</h2>
  <p class="ob-why">Back up your log and use it on any device</p>
  <button class="btn primary block" data-act="acctOpen" data-mode="signup">Create account</button>
  <button class="btn block" data-act="acctOpen" data-mode="signin">I have an account</button></div>
  ${ENV==='preview'?'<button class="btn block" data-act="previewCopy">Copy my log in</button>':''}
  <button class="linkbtn ob-later" data-act="obAcctLater">Continue without an account</button>${undoStack.length?'<button class="linkbtn ob-skip" data-act="undo">Undo last delete or reset</button>':''}</div>`; // after Erase everything these pages are all there is, so its Undo is here too (r55, the audit)
  const imp=`<button class="ob-opt" data-act="impOpen"><b>Import my workouts</b><span>Notes, a spreadsheet, another app, a backup</span></button>`;
  return `<div class="ob welcome" id="obPage" data-step="start">
  ${acctStep&&!acct.user?'<button class="linkbtn ob-back" data-act="obAcctBack">‹ Account</button>':''}
  <p class="ob-logo sm">${LOCKUP}</p>
  <h2 class="ob-h">Set up</h2>
  <label class="field">Name <span class="muted">(optional)</span><input type="text" data-bind="userName" maxlength="40" autocomplete="given-name" value="${esc(state.settings.userName||'')}"></label>
  <div><p class="small muted" style="margin:0 0 6px;font-weight:600">Units</p><div class="ob-units" role="group" aria-label="Units">${[['lb','lb and inches'],['kg','kg and cm']].map(([k,l])=>`<button class="chip ${U()===k?'on':''}" data-act="obUnit" data-v="${k}" aria-pressed="${U()===k}">${l}</button>`).join('')}</div></div>
  <label class="field">Bodyweight <span class="muted">(optional)</span><input type="text" inputmode="decimal" id="obBw" value="${(()=>{const b=state.bodyweights.find(x=>x.date===today());return b?fmtW(b.kg):'';})()}" placeholder="${U()}, for pull-ups, dips, and push-ups" enterkeyhint="done"></label>
  <h3 style="font:700 20px var(--display);margin:6px 0 0">How do you want to start?</h3>
  <div class="ob-opts">
  <button class="ob-opt primary" data-act="obSample"><b>Pick a ready-made routine</b><span>${tplCountLine()}</span></button>
  <button class="ob-opt" data-act="obFree"><b>Log a workout now</b><span>Add exercises as you go</span></button>
  <button class="ob-opt" data-act="obOwn"><b>Build my own routine</b><span>Your days, your exercises</span></button>
  ${imp}${ENV==='preview'?'<button class="ob-opt" data-act="previewCopy"><b>Copy my log in</b><span>Try this test version on your own log</span></button>':''}</div>
  <button class="linkbtn ob-skip" data-act="demoLoad">Look around with sample data first</button>${undoStack.length?'<button class="linkbtn ob-skip" data-act="undo">Undo last delete or reset</button>':''}
  <p class="small muted" id="obSafety" style="margin:10px 0 0;text-align:center"><span class="hastip" data-tip="${esc(SAFETY_TXT)}">Suggestions are estimates, not advice.</span></p></div>`;
}
/* First run with no sessions: three ways in. Shown only after the cloud check,
   so a device about to load your data never flashes it. */
function welcomeCard(){
  if(state.settings.onboarded||!cloudChecked||state.draft||state.sessions.some(s=>!s.demo))return '';
  /* Demo data loaded before choosing how to start: a short note instead of
     the setup pages, and one tap back to them. The setup itself is obView. */
  if(state.sessions.some(s=>s.demo))return `<div class="card welcome" id="demoNote"><p class="small" style="margin:0 0 8px"><b>You are looking at demo data.</b> 8 weeks of generated sessions to look around; none of it is yours.</p><button class="btn sm primary" data-act="demoStart">Clear demo and set up</button></div>`;
  return '';
}
/* Injuries: one line per flagged muscle. Exercises that load it are marked in
   every session, their progression target is paused, and the muscle is left
   out of "below target" reads until the flag is cleared. */
/* "~82 min", flagged when it runs past the lifting budget in Settings. */
function minTxt(m){const b=state.settings.timeBudget;const r=min5(m);return b&&m>b?`<span class="overb">${estMin(r)}, over your ${b} min budget</span>`:estMin(r);}
function injuryCard(){
  const inj=state.injuries||[];if(!inj.length)return '';
  return sec({sk:'today:injuries',key:'injuries',title:'Injuries',sub:`<span class="pill red">${inj.length} flagged</span>`,body:`<ul class="inj-list" style="list-style:none;margin:0;padding:0">${inj.map(x=>`<li><span><b>${injLabel(x.m)}</b> <span class="muted small">since ${fmtDate(x.date)}${x.note?' · '+esc(x.note):''}</span></span><button class="btn sm" data-act="injClear" data-id="${x.id}">Cleared</button></li>`).join('')}</ul>
  <p class="small muted hastip" style="margin:8px 0 0" data-tip="Exercises that load these are marked in each session, their targets are paused, and the muscle is left out of below-target advice. Tap Cleared when it has settled.">What a flag does</p>`});
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
function coachButton(c,di){
  if(!c.act)return '';
  if(c.act.deload)return `<button class="btn sm" style="margin-top:8px" data-act="deloadToggle">${esc(c.act.label)}</button>`;
  if(c.act.light)return `<button class="btn sm" style="margin-top:8px" data-act="startSession" data-day="${di}" data-light="1">${esc(c.act.label)}</button>`;
  return `<button class="btn sm" style="margin-top:8px" data-act="goDash" data-sec="${c.act.sec}"${c.act.m?` data-m="${c.act.m}"`:''}${c.act.ex?` data-ex="${c.act.ex}"`:''}>${esc(c.act.label)}</button>`;
}
function homeTiles(){
  const sk=weekStreak();const pr=recent4w().prs;
  const last=pr[0];const ago=last?daysBetween(last.date,today()):null;
  return `<div class="tiles">
  <button class="tile" data-act="goDash" data-sec="consistency" aria-label="${noLog()?'No streak yet':sk.weeks+' week streak'}. Open consistency"><div class="tv">${nz(sk.weeks)}</div><div class="tl">week streak</div><div class="ts">${freeMode()?'Weeks trained in a row':sk.thisWeek>=sk.need?'This week done':`Weeks with ${sk.need}+ sessions`}${sk.best>sk.weeks?` · best ${sk.best}`:''}</div></button>
  <button class="tile" data-act="goDash" data-sec="bests" aria-label="${noLog()?'No PRs yet':pr.length+' PRs in the last 4 weeks'}. Open all-time bests"><div class="tv">${nz(pr.length)}</div><div class="tl">PRs, last 4 weeks</div><div class="ts">${last?`Latest: ${esc(exName(last.exId))}, ${ago===0?'today':ago===1?'yesterday':ago+' days ago'}`:'None yet'}</div></button>
  </div>`;
}
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
