// node tools/test-room.mjs — a room is a project, not a working copy.
//
// Checked against a real repository with a real worktree: parsing git's answer
// can be written beautifully and still miss, because `git rev-parse` answers
// differently from the main checkout and from a worktree. The test raises both
// in a temp directory — a second of work against nine rooms for four projects.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { repoRoot, rootFromCommonDir } from '../server/stack.js';
import { buildLayout } from '../web/layout.js';

const run = promisify(execFile);
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

// ------------------------------------------------- parsing git's answer

ok('обычный .git → каталог рядом с ним',
   rootFromCommonDir('/tmp/repo/.git', '/tmp/repo/wt') === '/tmp/repo');
ok('голый repo.git → сам репозиторий',
   rootFromCommonDir('/tmp/repo.git', '/tmp/x') === '/tmp/repo');
ok('косая черта на хвосте не ломает',
   rootFromCommonDir('/tmp/repo/.git/', '/tmp/x') === '/tmp/repo');
ok('git промолчал — остаётся свой каталог',
   rootFromCommonDir('', '/tmp/whatever') === '/tmp/whatever');

// ------------------------------------------------- a real worktree

// realpath: on macOS os.tmpdir() is /var, a symlink to /private/var, and git
// answers with the resolved path. The comparison has to use the same, or the
// test fails on a difference the room name does not have anyway.
const tmp = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'ai-valey-room-')));
const repo = path.join(tmp, 'my-project');
await fsp.mkdir(repo);
const git = (args, cwd) => run('git', args, { cwd });
await git(['init', '-q', '-b', 'main'], repo);
await git(['config', 'user.email', 't@t'], repo);
await git(['config', 'user.name', 'test'], repo);
await fsp.writeFile(path.join(repo, 'readme.md'), '# hi\n');
await git(['add', '-A'], repo);
await git(['commit', '-qm', 'first'], repo);

// a worktree inside the repository — that is where Claude Code puts them
const inside = path.join(repo, '.claude', 'worktrees', 'some-topic-ab12cd');
await git(['worktree', 'add', '-q', '-b', 'topic-inside', inside], repo);
// and outside it — that is what AGENTS.md advises
const outside = path.join(tmp, 'my-project-topic');
await git(['worktree', 'add', '-q', '-b', 'topic-outside', outside], repo);

ok('основной чекаут — сам себе корень', await repoRoot(repo) === repo, await repoRoot(repo));
ok('worktree внутри репозитория ведёт в корень', await repoRoot(inside) === repo, await repoRoot(inside));
ok('worktree снаружи тоже ведёт в корень', await repoRoot(outside) === repo, await repoRoot(outside));

const notGit = path.join(tmp, 'just-a-folder');
await fsp.mkdir(notGit);
ok('не репозиторий — остаётся своим каталогом', await repoRoot(notGit) === notGit, await repoRoot(notGit));

// ------------------------------------------------- the floor: one room

// Exactly what is visible by eye: three sessions of one repository make one room
// for the three of them, not three rooms with one person each.
const roomOf = async (cwd) => path.basename(await repoRoot(cwd));
const agents = [
  { id: 'a', name: 'Гоша', project: await roomOf(repo), status: 'working' },
  { id: 'b', name: 'Ася', project: await roomOf(inside), status: 'working' },
  { id: 'c', name: 'Петя', project: await roomOf(outside), status: 'idle' },
];
ok('все три сессии зовут комнату одинаково',
   new Set(agents.map((a) => a.project)).size === 1, agents.map((a) => a.project));

const plan = buildLayout(agents, {});
// We count project rooms rather than everything: since this stand was written
// the floor has grown service rooms — the control room, the meeting room, the
// greenhouse — and they have nothing to do with "how many rooms does one
// repository get".
ok('на этаже одна комната проекта', plan.projectRooms.length === 1, plan.projectRooms.map((r) => r.title));
ok('и в ней три стола', plan.rooms[0]?.desks.length === 3, plan.rooms[0]?.desks.length);
ok('и все трое за ними', plan.rooms[0]?.agents.length === 3, plan.rooms[0]?.agents);
ok('комната названа репозиторием', plan.rooms[0]?.title === 'my-project', plan.rooms[0]?.title);

// --- a room from a module ---
// The `room` point is asked inside the build, before the height of the world is
// computed and the lift is assembled: a room added later would end up outside the
// floor and without a stop. The stand catches exactly that — not "was the
// function called" but whether the room made it into the world and into the lift.
const withRoom = buildLayout(agents, {
  rooms: ({ below, security }) => ({
    key: '__test', title: 'ЧИТАЛЬНЯ', service: true, draw: 'library',
    x: security.x, y: below, w: 360, h: 138, door: { x: security.x + 34, w: 36 },
    agents: [], desks: [], art: [],
  }),
});
const lib = withRoom.rooms.find((r) => r.key === '__test');
ok('комната модуля попала в список комнат', !!lib, withRoom.rooms.map((r) => r.title));
ok('мир вырос под неё, а не обрезал', lib && withRoom.h >= lib.y + lib.h, `h=${withRoom.h}`);
ok('у неё появилась остановка лифта',
  (withRoom.lift.floors || []).some((f) => (f.rooms || []).includes('ЧИТАЛЬНЯ')),
  (withRoom.lift.floors || []).map((f) => `${f.n}:${(f.rooms || []).join('/')}`));
ok('без модулей план прежний', buildLayout(agents).rooms.every((r) => r.key !== '__test'));

await fsp.rm(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
