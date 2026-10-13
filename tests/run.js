// Runs every suite from the repo root and fails if any suite does not pass.
const {execFileSync}=require('child_process');const fs=require('fs');
fs.mkdirSync('screenshots',{recursive:true});
const suites=['unit-math','unit-analytics','dataflow','migration','acceptance','flows','charts-layout','cycle-create','fuzz','integrity','gym-ux','design','uat','essentials','comeback-removed','map3d','pwa','update','accounts','install','r21','r22','r23','r24','r25','preview','owner-doc','sql','journey','progress','breach','custom','r27','r28','r29','r29b','r29c','r30','r31','r32','r32b','r33','r34','r34b','r35','r36','r38','r39','r40','r41','realism','r42','r43','hygiene'];
// The standalone build (dist/, made by the pwa suite) runs the user-facing suites again.
// map3d is not among them: a file:// page cannot import a module, and pwa checks the 3D body in dist/ over http.
// r39 is not either, for the same reason: most of it is the 3D body in a sheet.
// r22 is not repeated on dist/: its first-run part checks the source file's no-account path, and the accounts suite covers the build's.
const distSuites=['dataflow','acceptance','flows','gym-ux','design','uat','essentials','comeback-removed','r21','r24','r25','journey','progress','custom','r29c','r30','r31','r32','r32b','r33','r34','r34b','r35','r38','r40','r41','r42','r43'];
let bad=0;
function run(s,env,tag){
  // 15 minutes a suite, and a suite stopped for time or by a signal now says
  // so. Before, it failed with nothing but its ok lines: r33 on the r37 publish
  // run (a runner half again slower than the pull request's), most likely the
  // old 10-minute limit.
  let out='';try{out=execFileSync('node',[`tests/${s}.js`],{encoding:'utf8',timeout:900000,env:{...process.env,...env}});}catch(e){out=(e.stdout||'')+(e.stderr||'');if(e.code==='ETIMEDOUT')out+='\nFAIL stopped after 15 minutes';else if(e.signal)out+=`\nFAIL stopped by ${e.signal}`;}
  const pass=/ALL PASS|fuzz clean/.test(out)&&!/^FAIL/m.test(out);
  console.log(`${pass?'PASS':'FAIL'}  ${s}${tag}`);
  if(!pass){bad++;const lines=out.split('\n').filter(l=>!/^ok /.test(l)&&/FAIL|Error|error/.test(l)).slice(0,15);console.log(lines.join('\n'));
    // On GitHub the job log sits behind a sign-in, but annotations can be read
    // through the API, so each failing line is also written as one.
    if(process.env.GITHUB_ACTIONS)for(const l of (lines.length?lines:[out.slice(-300)]))console.log(`::error title=${s}${tag}::${l.replace(/%/g,'%25').replace(/\r/g,'').replace(/\n/g,'%0A').slice(0,400)}`);}
}
for(const s of suites)run(s,{},'');
for(const s of distSuites)run(s,{IRONLOG_FILE:'dist/index.html'},' (standalone build)');
console.log(bad?`${bad} suite(s) failed`:'All suites passed');process.exit(bad?1:0);
