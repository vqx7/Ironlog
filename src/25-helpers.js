/* ---------- actions ---------- */
/* Clears what earlier builds put there. Runs once at start, after every
   definition it reads exists. */
function trashTidy(){const tr=state.trash||[];const keep=tr.filter(t=>!(t.kind==='routine'&&plainTemplate(t.data)));if(keep.length!==tr.length){state.trash=keep;commit();}}
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
    rows.push([c.date,'Cardio','no',CARDIOL[c.kind],'',1,'no','no','no','','','','','','',[CWHENL[c.when],c.dist?`${distShow(c.dist)} ${distU()}`:'',c.note].filter(Boolean).join('; '),'',c.min,c.hr==null?'':c.hr,'minutes','']); // its minutes under session_minutes, as the header says (r55; r54 wrote them a column early)
  if(rows.length===1){toast('No sessions to export');return;}
  const data=rows.map(r=>r.map(q).join(',')).join('\r\n');
  return exportFile(data,`${FILE_PREFIX}-sets-${today()}.csv`,'text/csv','CSV saved',null,
    'CSV text','Copy all of this and paste it into a spreadsheet. This is not a backup.');
}
