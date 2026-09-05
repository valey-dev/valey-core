// A project's version and its stack — the second line on the sign above the
// room's door. Only the manifests in the repository root are read: walking the
// tree for this is unnecessary, and on a large project it would cost seconds.
//
// There is one trap here, and it is worth the rest of the module: a Next
// project has a package.json too, and the naive "package.json is here → Node"
// declares the whole world to be "Node". So the framework comes first, from the
// dependencies, and only then the language, from the manifest itself.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { hasRepo } from './git.js';
import { promisify } from 'node:util';

const run = promisify(execFile);

const roots = new Map();          // session directory -> { at, root }
const ROOT_TTL = 60_000;

// The room's name out of git's answer. `--git-common-dir` points at the
// repository's own directory — both "/path/project/.git" and a bare
// "/path/project.git"; the room is named after what sits around it.
export function rootFromCommonDir(commonDir, dir) {
  if (!commonDir) return dir;
  const g = commonDir.replace(/\/+$/, '');
  return path.basename(g) === '.git' ? path.dirname(g) : g.replace(/\.git$/, '');
}

// The repository root for a session's working directory. A room in the office
// is a project, not a working copy: an agent who moved into a git worktree sits
// in a directory with its own name (.claude/worktrees/<topic>), and by basename
// it got a room of its own. On 30 August 2026 the floor held nine rooms for
// four projects, and two agents of one repository ended up at opposite ends of
// it. `--git-common-dir` answers the same from the main checkout and from any
// worktree, including one created outside the repository — that is the mark of
// "the same project". Not a repository — the directory itself stays, as before.
export async function repoRoot(dir) {
  if (!dir) return dir;
  const hit = roots.get(dir);
  if (hit && Date.now() - hit.at < ROOT_TTL) return hit.root;
  let root = dir;
  try {
    const { stdout } = await run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: dir, timeout: 2000 });
    root = rootFromCommonDir(stdout.trim(), dir);
  } catch { /* not a repository — the room is named after the directory */ }
  roots.set(dir, { at: Date.now(), root });
  return root;
}

// A synchronous read of the same cache. Needed because the room name is asked
// for from synchronous code in three places while git is an async call: the
// cache warms once per snapshot, reads instantly, and until the first warm-up
// the room is named after the directory — as it was before this change.
export const repoRootCached = (dir) => (roots.get(dir) || {}).root || dir;

// The order here is the priority: the first manifest that could name the stack
// answers for the version too. A file higher in the list beats everything below
// it — otherwise a monorepo with a package.json and a pyproject.toml answers
// according to the filesystem's mood.
export const MANIFESTS = [
  'package.json', 'pubspec.yaml', 'Cargo.toml', 'pyproject.toml',
  'go.mod', 'Gemfile', 'composer.json', 'Package.swift', 'build.gradle.kts',
];

// Dependency → what it is called on the sign. Checked in order, because next
// drags react along and nuxt drags vue: the more specific one wins.
const JS_FRAMEWORKS = [
  ['next', 'Next'], ['nuxt', 'Nuxt'], ['@remix-run/react', 'Remix'],
  ['@angular/core', 'Angular'], ['astro', 'Astro'], ['@sveltejs/kit', 'SvelteKit'],
  ['react-native', 'React Native'], ['electron', 'Electron'], ['expo', 'Expo'],
  ['svelte', 'Svelte'], ['vue', 'Vue'], ['react', 'React'],
  ['express', 'Express'], ['fastify', 'Fastify'],
];

const PY_FRAMEWORKS = [
  ['django', 'Django'], ['fastapi', 'FastAPI'], ['flask', 'Flask'], ['torch', 'PyTorch'],
];

// The framework's major — "Next 16" says more than "Next". Ranges and prefixes
// (^16.1.2, ~2.0, >=4) reduce to the first number; workspace:*, link: and git
// references contain no number at all, and then the bare name is what is left.
const major = (spec) => {
  const m = /(\d+)/.exec(String(spec || ''));
  return m ? ` ${m[1]}` : '';
};

// Checked with `in` rather than by truthiness: for Python dependencies the
// version is not parsed and the value is empty, but the dependency is there.
const firstDep = (deps, table) => {
  for (const [dep, label] of table) if (dep in deps) return label + major(deps[dep]);
  return null;
};

// A manifest version comes as an empty string, as zero and as "0.0.0" — the
// last one is what project generators write, and on the sign it looks like a
// real version while it means exactly "nobody filled this in".
// The "v" is prepended to a number only. The tag `ios/1.0.0-build21` is a
// version too, and "vios/1.0.0-build21" on the sign reads as a typo: seen on
// 29 August 2026 on the first run against live projects.
const usableVersion = (v) => {
  const s = String(v ?? '').trim().replace(/^v(?=\d)/, '');
  if (!s || s === '0.0.0' || s === '0.0.0-0') return null;
  return /^\d/.test(s) ? 'v' + s : s;
};

