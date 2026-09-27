#!/usr/bin/env node
// Publishing a version that is already released to staging.
//
//   npm run promote -- --status            # what is in staging and not outside yet
//   npm run promote -- v0.40.0 --dry       # what would go out, and the checks
//   npm run promote -- v0.40.0             # the core: public main + tag + page
//   cd modules && npm run promote -- v0.8.0  # the Modules: the buyers' shop front
//   npm run promote -- --installer          # valey.dev's install.sh caught up with the public core
//
// `ship` stops at the private origins; this is the only step that reaches the
// public repository and the shop, and it is the owner's word every time. See
// promote-plan.mjs for the rules and for why the two were split.
//
// A publication is a tag, never a branch: the public main is moved to exactly
// the commit of the tag, so it always stands on the last version somebody
// looked at — not on whatever staging reached since.
//
// A core publication also carries install.sh to valey.dev. The site keeps its
// own copy of the file, and a copy nobody is obliged to refresh is a copy that
// goes stale: it stood on 14 September until 27 September 2026, five fixes
// behind. The owner's word on promote is the word on the installer too.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decide, carried, newest, coreOf, versions, installerDiffers, installerChange } from './promote-plan.mjs';

const TOOL_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROOT = process.env.VALEY_REPO ? path.resolve(process.env.VALEY_REPO) : TOOL_ROOT;
const PUBLIC = process.env.VALEY_PUBLIC_REMOTE || 'public';
const SHOP = process.env.VALEY_SHOP || 'https://github.com/valey-dev/valey-office.git';
const SITE = process.env.VALEY_SITE_REPO || 'https://github.com/xoyk/valey-site.git';
const SITE_REF = 'refs/valey/site-main';

const run = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const quiet = (dir, ...a) => { try { return run(dir, ...a); } catch { return ''; } };
const die = (m) => { console.error('promote: ' + m); process.exit(1); };

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const status = args.includes('--status');
const installerOnly = args.includes('--installer');
const tag = args.find((a) => !a.startsWith('--'));

// The Modules are recognised by their shop tool, the same way release.mjs
// recognises them: a repository that feeds a shop is published to the shop.
const isShop = (dir) => existsSync(path.join(dir, 'tools/publish.mjs'));

// Tags a remote holds, by asking it rather than trusting local refs: a tag cut
// here and never pushed is exactly the case that must not count as staged.
const remoteTags = (dir, where) => quiet(dir, 'ls-remote', '--tags', where)
  .split('\n').map((l) => l.split('refs/tags/')[1]).filter((t) => t && !t.endsWith('^{}'));

