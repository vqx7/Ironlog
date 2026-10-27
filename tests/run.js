// Runs every suite from the repo root and fails if any suite does not pass.
// Since r44 suites run side by side (V: "more efficient across the board"):
// a full run took about 25 minutes one after another.
//   node tests/run.js                every suite, on this machine's cores (at most 4)
//   node tests/run.js --jobs 1       one at a time, as before r44
//   node tests/run.js --shard 2/4    the second quarter only (the GitHub workflow runs four at once)
//   IRONLOG_JOBS=2 npm test          the same as --jobs 2
//   node tests/run.js --browser webkit   the same suites in WebKit, the engine of every iPhone browser
const {execFile,execFileSync}=require('child_process');const fs=require('fs');const os=require('os');const path=require('path');
fs.mkdirSync('screenshots',{recursive:true});
const suites=['unit-math','unit-analytics','dataflow','migration','acceptance','flows','charts-layout','cycle-create','fuzz','integrity','gym-ux','design','uat','essentials','comeback-removed','map3d','cleanup','ios-bar','pwa','update','accounts','install','r21','r22','r23','r24','r25','preview','owner-doc','sql','journey','progress','breach','custom','r27','r28','r29','r29b','r29c','r30','r31','r32','r32b','r33','r34','r34b','r35','r36','r38','r39','r40','r41','realism','r42','r43','r44','r45','r46','r47','r49','r52','r53','r53w','r54','r54b','r55','r55b','r55-1','r55-1b','lifter','engine','bests','coherence','seams','r56','r56-1','r56-1b','r56-1c','r56-2','mixed','wayback','inflight','personas','loadrules','room','r57','r58','r59','r60','r61','r62','r63','security','hygiene','perf'];
// The standalone build (dist/) runs the user-facing suites again.
// map3d is not among them: a file:// page cannot import a module, and pwa checks the 3D body in dist/ over http.
// r39 is not either, for the same reason: most of it is the 3D body in a sheet.
// r22 is not repeated on dist/: its first-run part checks the source file's no-account path, and the accounts suite covers the build's.
const distSuites=['dataflow','acceptance','flows','gym-ux','design','uat','essentials','comeback-removed','r21','r24','r25','journey','progress','custom','r29c','r30','r31','r32','r32b','r33','r34','r34b','r35','r38','r40','r41','r42','r43','r44','r46','r49','coherence','security','lifter','r55-1','r56-2','r56-1','r57','r58','r59','r60'];
/* Suites that lean on real time (rest timers, toasts, short waits, the clock)
   run one at a time after the others, so a busy machine cannot make them
   flaky (the r44 review). No retries: a retry would hide a real flake.
   The engine suite runs alone too (r59): it spreads its own batches over
   every core, so beside another suite on a two-core machine it reached its
   15 minutes (838 s alone on one core for its batches, 548 s on both); on
   GitHub each shard runs one suite at a time already (--jobs 1). */
const SERIAL=new Set(['gym-ux','r25','r33','update','journey','realism','r21','integrity','engine']);
/* WebKit (2026-10-14): every browser on an iPhone is WebKit, Safari and the
   home-screen app included, and until then nothing ran there. --browser webkit
   runs the same suites and the same standalone-build reruns in WebKit
   (tests/h.js picks the engine from IRONLOG_BROWSER). A suite left out says
   why here; none is left out to hide a failure. */
const WEBKIT_SKIP={
  hygiene:'reads the repo, no browser',
  'owner-doc':'reads the docs, no browser',
  sql:'runs the SQL in PGlite, no browser',
  perf:'times the app, and one engine\'s milliseconds on a shared runner say nothing about another\'s',
  engine:'runs the engine in Node against Chromium\'s answers; tests/r52.js and tests/r53w.js compare the builds in WebKit',
};

