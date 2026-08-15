// Find the games-repo working copy to build from.
//
// A sibling checkout wins and is treated as read-only: this repo exists to
// watch a branch somebody is still editing, so moving their git state would be
// hostile. Callers that want it moved pass --fetch. With no sibling we keep our
// own shallow clone under .cache/ and drive that one freely.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

export function locateCheckout(root, config, { override = null, clone = true } = {}) {
  const local = path.resolve(root, override || config.source.localCheckout);
  if (existsSync(path.join(local, 'tools', 'build.ts'))) return { dir: local, owned: false };

  const cacheDir = path.join(root, '.cache', 'games-repo');
  if (!existsSync(path.join(cacheDir, '.git'))) {
    if (!clone) throw new Error(`no games checkout at ${local} and cloning is disabled`);
    mkdirSync(path.dirname(cacheDir), { recursive: true });
    console.log(`cloning ${config.source.repo} (${config.source.branch})`);
    run('git', ['clone', '--depth', '1', '--branch', config.source.branch, config.source.repo, cacheDir], root);
    run('npm', ['ci', '--no-audit', '--no-fund'], cacheDir);
  }
  return { dir: cacheDir, owned: true };
}
