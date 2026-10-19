/* ---------- actions ---------- */
function routineClutter(){
  const used=new Set(state.sessions.map(x=>x.routineId));const seen=new Set();const out=[];
  for(const r of state.routines){
    const sig=routineSig(r);const dup=seen.has(sig);seen.add(sig);
    if(r.id===state.activeRoutineId||used.has(r.id))continue;
    if(routineEmpty(r)||dup)out.push(r);
  }
  return out;
}
const nameTaken=(nm,exceptId)=>state.routines.some(r=>r.id!==exceptId&&r.name.trim().toLowerCase()===nm.trim().toLowerCase());
function curRoutineB(){return state.routines.find(r=>r.id===ui.bRoutine)||activeRoutine();}
function findItem(uidv){for(const r of state.routines)for(let di=0;di<r.days.length;di++){const i=r.days[di].items.findIndex(x=>x.uid===uidv);if(i>=0)return {r,di,i,it:r.days[di].items[i]};}return null;}
function newItem(exId){return {uid:uid(),exId,...defPlan(exId)};}
/* Null when the row is gone. Rebuilding the view removes a still-focused reps
   field, and the browser then fires its pending change for a set that − Set,
   Swap or Undo has just removed. */
function draftSet(t){const b=state.draft&&state.draft.ex[+t.dataset.b];return b&&b.sets[+t.dataset.s]||null;}
/* A ready-made routine removed exactly as shipped can be added again from
   New from a template, so it is not kept in Recently deleted (r34.1, V: the
   same templates sat there for every new user with no way to clear them). */
function tplSigs(){if(!tplSigs.c)tplSigs.c=new Set([...TEMPLATES.map(t=>routineFromTemplate(t.key)),starterRoutine(),defaultRoutine()].filter(Boolean).map(routineSig));return tplSigs.c;}
function plainTemplate(r){try{return !!r&&tplSigs().has(routineSig(r));}catch(e){return false;}}
/* Clears what earlier builds put there. Runs once at start, after every
   definition it reads exists. */
function trashTidy(){const tr=state.trash||[];const keep=tr.filter(t=>!(t.kind==='routine'&&plainTemplate(t.data)));if(keep.length!==tr.length){state.trash=keep;commit();}}
function toTrash(kind,data){
  if(kind==='routine'&&plainTemplate(data))return;
  state.trash=[{id:data.id,kind,date:today(),data:JSON.parse(JSON.stringify(data))},...(state.trash||[]).filter(t=>!(t.id===data.id&&t.kind===kind))].slice(0,TRASH_MAX);
  while(state.trash.length>1&&JSON.stringify(state.trash).length>TRASH_BYTES)state.trash.pop();
}
/* Running as an installed app (home screen), not in a browser tab or inside Claude. */
function isStandalone(){try{return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}catch(e){return false;}}
function markExported(){state.settings.lastExport=today();saveNow();}
/* Everything in this app lives in one browser, so "did the backup actually
   land" is the single question that matters. The downloads capability confirms
   the save, so that path marks the export itself. The anchor fallback confirms
   nothing: it can be blocked silently by a sandboxed frame, and the old code
   still cleared the "Backup due" nag. So that path asks. */
async function exportFile(data,filename,mime,okMsg,onSaved,fallbackTitle,fallbackHelp){
  try{
    if(window.claude&&typeof window.claude.use==='function'){
      const dl=await window.claude.use('downloads');
      if(dl){try{await dl.save({filename,data});onSaved&&onSaved();toast(okMsg);return;}catch(e){if(e&&e.code==='declined'){toast('Save cancelled');return;}log('export',e);}}
    }
  }catch(e){log('export',e);}
  /* The installed app on a phone: the share sheet is how a file reaches Files
     or iCloud Drive (a download link inside a home-screen app on iOS opens a
     preview with nowhere to save). A completed share is taken as saved. */
  try{
    const file=typeof File==='function'?new File([data],filename,{type:mime}):null;
    if(file&&isStandalone()&&navigator.canShare&&navigator.canShare({files:[file]})){
      try{await navigator.share({files:[file],title:filename});onSaved&&onSaved();toast(okMsg);return;}
      catch(e){if(e&&e.name==='AbortError'){toast('Save cancelled');return;}log('export',e);}
    }
  }catch(e){log('export',e);}
  let clicked=false;
  try{
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:mime}));a.download=filename;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
    clicked=true;
  }catch(e){log('export',e);}
  if(!clicked){openModal({kind:'text',title:fallbackTitle,help:fallbackHelp,text:data,readonly:true});return;}
  confirmBox('Did the file download?',
    `Look for ${filename}. If nothing appeared, this browser blocked the download and you should copy the text instead.`,
    'Yes, I have the file',()=>{onSaved&&onSaved();toast('Backup recorded');},false,
    {label:'Show the text instead',fn:()=>openModal({kind:'text',title:fallbackTitle,help:fallbackHelp,text:data,readonly:true})});
}
function exportBackup(){
  const data=JSON.stringify({app:STORAGE_ID,version:APP_VERSION,exported:new Date().toISOString(),state},null,1);
  return exportFile(data,`${FILE_PREFIX}-backup-${today()}.json`,'application/json','Backup saved',markExported,
    'Backup text','Copy all of this and keep it somewhere safe. Paste it into Import on any device to restore.');
}
/* One row per set, in display units, for anyone who wants this in a spreadsheet.
   This is not a backup: it cannot be imported, and it carries no routines or
   settings. The JSON export remains the thing that restores the app. */
function exportCSV(){
  const q=v=>{const s=String(v==null?'':v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const rows=[['date','day','deload','exercise','primary','set','warmup','dropset','per_side','load_entry',`load_${U()}`,`total_load_${U()}`,'reps','rir',`e1rm_${U()}`,'exercise_note','session_note','session_minutes','avg_hr','unit','calibration']];
  for(const ss of sortedSessions()){
    for(const b of ss.ex){
      const ex=EX(b.exId);
      b.sets.forEach((s,i)=>{
        const total=loadOf(ex,s,ss.date);const est=s.warm||s.drop||noE1(ex)?null:e1(total,+s.r,rirEst(s,ex));
        rows.push([ss.date,ss.dayName,ss.deload?'yes':'no',ex.name,ML[ex.primary]||ex.primary,i+1,s.warm?'yes':'no',s.drop?'yes':'no',ex.perSide?'yes':'no',loadWords(ex),
          fmtW(+s.w||0),fmtW(total),s.r,(s.rir==null||s.rir==='')?'':s.rir,est==null?'':fmtW(est),b.note||'',ss.notes||'',ss.durMin||'','',ex.timed?'seconds':'reps',s.cal?`stop at ${s.cal.at}, called ${s.cal.pred} left`:'']);
      });
    }
  }
  for(const c of [...state.cardio].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0))
    rows.push([c.date,'Cardio','no',CARDIOL[c.kind],'',1,'no','no','no','','','','','','',[CWHENL[c.when],c.dist?`${distShow(c.dist)} ${distU()}`:'',c.note].filter(Boolean).join('; '),c.min,c.hr==null?'':c.hr,'minutes','']);
  if(rows.length===1){toast('No sessions to export');return;}
  const data=rows.map(r=>r.map(q).join(',')).join('\r\n');
  return exportFile(data,`${FILE_PREFIX}-sets-${today()}.csv`,'text/csv','CSV saved',null,
    'CSV text','Copy all of this and paste it into a spreadsheet. This is not a backup.');
}