const arg=k=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:null;};
const browserName=arg('--browser')||'chromium';
if(!['chromium','webkit'].includes(browserName)){console.error('--browser is chromium or webkit');process.exit(2);}
const wk=browserName==='webkit';
const jobs=Math.max(1,+(arg('--jobs')||process.env.IRONLOG_JOBS||Math.min(4,os.cpus().length))||1);
const shard=(arg('--shard')||'1/1').split('/').map(Number);
if(!(shard[1]>=1&&shard[0]>=1&&shard[0]<=shard[1])){console.error('--shard is i/n, as in 2/4');process.exit(2);}

// Every run in order: the source file first, then the standalone build.
const all=wk
  ?[...suites.filter(s=>!WEBKIT_SKIP[s]).map(s=>({s,tag:' (WebKit)',env:{IRONLOG_BROWSER:'webkit'}})),...distSuites.filter(s=>!WEBKIT_SKIP[s]).map(s=>({s,tag:' (standalone build in WebKit)',env:{IRONLOG_BROWSER:'webkit',IRONLOG_FILE:'dist/index.html'}}))]
  :[...suites.map(s=>({s,tag:'',env:{}})),...distSuites.map(s=>({s,tag:' (standalone build)',env:{IRONLOG_FILE:'dist/index.html'}}))];
// A shard takes every n-th run, so the long suites spread across shards.
const mine=all.filter((_,i)=>i%shard[1]===shard[0]-1);

/* Both builds once, before anything runs: scripts/build.js starts by
   deleting dist/, so a suite rebuilding it would pull it from under another.
   Suites build for themselves only when run alone (tests/h.js build()). */
const t0=Date.now();
execFileSync('node',[path.join('scripts','build.js')],{stdio:'inherit'});
execFileSync('node',[path.join('scripts','build.js'),'--preview'],{stdio:'inherit'});

let bad=0;const failed=[];
/* On GitHub each suite's start and end are also written to
   screenshots/times.txt, which the workflow keeps even from a job stopped
   at its limit (r61's WebKit shards, 2026-10-26: two passed the hour and
   the log, behind a sign-in, was all that could say where; the install had
   taken it, publish.yml). */
