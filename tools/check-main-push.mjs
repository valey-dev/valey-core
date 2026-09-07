#!/usr/bin/env node
// A local main push is the release tail, never an intermediate merge.
// GitHub merges PRs server-side and do not call this hook. Local pushes to main
// must carry the release commit and its tag together, or the merge-to-release
// gap comes back under a different command.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const git = (...args) => {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `git ${args.join(' ')} failed`).trim());
  return r.stdout.trim();
};
const zero = (oid) => /^0+$/.test(oid || '');

export function checkMainPush(input) {
  const errors = [];
  for (const raw of String(input || '').split('\n')) {
    const [localRef, localOid, remoteRef, remoteOid] = raw.trim().split(/\s+/);
    if (remoteRef !== 'refs/heads/main') continue;
    if (!localOid || zero(localOid)) {
      errors.push('deleting main is forbidden');
      continue;
    }
    if (!remoteOid || zero(remoteOid)) {
      errors.push('the first push of main belongs to the repository owner');
      continue;
    }
    try {
      spawnSync('git', ['merge-base', '--is-ancestor', remoteOid, localOid], { stdio: 'ignore' }).status === 0 ||
        errors.push('main push is not a fast-forward');
      const subject = git('show', '-s', '--format=%s', localOid);
      const pkg = JSON.parse(git('show', `${localOid}:package.json`));
      const tag = `v${pkg.version}`;
      if (subject !== `chore(release): ${tag}`) {
        errors.push(`main tip must be the release commit “chore(release): ${tag}”, got “${subject}”`);
      }
      let tagged = '';
      try { tagged = git('rev-parse', `refs/tags/${tag}^{commit}`); } catch {}
      if (tagged !== localOid) errors.push(`tag ${tag} must point at the main tip`);
    } catch (err) {
      errors.push(err.message);
    }
  }
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const errors = checkMainPush(fs.readFileSync(0, 'utf8'));
  if (errors.length) {
    console.error('push gate: main is released only by npm run ship');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
}
