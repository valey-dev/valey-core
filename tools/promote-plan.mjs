// The rules of publishing, kept apart from the command that publishes.
//
// Since 12 September 2026 a release and a publication are two steps. `ship`
// cuts a version into the private staging repositories and stops there; the
// owner runs it as often as a fix needs, catches up a skipped one, checks the
// result on his own machine. `promote <tag>` is the second step, and the only
// one that reaches outside: the public core and the buyers' shop front. Until
// then one command did both, so every release to staging was already public
// the moment it was cut — the owner could not look at a version before the
// world did.
//
// The rules live here, without git or network, for the same reason the digit
// rules live in release-kind.mjs: importing promote.mjs publishes, so a stand
// could not load them otherwise.

const num = (t) => String(t).replace(/^v/, '').split('.').map(Number);

export function compare(a, b) {
  const x = num(a), y = num(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

// Only plain versions count. The repository also carries `logseq-log/<date>`
// and, from the release candidates nobody has cut yet, would carry `-rc` tags;
// neither is a version anybody promotes.
export const versions = (tags) => tags.filter((t) => /^v\d+\.\d+\.\d+$/.test(t)).sort(compare);

export const newest = (tags) => { const v = versions(tags); return v.length ? v[v.length - 1] : null; };

// The versions a publication of `tag` carries: everything after the last
// published one, up to and including `tag`. The public history is linear, so
// promoting v0.41.0 over v0.38.0 publishes v0.39.0 and v0.40.0 as well — the
// page has to say so rather than pretend only the last one moved.
export function carried(tags, since, tag) {
  return versions(tags).filter((t) => (!since || compare(t, since) > 0) && compare(t, tag) <= 0);
}

// Whether `tag` may go out. `staged` are the tags on the private origin,
// `published` those already outside. Every refusal says what to do instead.
export function decide({ tag, staged, published }) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) return { ok: false, note: `not a version tag: ${tag}` };
  if (!staged.includes(tag))
    return { ok: false, note: `${tag} is not on origin. A version is released to staging first (npm run ship), checked there, and only then published` };
  const last = newest(published);
  if (last && compare(tag, last) === 0) return { ok: false, note: `${tag} is already published` };
  // Going backwards would move the public main under everybody who pulled it,
  // and a release is never rewritten — a wrong one gets a newer one.
  if (last && compare(tag, last) < 0)
    return { ok: false, note: `${tag} is older than the published ${last}; publishing goes forward only` };
  return { ok: true, since: last, carries: carried(staged, last, tag) };
}

// The core a modules release was checked against. release.mjs writes it into
// the modules' package.json when it cuts their version: the commit of the core
// tree whose stands ran. A modules release that needs core code the public has
// not received would break every buyer on the first `git pull`, and silently —
// it loads, and then something stops working. That happened once already: the
// shop stood on 0.6.2 with modules 0.7.1 needing core >= 0.27.
export function coreOf(pkg) {
  const c = pkg && pkg.valey && pkg.valey.core;
  if (!c || !/^[0-9a-f]{40}$/.test(c.commit || '')) return null;
  return { commit: c.commit, described: c.described || c.commit.slice(0, 7) };
}

// The installer people paste from valey.dev is not served from this
// repository: the site keeps its own copy of install.sh, and until 27 September
// 2026 nothing carried the core's file there. Five installer fixes had been
// published by then and none had reached `curl … | sh` — a tester hit the
// ENOENT uv_cwd that v0.65.3 already warned about. So a publication of the core
// now carries its install.sh to the site as well, byte for byte.
export const installerDiffers = (core, site) => core != null && core !== site;

// The site also runs the office's own drawing code: its demo floor imports
// core/web through a submodule pinned to a public core. Nothing moved that pin
// either — it stood on v0.55.0 while v0.72.0 was out — so a publication moves
// it too, forward only, and in the same branch as the installer: the site
// follows the core it was published with, in one step with one set of stands.
//
// The site's branch and commit for what a publication carries. A `fix` on
// purpose: the site counts its own digit, and the same page on a newer engine,
// or a newer installer at the same address, is a patch there whatever it was
// in the core.
export function siteChange(tag, { installer = false, core = false } = {}) {
  if (!installer && !core) return null;
  const subject = installer && core
    ? `fix(site): valey.dev follows core ${tag} — its installer and the demo floor's engine`
    : installer ? `fix(install): valey.dev serves the installer of core ${tag}`
    : `fix(landing): the demo floor runs on core ${tag}`;
  const why = [
    installer && `install.sh is the core's at ${tag}, byte for byte. It is edited in the core, never here.`,
    core && `core/ is pinned to ${tag}, the version the core just published.`,
  ].filter(Boolean).join('\n');
  return { branch: `core-${tag}`, message: `${subject}\n\nCarried by the core's promote.\n${why}\n` };
}
