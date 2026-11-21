// Installs .githooks/pre-commit (the staged-file guard) as this clone's pre-commit hook.
// Runs from `npm install` / `npm ci` (the "prepare" script), so it must never fail them: every path exits 0.
const { execFileSync } = require('node:child_process');
const { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** "pre-commit.backup-2026-11-21", or with "-2", "-3" … when that name is taken. */
function backupName(target) {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let name = `${target}.backup-${date}`;
  for (let n = 2; existsSync(name); n++) name = `${target}.backup-${date}-${n}`;
  return name;
}

function install() {
  if (process.env.CI) return; // CI never commits.
  let inside = '';
  try { inside = git('rev-parse', '--is-inside-work-tree'); } catch { /* not a git work tree, or no git */ }
  if (inside !== 'true') return;
  let hooksPath = '';
  try { hooksPath = git('config', '--get', 'core.hooksPath'); } catch { /* unset: Git's own hooks directory */ }
  if (hooksPath) {
    console.log(`install-git-hooks: core.hooksPath is set (${hooksPath}); add .githooks/pre-commit there yourself.`);
    return;
  }
  const target = resolve(root, git('rev-parse', '--git-path', 'hooks/pre-commit'));
  const hook = readFileSync(resolve(root, '.githooks', 'pre-commit'));
  if (existsSync(target)) {
    if (readFileSync(target).equals(hook)) return;
    const backup = backupName(target);
    renameSync(target, backup);
    console.log(`install-git-hooks: a different pre-commit hook was moved to ${backup}; installed the Mergen Scope guard.`);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, hook);
  try { chmodSync(target, 0o755); } catch { /* Windows: Git for Windows runs hooks without the mode bit */ }
}

try {
  install();
} catch (error) {
  console.log(`install-git-hooks: skipped (${error instanceof Error ? error.message : String(error)}).`);
}
process.exit(0);
