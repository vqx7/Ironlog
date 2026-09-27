// Runs every suite from the repo root and fails if any suite does not pass.
const {execFileSync}=require('child_process');const fs=require('fs');
fs.mkdirSync('screenshots',{recursive:true});
const suites=['unit-math','unit-analytics','dataflow','migration','acceptance','flows','charts-layout','cycle-create','fuzz','integrity','gym-ux'];
let bad=0;
for(const s of suites){
  let out='';try{out=execFileSync('node',[`tests/${s}.js`],{encoding:'utf8',timeout:600000});}catch(e){out=(e.stdout||'')+(e.stderr||'');}
  const pass=/ALL PASS|fuzz clean/.test(out)&&!/^FAIL/m.test(out);
  console.log(`${pass?'PASS':'FAIL'}  ${s}`);
  if(!pass){bad++;console.log(out.split('\n').filter(l=>/FAIL|Error|error/.test(l)).slice(0,15).join('\n'));}
}
console.log(bad?`${bad} suite(s) failed`:'All suites passed');process.exit(bad?1:0);
