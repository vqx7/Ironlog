// src/app/config.ts for the Node scripts (join, build, the hygiene suite):
// compiled by esbuild in memory and evaluated, so every script reads the
// same values the app does. There is no second copy to drift from it.
const path = require('path');
const esbuild = require('esbuild');
const file = path.join(__dirname, '..', 'src', 'app', 'config.ts');
function load() {
  const out = esbuild.buildSync({ entryPoints: [file], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent' });
  const mod = { exports: {} };
  new Function('module', 'exports', out.outputFiles[0].text)(mod, mod.exports);
  return mod.exports;
}
module.exports = load();
