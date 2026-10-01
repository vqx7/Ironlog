// OWNER.md (r25): the code V pastes is the code in the repo. Every SQL block
// in OWNER.md is a block of SUPABASE.md, and the function V deploys is
// supabase/functions/feedback-to-issue/index.ts exactly, so the two can
// never drift apart.
const fs = require('fs'); const path = require('path');
const R = path.join(__dirname, '..');
const fails = []; const ok = (c, m) => { if (!c) { fails.push(m); console.log('FAIL', m); } else console.log('ok  ', m); };
const owner = fs.readFileSync(path.join(R, 'OWNER.md'), 'utf8'), sup = fs.readFileSync(path.join(R, 'SUPABASE.md'), 'utf8');
const sql = s => [...s.matchAll(/```sql\n([\s\S]*?)```/g)].map(m => m[1]);
const os = sql(owner), ss = sql(sup);
ok(os.length >= 3, `OWNER.md carries the SQL to paste (${os.length} blocks)`);
for (const b of os) ok(ss.includes(b), 'SQL block matches SUPABASE.md: ' + b.split('\n')[0].slice(0, 60));
const fn = fs.readFileSync(path.join(R, 'supabase/functions/feedback-to-issue/index.ts'), 'utf8');
// Four backticks: the function itself contains three in a row.
const ts = [...owner.matchAll(/````ts\n([\s\S]*?)````/g)].map(m => m[1]);
ok(ts.length === 1 && ts[0] === fn, 'the function in OWNER.md is the repo\'s feedback-to-issue exactly');
ok(!/—/.test(owner), 'no em dashes');
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