// The heading of a version's changelog section, read at the tag itself: the
// working tree may be on another branch, and the tag is what goes out.
function heading(dir, at, t) {
  const md = quiet(dir, 'show', `${at}:CHANGELOG.md`);
  const line = md.split('\n').find((l) => l.startsWith(`## ${t} `) || l.trim() === `## ${t}`);
  return line ? line.replace(/^## /, '') : t;
}

// Whether the public core already has a given core commit. Fetched rather than
// read from a remote-tracking ref, which is as old as the last fetch.
function corePublic(commit) {
  if (!quiet(TOOL_ROOT, 'remote', 'get-url', PUBLIC)) return { ok: false, why: `the core has no remote called ${PUBLIC}` };
  try { run(TOOL_ROOT, 'fetch', '--quiet', PUBLIC, 'refs/heads/main'); } catch (e) {
    return { ok: false, why: `could not fetch ${PUBLIC}/main: ${String(e.message).split('\n')[0]}` };
  }
  try { run(TOOL_ROOT, 'merge-base', '--is-ancestor', commit, 'FETCH_HEAD'); return { ok: true }; }
  catch { return { ok: false, why: 'not on the public main' }; }
}

// The smallest core version on origin that contains a commit — what to promote
// first when the Modules need more core than the public has.
function coreTagWith(commit) {
  const staged = remoteTags(TOOL_ROOT, 'origin');
  return versions(quiet(TOOL_ROOT, 'tag', '--contains', commit, '-l', 'v*').split('\n').filter(Boolean))
    .find((t) => staged.includes(t)) || null;
}

function where(dir) {
  const shop = isShop(dir);
  const outside = shop ? SHOP : PUBLIC;
  if (!shop && !quiet(dir, 'remote', 'get-url', PUBLIC)) return null;
  return { shop, outside, name: shop ? 'shop front valey-dev/valey-office' : `${PUBLIC} (${quiet(dir, 'remote', 'get-url', PUBLIC)})` };
}

function report(dir, label) {
  const w = where(dir);
  if (!w) { console.log(`${label}: no remote called ${PUBLIC}, nothing is published from here`); return; }
  const staged = remoteTags(dir, 'origin'), published = remoteTags(dir, w.outside);
  const top = newest(staged), last = newest(published);
  console.log(`${label}: staging at ${top || '—'}, outside at ${last || '—'}`);
  const waiting = top ? carried(staged, last, top) : [];
  if (!waiting.length) { console.log('  nothing waiting'); return; }
  for (const t of waiting.slice().reverse()) console.log(`  ${heading(dir, t, t)}`);
  if (w.shop) {
    const core = coreOf(JSON.parse(quiet(dir, 'show', `${top}:package.json`) || '{}'));
    if (!core) console.log(`  ${top} does not record the core it was checked against — cut a new release to promote it`);
    else {
      const pub = corePublic(core.commit);
      console.log(pub.ok ? `  its core (${core.described}) is public` : `  its core (${core.described}) is not public yet — promote the core first`);
    }
  }
  console.log(`  to publish: ${w.shop ? 'cd modules && ' : ''}npm run promote -- ${top}`);
}

// ------------------------------------------------------------- the installer
// Exact bytes on both sides: the comparison is about what `curl` receives.
const raw = (dir, spec) => { try { return execFileSync('git', ['-C', dir, 'show', spec], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };

// The install.sh on the site's main, fetched into a ref of its own rather than
// FETCH_HEAD, which corePublic() uses for the public core.
function siteInstaller() {
  try { run(TOOL_ROOT, 'fetch', '--quiet', '--no-tags', SITE, `+refs/heads/main:${SITE_REF}`); } catch (e) {
    return { error: `could not fetch the site (${SITE}): ${String(e.stderr || e.message).trim().split('\n')[0]}` };
  }
  return { text: raw(TOOL_ROOT, `${SITE_REF}:install.sh`) };
}

// Put the core's install.sh at `t` on valey.dev, through the site's own land:
// its stands, its release, its deploy. A fresh clone rather than a checkout on
// this machine, which may be on another branch or have work in it.
function syncInstaller(t, { dryRun = false } = {}) {
  const want = raw(ROOT, `${t}:install.sh`);
  if (want == null) { console.log(`\ninstaller: ${t} has no install.sh; the site is left as it is`); return true; }
  const site = siteInstaller();
  if (site.error) { console.log(`\ninstaller: ${site.error}`); return false; }
  if (!installerDiffers(want, site.text)) { console.log(`\ninstaller: valey.dev already serves the install.sh of ${t}`); return true; }
  const c = installerChange(t);
  if (dryRun) { console.log(`\ninstaller: valey.dev serves a different install.sh; a real run lands ${c.branch} into the site, and its deploy updates valey.dev`); return true; }
  console.log(`\ninstaller: valey.dev serves a different install.sh — carrying ${t}'s to the site:`);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'valey-site-installer-'));
  const finish = `  cd ${dir} && npm run land -- ${c.branch}\n  or, from the core: npm run promote -- --installer`;
  try {
    execFileSync('git', ['clone', '--quiet', SITE, dir], { stdio: ['ignore', 'pipe', 'pipe'] });
    run(dir, 'switch', '--quiet', '-c', c.branch);
    writeFileSync(path.join(dir, 'install.sh'), want);
    run(dir, 'commit', '--quiet', '-am', c.message);
    run(dir, 'push', '--quiet', '-u', 'origin', c.branch);
    // Off the branch, so the site's land can delete it once merged.
    run(dir, 'switch', '--quiet', '--detach');
  } catch (e) {
    console.log(`  preparing the site's branch failed: ${String(e.stderr || e.message).trim().split('\n')[0]}\n  the clone is in ${dir}`);
    return false;
  }
  // VALEY_REPO belongs to this repository's tools; the site's land reads it
  // too, and would release the wrong tree.
  const env = { ...process.env };
  delete env.VALEY_REPO;
  const r = spawnSync(process.execPath, [path.join(dir, 'tools/land.mjs'), c.branch], { cwd: dir, stdio: 'inherit', env });
  if (r.status !== 0) {
    // The land can fail after its push — at the release page — and then the
    // installer is already on the site's main and on its way to valey.dev.
    const now = siteInstaller();
    if (!now.error && !installerDiffers(want, now.text)) {
      console.log(`\ninstaller: ${t}'s install.sh is on the site's main, and its deploy takes it to valey.dev;\n  the site's land stopped after that — what is left is printed above, to be run in ${dir}`);
    } else console.log(`\ninstaller: the site's land failed; branch ${c.branch} is on the site's origin. Finish with:\n${finish}`);
    return false;
  }
  rmSync(dir, { recursive: true, force: true });
  return true;
}

if (installerOnly) {
  if (isShop(ROOT)) die('the installer is the core\'s; run this from the core');
  const last = newest(remoteTags(ROOT, PUBLIC));
  if (!last) die(`nothing is published on ${PUBLIC} yet`);
  quiet(ROOT, 'fetch', '--quiet', 'origin', `refs/tags/${last}:refs/tags/${last}`);
  process.exit(syncInstaller(last, { dryRun: dry }) ? 0 : 1);
}

if (status) {
  report(ROOT, isShop(ROOT) ? 'Modules' : 'core');
  // From the core checkout the Modules sit one level down; one command should
  // answer "what is not outside yet" for both, since both are the owner's call.
  const mods = path.join(ROOT, 'modules');
  if (!isShop(ROOT) && isShop(mods)) report(mods, 'Modules');
  if (!isShop(ROOT)) {
    const last = newest(remoteTags(ROOT, PUBLIC));
    const want = last && raw(ROOT, `${last}:install.sh`);
    const site = want ? siteInstaller() : null;
    if (site && site.error) console.log(`installer: ${site.error}`);
    else if (site) console.log(installerDiffers(want, site.text)
      ? `installer: valey.dev serves a different install.sh than the public ${last}\n  to catch it up: npm run promote -- --installer`
      : `installer: valey.dev serves the install.sh of the public ${last}`);
  }
  process.exit(0);
}

if (!tag) die('name the version to publish, or ask --status');
const w = where(ROOT);
if (!w) die(`no remote called ${PUBLIC}; there is nowhere public to publish this repository`);
if (!quiet(ROOT, 'rev-parse', '--verify', '--quiet', `refs/tags/${tag}`)) die(`tag ${tag} does not exist here; fetch it first`);

const staged = remoteTags(ROOT, 'origin');
const published = remoteTags(ROOT, w.outside);
const plan = decide({ tag, staged, published });
if (!plan.ok) die(plan.note);

// The public main is only ever fast-forwarded. A version whose history does not
// contain the last published one cannot be put on top of it without rewriting
// what people already pulled.
if (!w.shop && plan.since) {
  try { run(ROOT, 'merge-base', '--is-ancestor', `${plan.since}^{commit}`, `${tag}^{commit}`); }
  catch { die(`${tag} does not contain the published ${plan.since}; the public main would have to be rewritten`); }
}

if (w.shop) {
  const core = coreOf(JSON.parse(quiet(ROOT, 'show', `${tag}:package.json`) || '{}'));
  if (!core) die(`${tag} does not record which core it was checked against.\n` +
    '  release.mjs writes it when it cuts a Modules version; cut a new one (npm run ship) and promote that');
  const pub = corePublic(core.commit);
  if (!pub.ok) {
    const first = coreTagWith(core.commit);
    die(`${tag} was checked against core ${core.described}, and that core is ${pub.why}.\n` +
      '  A buyer pulling these modules onto the public core would get a module that loads and then breaks.\n' +
      (first ? `  Promote the core first: npm run promote -- ${first}` : '  No released core contains it yet: ship the core, then promote it'));
  }
  console.log(`core ${core.described} is public — the modules will run on it`);
}

console.log(`\n${tag} → ${w.name}`);
console.log(plan.since ? `last published: ${plan.since}; this carries ${plan.carries.length}:` : 'nothing published before; this carries:');
for (const t of plan.carries.slice().reverse()) console.log(`  ${heading(ROOT, tag, t)}`);

if (w.shop) {
  // publish.mjs builds the flat commit, checks nothing internal got in, pushes
  // and makes the page; --since makes the page speak for every version carried.
  const a = [path.join(ROOT, 'tools/publish.mjs'), tag];
  if (plan.since) a.push('--since', plan.since);
  if (dry) a.push('--dry');
  const r = spawnSync(process.execPath, a, { cwd: ROOT, stdio: 'inherit' });
  process.exit(r.status || 0);
}

if (dry) { syncInstaller(tag, { dryRun: true }); console.log('\n--dry: nothing was pushed'); process.exit(0); }

console.log(`\npushing to ${PUBLIC}:`);
// Atomic for the reason release.mjs gives: without it a public main that
// refuses — moved by hand, or by a second promote — still lets the tag out,
// and a public tag with no branch under it is the one state nobody can take
// back.
try {
  run(ROOT, 'push', '--atomic', PUBLIC, `${tag}^{commit}:refs/heads/main`, tag);
} catch (e) {
  die(`push failed: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
}
console.log(`  main at ${tag}, tag pushed`);

console.log('\nrelease page:');
const page = [path.join(TOOL_ROOT, 'tools/gh-release.mjs'), tag, '--remote', PUBLIC];
if (plan.since) page.push('--since', plan.since);
const r = spawnSync(process.execPath, page, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, VALEY_REPO: ROOT } });
if (r.status !== 0) {
  console.log(`\nthe page failed; ${tag} is already public. Finish with:\n  node tools/gh-release.mjs ${page.slice(1).join(' ')}`);
  process.exit(1);
}

if (!syncInstaller(tag)) {
  console.log(`\n${tag} is public; only valey.dev's installer is behind.`);
  process.exit(1);
}
