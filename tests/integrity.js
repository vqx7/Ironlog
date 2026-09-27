// Data-integrity scenarios from the r14 review. Each script in tests/repro/
// reproduces one way data used to be lost, duplicated or injected, and prints
// what happened. This runner checks that output against the correct outcome.
const { execFile } = require('child_process');
const path = require('path');

const CASES = [
  ['flush_race', [/A after flush: \[ 's0', 's1', 's2', 'sB' \]/, /cloud chunk: \[ 's0', 's1', 's2', 'sB' \]/], 'edit logged during a sync read survives'],
  ['skew', [/A after pull: \[ 'sA', 'sB' \]/, /B after pull: \[ 'sA', 'sA2', 'sB' \]/], 'a device with a slow clock does not lose sessions'],
  ['unreadable_wipe', [/cloud after: \{"sessions":\["s1","s2"\],"routine":"My routine"\}/], 'unreadable local save never wipes the cloud copy'],
  ['undo_stale', [/after reload: \[ '[^']+@2026-09-20', 'old@2026-09-18' \]/], 'Undo keeps sessions logged after the delete'],
  ['multitab', [/after B edit: \[ 'sA' \]/, /fresh tab after A closed, sessions: \[ 'sA' \]/], 'two tabs merge instead of overwriting'],
  ['edit_deleted_local', [/after reload: \[ 'S:edited' \]/], 'saving an edit of a deleted session keeps it'],
  ['edit_vs_delete', [/"sessions":\["S:edited on B"\]/], 'edit on one device beats delete on another'],
  ['xss', [/errors \[\]/], 'no markup injected through ids', out => !/"nodes":\["/.test(out) && !/"fired":\[\d/.test(out)],
  ['xss_draft', [/\{ node: false, fired: 0 \}/], 'no markup injected through the draft'],
  ['proto', [/errors \[\]/], 'ids named after Object properties are safe', out => !/"crash":true/.test(out)],
  ['proto2', [/ctorOnly today:false dash:false history:false \[\]/, /ctorViaUI today:false dash:false history:false \[\]/], '"constructor" as an exercise id breaks nothing'],
  ['firstlink', [/B has myEx: true/], 'first sync keeps custom exercises from both sides'],
  ['dup_move', [/^A \[ 'S@2026-09-18:B note' \]$/m, /^B after reload \[ 'S@2026-09-18:B note' \]$/m], 'one id never shows as two sessions'],
  ['core_growth', [/session chunk in cloud: true/], 'an oversized document does not block the others'],
  ['bignum', [/stored bw: \[ 80, 400 \]/], 'absurd body numbers are capped', out => !/"crash":true/.test(out) && !/"bad":\["/.test(out)],
  ['undo_kinds', [/"afterEraseUndo":"a,b"/, /"afterImportUndo":"a,b"/, /"afterDeleteUndo":"a,b","bwKept":true,"trashA":false/, /errors \[\]/], 'Undo reverses erase, import and delete, and nothing else'],
  ['quota_once', [/stored done sets: 2/], 'saving resumes after a storage error'],
];

function run(name) {
  return new Promise(res => execFile('node', [path.join(__dirname, 'repro', name + '.js')], { timeout: 180000, cwd: path.join(__dirname, '..') },
    (err, stdout, stderr) => res({ err, out: stdout + stderr })));
}

(async () => {
  let fail = 0;
  // Two at a time keeps the whole suite quick without starving the timers the
  // sync scenarios depend on.
  for (let i = 0; i < CASES.length; i += 2) {
    const batch = CASES.slice(i, i + 2);
    const results = await Promise.all(batch.map(c => run(c[0])));
    batch.forEach(([name, pats, what, extra], k) => {
      const { err, out } = results[k];
      const good = !err && pats.every(p => p.test(out)) && (!extra || extra(out));
      if (good) console.log('ok  ', name, '-', what);
      else { fail++; console.log('FAIL', name, '-', what, '\n' + out.split('\n').slice(-12).join('\n')); }
    });
  }
  console.log(fail ? `${fail} FAILED` : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})();
