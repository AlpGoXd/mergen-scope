const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
let hooksPath;
try {
  hooksPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch { /* No custom hooks path: use Git's existing hooks directory. */ }
if (hooksPath) {
  console.error('Refusing to overwrite a custom core.hooksPath; install the pre-commit guard there manually.');
  process.exit(1);
}
let target;
try {
  target = execFileSync('git', ['rev-parse', '--git-path', 'hooks/pre-commit'], { cwd: root, encoding: 'utf8' }).trim();
} catch {
  console.error('Cannot find the Git hooks directory; pre-commit guard was not installed.');
  process.exit(1);
}
target = resolve(root, target);
const hook = readFileSync(resolve(root, '.githooks', 'pre-commit'));
if (existsSync(target)) {
  if (!readFileSync(target).equals(hook)) {
    console.error('Existing pre-commit hook differs; not overwriting it.');
    process.exit(1);
  }
} else {
  writeFileSync(target, hook, { mode: 0o755, flag: 'wx' });
}
