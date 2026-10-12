// Joins the parts in src/ (in name order) into index.html, the one file the
// Claude artifact, the build and every test use (r36, V: the code split so it
// is easier to work on, with nothing changed). Edit src/, then run
// `npm run join`. `--stdout` prints the joined file instead of writing it;
// `--check` exits 1 when index.html is not what src/ joins to.
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..'); const dir = path.join(root, 'src');
const parts = fs.readdirSync(dir).filter(f => /^\d\d-.+\.(html|css|js)$/.test(f)).sort();
const joined = parts.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
const out = path.join(root, 'index.html');
if (process.argv.includes('--stdout')) process.stdout.write(joined);
else if (process.argv.includes('--check')) {
  const same = fs.readFileSync(out, 'utf8') === joined;
  console.log(same ? 'index.html matches src/' : 'index.html differs from src/: edit src/ and run npm run join');
  process.exit(same ? 0 : 1);
} else { fs.writeFileSync(out, joined); console.log(`index.html written from ${parts.length} parts`); }
