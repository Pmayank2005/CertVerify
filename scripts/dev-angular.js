// Build/watch and serve from one origin so wallet links and API writes keep working.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const cli = path.join(__dirname, '../node_modules/@angular/cli/bin/ng.js');
const run = args => spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
const initial = run([cli, 'build', '--configuration', 'development']);
const children = new Set([initial]);
let stopping = false;
function stop() { stopping = true; for (const child of children) child.kill(); }
initial.on('error', error => { console.error(error); process.exitCode = 1; });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
initial.on('exit', code => {
  children.delete(initial);
  if (stopping) return;
  if (code !== 0) { process.exitCode = code || 1; return; }
  if (!fs.existsSync(path.join(__dirname, '../dist/certverify/browser/index.html'))) {
    console.error('Angular did not produce an index.html.'); process.exitCode = 1; return;
  }
  const watcher = run([cli, 'build', '--watch', '--configuration', 'development']);
  const server = run([path.join(__dirname, 'serve-frontend.js'), ...process.argv.slice(2)]);
  for (const child of [watcher, server]) {
    children.add(child);
    child.on('error', error => { console.error(error); stop(); process.exitCode = 1; });
    child.on('exit', code => { children.delete(child); stop(); process.exitCode = code || 0; });
  }
});
