// Runs every suite from the repo root and fails if any suite does not pass.
// Since r44 suites run side by side (V: "more efficient across the board"):
// a full run took about 25 minutes one after another.
//   node tests/run.js                every suite, on this machine's cores (at most 4)
//   node tests/run.js --jobs 1       one at a time, as before r44
//   node tests/run.js --shard 2/4    the second quarter only (the GitHub workflow runs four at once)
//   IRONLOG_JOBS=2 npm test          the same as --jobs 2
const {execFile,execFileSync}=require('child_process');const fs=require('fs');const os=require('os');const path=require('path');
fs.mkdirSync('screenshots',{recursive:true});
const suites=['unit-math','unit-analytics','dataflow','migration','acceptance','flows','charts-layout','cycle-create','fuzz','integrity','gym-ux','design','uat','essentials','comeback-removed','map3d','pwa','update','accounts','install','r21','r22','r23','r24','r25','preview','owner-doc','sql','journey','progress','breach','custom','r27','r28','r29','r29b','r29c','r30','r31','r32','r32b','r33','r34','r34b','r35','r36','r38','r39','r40','r41','realism','r42','r43','r44','security','hygiene'];
// The standalone build (dist/) runs the user-facing suites again.
// map3d is not among them: a file:// page cannot import a module, and pwa checks the 3D body in dist/ over http.
// r39 is not either, for the same reason: most of it is the 3D body in a sheet.
// r22 is not repeated on dist/: its first-run part checks the source file's no-account path, and the accounts suite covers the build's.
const distSuites=['dataflow','acceptance','flows','gym-ux','design','uat','essentials','comeback-removed','r21','r24','r25','journey','progress','custom','r29c','r30','r31','r32','r32b','r33','r34','r34b','r35','r38','r40','r41','r42','r43','r44','security'];
/* Suites that lean on real time (rest timers, toasts, short waits, the clock)
   run one at a time after the others, so a busy machine cannot make them
   flaky (the r44 review). No retries: a retry would hide a real flake. */
const SERIAL=new Set(['gym-ux','r25','r33','update','journey','realism','r21','integrity']);

const arg=k=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:null;};
const jobs=Math.max(1,+(arg('--jobs')||process.env.IRONLOG_JOBS||Math.min(4,os.cpus().length))||1);
const shard=(arg('--shard')||'1/1').split('/').map(Number);
if(!(shard[1]>=1&&shard[0]>=1&&shard[0]<=shard[1])){console.error('--shard is i/n, as in 2/4');process.exit(2);}

// Every run in order: the source file first, then the standalone build.
const all=[...suites.map(s=>({s,tag:'',env:{}})),...distSuites.map(s=>({s,tag:' (standalone build)',env:{IRONLOG_FILE:'dist/index.html'}}))];
// A shard takes every n-th run, so the long suites spread across shards.
const mine=all.filter((_,i)=>i%shard[1]===shard[0]-1);

/* Both builds once, before anything runs: scripts/build.js starts by
   deleting dist/, so a suite rebuilding it would pull it from under another.
   Suites build for themselves only when run alone (tests/h.js build()). */
const t0=Date.now();
execFileSync('node',[path.join('scripts','build.js')],{stdio:'inherit'});
execFileSync('node',[path.join('scripts','build.js'),'--preview'],{stdio:'inherit'});

let bad=0;
function runOne(x){
  return new Promise(done=>{const t=Date.now();
    // 15 minutes a suite, and a suite stopped for time or by a signal says so.
    // Since r43 a stopped suite also names the last check it passed: r33
    // stopped on GitHub twice and nowhere else, and the annotation, the only
    // part of the log readable without a sign-in, could not say where.
    execFile('node',[`tests/${x.s}.js`],{encoding:'utf8',timeout:900000,maxBuffer:64<<20,env:{...process.env,...x.env,IRONLOG_BUILT:'1'}},(e,stdout,stderr)=>{
      let out=(stdout||'')+(stderr||'');
      if(e&&e.killed&&e.signal==='SIGTERM'&&Date.now()-t>=899000){const last=out.trim().split('\n').filter(l=>/^ok /.test(l)).slice(-1)[0]||'(no check passed)';out+=`\nFAIL stopped after 15 minutes; the last check that passed: ${last.replace(/^ok +/,'').slice(0,200)}`;}
      else if(e&&e.signal)out+=`\nFAIL stopped by ${e.signal}`;
      done({...x,out,sec:Math.round((Date.now()-t)/1000)});});});
}
// Results print in suite order whatever order they finish in, so a log reads the same every run.
function report(r){
  const pass=/ALL PASS|fuzz clean/.test(r.out)&&!/^FAIL/m.test(r.out);
  console.log(`${pass?'PASS':'FAIL'}  ${r.s}${r.tag}  ${r.sec}s`);
  if(!pass){bad++;const lines=r.out.split('\n').filter(l=>!/^ok /.test(l)&&/FAIL|Error|error/.test(l)).slice(0,15);console.log(lines.join('\n'));
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
  const min=Math.round((Date.now()-t0)/6000)/10;
  console.log(bad?`${bad} suite(s) failed (${min} min, ${jobs} at a time)`:`All suites passed (${min} min, ${jobs} at a time${shard[1]>1?`, shard ${shard.join('/')}`:''})`);
  process.exit(bad?1:0);
})();