const timesLog=l=>{if(!process.env.GITHUB_ACTIONS)return;try{fs.mkdirSync('screenshots',{recursive:true});fs.appendFileSync(path.join('screenshots','times.txt'),`${new Date().toISOString()} ${l}\n`);}catch(e){/* a log of times only; the run goes on without it */}};
function runOne(x){
  timesLog(`start ${x.s}${x.tag}`);
  return new Promise(done=>{const t=Date.now();
    // 15 minutes a suite, and a suite stopped for time or by a signal says so.
    // Since r43 a stopped suite also names the last check it passed: r33
    // stopped on GitHub twice and nowhere else, and the annotation, the only
    // part of the log readable without a sign-in, could not say where.
    execFile('node',[`tests/${x.s}.js`],{encoding:'utf8',timeout:900000,maxBuffer:64<<20,env:{...process.env,...x.env,IRONLOG_BUILT:'1'}},(e,stdout,stderr)=>{
      let out=(stdout||'')+(stderr||'');
      /* Playwright catches SIGTERM and exits with a code of its own, so a
         suite stopped for time has killed set and no signal (r33 on
         2026-10-14: stopped at 15 minutes and said nothing). */
      if(e&&e.killed&&Date.now()-t>=899000){const last=out.trim().split('\n').filter(l=>/^ok /.test(l)).slice(-1)[0]||'(no check passed)';out+=`\nFAIL stopped after 15 minutes; the last check that passed: ${last.replace(/^ok +/,'').slice(0,200)}`;}
      else if(e&&(e.signal||e.killed))out+=`\nFAIL stopped by ${e.signal||'the runner'}`;
      timesLog(`end ${x.s}${x.tag} ${Math.round((Date.now()-t)/1000)} s`);
      done({...x,out,sec:Math.round((Date.now()-t)/1000)});});});
}
// Results print in suite order whatever order they finish in, so a log reads the same every run.
function report(r){
  const pass=/ALL PASS|fuzz clean/.test(r.out)&&!/^FAIL/m.test(r.out);
  console.log(`${pass?'PASS':'FAIL'}  ${r.s}${r.tag}  ${r.sec}s`);
  /* A note is something that went wrong outside the checks, such as a
     teardown step tests/h.js settle let go of. It does not fail the suite,
     so on GitHub it is written as a notice, which the API serves; else a
     stall that comes back would pass unseen. */
  const notes=r.out.split('\n').filter(l=>/^note /.test(l));
  /* A suite that runs four minutes or more is named with its time, readable
     through the API as the notes are: a shard past its hour said nothing
     of what took it there (r61's first run, 2026-10-26; the install). */
  if(r.sec>=240)notes.push(`note ran for ${r.sec} s`);
  for(const l of notes){console.log(l);if(process.env.GITHUB_ACTIONS)console.log(`::notice title=${r.s}${r.tag}::${l.replace(/%/g,'%25').replace(/\r/g,'').replace(/\n/g,'%0A').slice(0,400)}`);}
  if(!pass){bad++;failed.push(r);const lines=r.out.split('\n').filter(l=>!/^ok /.test(l)&&/FAIL|Error|error/.test(l)).slice(0,15);console.log(lines.join('\n'));
    // On GitHub the job log sits behind a sign-in, but annotations can be read
    // through the API, so each failing line is also written as one.
    if(process.env.GITHUB_ACTIONS)for(const l of (lines.length?lines:[r.out.slice(-300)]))console.log(`::error title=${r.s}${r.tag}::${l.replace(/%/g,'%25').replace(/\r/g,'').replace(/\n/g,'%0A').slice(0,400)}`);}
}
async function pool(list,n){
  const res=new Array(list.length);let next=0,shown=0;
  const flush=()=>{while(shown<list.length&&res[shown]){report(res[shown]);shown++;}};
  await Promise.all(Array.from({length:Math.min(n,list.length)},async()=>{while(next<list.length){const i=next++;res[i]=await runOne(list[i]);flush();}}));
}
(async()=>{
  await pool(mine.filter(x=>!SERIAL.has(x.s)),jobs);
  await pool(mine.filter(x=>SERIAL.has(x.s)),1);
  /* GitHub shows at most 10 error annotations a step, so a shard with more
     failing lines than that lost the rest (the first WebKit run, 2026-10-14).
     Every failure in the shard is also written as warnings, a separate
     allowance, one entry per failed suite with all its failing lines. */
  if(process.env.GITHUB_ACTIONS&&failed.length){
    const esc=t=>t.replace(/%/g,'%25').replace(/\r/g,'').replace(/\n/g,'%0A');
    const parts=failed.map(r=>{const ls=r.out.split('\n').filter(l=>!/^ok /.test(l)&&/FAIL|Error|error/.test(l)).slice(0,40).map(l=>'  '+l.slice(0,1500));return `${r.s}${r.tag}\n${(ls.length?ls:['  '+r.out.slice(-300)]).join('\n')}`;});
    const chunks=[];let cur='';for(const p of parts){if(cur&&cur.length+p.length>20000){chunks.push(cur);cur='';}cur+=(cur?'\n':'')+p.slice(0,20000);}if(cur)chunks.push(cur);
    chunks.slice(0,9).forEach((c,i)=>console.log(`::warning title=Every failure in this shard (${i+1} of ${Math.min(chunks.length,9)})::${esc(c)}`));
  }
  const min=Math.round((Date.now()-t0)/6000)/10;
  console.log(bad?`${bad} suite(s) failed (${min} min, ${jobs} at a time${wk?', WebKit':''})`:`All suites passed (${min} min, ${jobs} at a time${shard[1]>1?`, shard ${shard.join('/')}`:''}${wk?', WebKit':''})`);
  process.exit(bad?1:0);
})();
