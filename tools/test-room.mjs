// node tools/test-room.mjs — комната как проект, а не как рабочая копия.
//
// Проверяется на настоящем репозитории с настоящим worktree: разбор строки
// git можно написать красиво и всё равно промахнуться, потому что `git
// rev-parse` отвечает по-разному из основного чекаута и из worktree. Тест
// поднимает и то и другое во временном каталоге — секунда работы против
// девяти комнат на четыре проекта.
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

// ------------------------------------------------- разбор ответа git

ok('обычный .git → каталог рядом с ним',
   rootFromCommonDir('/tmp/repo/.git', '/tmp/repo/wt') === '/tmp/repo');
ok('голый repo.git → сам репозиторий',
   rootFromCommonDir('/tmp/repo.git', '/tmp/x') === '/tmp/repo');
ok('косая черта на хвосте не ломает',
   rootFromCommonDir('/tmp/repo/.git/', '/tmp/x') === '/tmp/repo');
ok('git промолчал — остаётся свой каталог',
   rootFromCommonDir('', '/tmp/whatever') === '/tmp/whatever');

// ------------------------------------------------- настоящий worktree

// realpath: на macOS os.tmpdir() — это /var, симлинк на /private/var, и git
// отвечает развёрнутым путём. Сравнивать надо с тем же, иначе тест падает на
// разнице, которой в имени комнаты всё равно нет.
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

// worktree внутри репозитория — так их кладёт Claude Code
const inside = path.join(repo, '.claude', 'worktrees', 'some-topic-ab12cd');
await git(['worktree', 'add', '-q', '-b', 'topic-inside', inside], repo);
// и снаружи — так советует AGENTS.md
const outside = path.join(tmp, 'my-project-topic');
await git(['worktree', 'add', '-q', '-b', 'topic-outside', outside], repo);

ok('основной чекаут — сам себе корень', await repoRoot(repo) === repo, await repoRoot(repo));
ok('worktree внутри репозитория ведёт в корень', await repoRoot(inside) === repo, await repoRoot(inside));
ok('worktree снаружи тоже ведёт в корень', await repoRoot(outside) === repo, await repoRoot(outside));

const notGit = path.join(tmp, 'just-a-folder');
await fsp.mkdir(notGit);
ok('не репозиторий — остаётся своим каталогом', await repoRoot(notGit) === notGit, await repoRoot(notGit));

// ------------------------------------------------- этаж: одна комната

// Ровно то, что видно глазами: три сессии одного репозитория дают одну
// комнату на троих, а не три комнаты по одному человеку.
const roomOf = async (cwd) => path.basename(await repoRoot(cwd));
const agents = [
  { id: 'a', name: 'Гоша', project: await roomOf(repo), status: 'working' },
  { id: 'b', name: 'Ася', project: await roomOf(inside), status: 'working' },
  { id: 'c', name: 'Петя', project: await roomOf(outside), status: 'idle' },
];
ok('все три сессии зовут комнату одинаково',
   new Set(agents.map((a) => a.project)).size === 1, agents.map((a) => a.project));

const plan = buildLayout(agents, {});
// Считаем комнаты проектов, а не всё подряд: с тех пор как этот стенд писался,
// этаж оброс служебными — пультовая, переговорка, оранжерея, — и они к вопросу
// «сколько комнат у одного репозитория» отношения не имеют.
ok('на этаже одна комната проекта', plan.projectRooms.length === 1, plan.projectRooms.map((r) => r.title));
ok('и в ней три стола', plan.rooms[0]?.desks.length === 3, plan.rooms[0]?.desks.length);
ok('и все трое за ними', plan.rooms[0]?.agents.length === 3, plan.rooms[0]?.agents);
ok('комната названа репозиторием', plan.rooms[0]?.title === 'my-project', plan.rooms[0]?.title);

await fsp.rm(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
