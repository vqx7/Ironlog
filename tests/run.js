// Runs every suite from the repo root and fails if any suite does not pass.
const {execFileSync}=require('child_process');const fs=require('fs');
fs.mkdirSync('screenshots',{recursive:true});
const suites=['unit-math','unit-analytics','dataflow','migration','acceptance','flows','charts-layout','cycle-create','fuzz','integrity','gym-ux','design','uat','essentials','comeback-removed','map3d','pwa','update','accounts','install','r21','r22','r23','r24','r25','preview'];
// The standalone build (dist/, made by the pwa suite) runs the user-facing suites again.
// map3d is not among them: a file:// page cannot import a module, and pwa checks the 3D body in dist/ over http.
// r22 is not repeated on dist/: its first-run part checks the source file's no-account path, and the accounts suite covers the build's.
const distSuites=['dataflow','acceptance','flows','gym-ux','design','uat','essentials','comeback-removed','r21','r24','r25'];
let bad=0;
function run(s,env,tag){
  let out='';try{out=execFileSync('node',[`tests/${s}.js`],{encoding:'utf8',timeout:600000,env:{...process.env,...env}});}catch(e){out=(e.stdout||'')+(e.stderr||'');}
  const pass=/ALL PASS|fuzz clean/.test(out)&&!/^FAIL/m.test(out);
  console.log(`${pass?'PASS':'FAIL'}  ${s}${tag}`);
  if(!pass){bad++;console.log(out.split('\n').filter(l=>/FAIL|Error|error/.test(l)).slice(0,15).join('\n'));}
}
for(const s of suites)run(s,{},'');
for(const s of distSuites)run(s,{IRONLOG_FILE:'dist/index.html'},' (standalone build)');
console.log(bad?`${bad} suite(s) failed`:'All suites passed');process.exit(bad?1:0);