// A key = value from top-level toml/yaml, without parsing the whole format:
// one line is needed, and pulling a parser into a dependency-free project for
// it is not on.
const topLevel = (text, key) => {
  const re = new RegExp(`^${key}\\s*[:=]\\s*["']?([^"'\\n#]+)`, 'm');
  const m = re.exec(text);
  return m ? m[1].trim() : null;
};

// Parsing one manifest. A pure function of the text — which is why this module
// is testable without a filesystem.
export function readManifest(file, text) {
  try {
    if (file === 'package.json') {
      const p = JSON.parse(text);
      const deps = { ...(p.dependencies || {}), ...(p.devDependencies || {}) };
      return { version: usableVersion(p.version), stack: firstDep(deps, JS_FRAMEWORKS) || 'Node' };
    }
    if (file === 'pubspec.yaml') {
      // 1.2.3+45 — the "+45" is a store build number, and the sign does not need it
      const v = usableVersion((topLevel(text, 'version') || '').split('+')[0]);
      return { version: v, stack: /^\s*flutter\s*:/m.test(text) ? 'Flutter' : 'Dart' };
    }
    if (file === 'Cargo.toml') {
      return { version: usableVersion(topLevel(text, 'version')), stack: /tauri/.test(text) ? 'Tauri' : 'Rust' };
    }
    if (file === 'pyproject.toml') {
      // Dependencies in a pyproject sit in three shapes (PEP 621, poetry, pdm)
      // and all three write the package name as the first word of the line or
      // the first in quotes. We look for names, not for a substring: "django"
      // also turns up in the project description, in the repository url and in
      // the package's own name.
      const deps = {};
      for (const m of text.matchAll(/(?:^\s*|["'])([a-zA-Z][a-zA-Z0-9_.-]*)\s*(?:[=><~^!]|["']\s*[:=])/gm)) {
        deps[m[1].toLowerCase()] = '';
      }
      return { version: usableVersion(topLevel(text, 'version')), stack: firstDep(deps, PY_FRAMEWORKS) || 'Python' };
    }
    if (file === 'go.mod') return { version: null, stack: 'Go' };
    if (file === 'Gemfile') return { version: null, stack: /rails/.test(text) ? 'Rails' : 'Ruby' };
    if (file === 'composer.json') {
      const p = JSON.parse(text);
      const deps = { ...(p.require || {}), ...(p['require-dev'] || {}) };
      return { version: usableVersion(p.version), stack: deps['laravel/framework'] ? 'Laravel' : 'PHP' };
    }
    if (file === 'Package.swift') return { version: null, stack: 'Swift' };
    if (file === 'build.gradle.kts') return { version: usableVersion(topLevel(text, 'version')), stack: 'Kotlin' };
  } catch { /* a broken manifest is the same emptiness as a missing one */ }
  return null;
}

// The first manifest from MANIFESTS that could be read at all. It may hold no
// version — that is a separate case, and git fills it in.
export function pickManifest(found) {
  for (const file of MANIFESTS) {
    if (found[file] == null) continue;
    const info = readManifest(file, found[file]);
    if (info && info.stack) return { file, ...info };
  }
  return null;
}

// ------------------------------------------------------------- from the disk

const TTL = 5 * 60_000;
const cache = new Map(); // dir -> { at, info }

async function readRoot(dir) {
  const found = {};
  await Promise.all(MANIFESTS.map(async (f) => {
    try { found[f] = await fsp.readFile(path.join(dir, f), 'utf8'); } catch { /* not there, fine */ }
  }));
  return found;
}

// The fallback for when there is a manifest but no version in it (go.mod,
// Gemfile) — or no manifest at all. The tag without the commits on top of it,
// hence --abbrev=0: a long "v1.2.3-14-gdeadbee" does not fit on a sign thirty
// pixels wide.
async function gitTag(dir) {
  try {
    const { stdout } = await run('git', ['describe', '--tags', '--abbrev=0'], { cwd: dir, timeout: 2000 });
    return usableVersion(stdout.trim());
  } catch {
    return null;
  }
}

// { version, stack } for a repository root. The two halves are independent: a
// version found without a stack returns just the version. Nothing found returns
// an empty object, and the sign stays exactly as it was: an invented v0.0.0 is
// worse than nothing, because it looks like the truth.
export async function projectInfo(dir) {
  if (!dir) return {};
  const hit = cache.get(dir);
  if (hit && Date.now() - hit.at < TTL) return hit.info;

  const picked = pickManifest(await readRoot(dir));
  const info = {};
  // Whether this is a repository costs the same as the stack and shares its
  // cache: one call per directory every five minutes. The answer decides
  // whether a tree grows in the room; a room without git keeps its ordinary
  // plant.
  info.git = await hasRepo(dir);
  if (picked?.stack) info.stack = picked.stack;
  const version = picked?.version || await gitTag(dir);
  if (version) info.version = version;

  cache.set(dir, { at: Date.now(), info });
  return info;
}
