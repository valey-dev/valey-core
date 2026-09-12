// node tools/test-claim.mjs — taking and giving back backlog items, on a
// backlog that lives in a temporary directory.
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse, take, drop, fields, dateOf, EMPTY } from './claim.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log('  ok   ' + name);
  else { failed++; console.log('  FAIL ' + name + (detail ? '\n       ' + detail : '')); }
};

const BACKLOG = `# Backlog

Intro.

## В работе

Взятые пункты обоих бэклогов.

Формат: \`репозиторий · пункт первыми словами · ветка · дата\`.

${EMPTY}

## Bugs

- a bug that must never move
`;

console.log('claim');

// ------------------------------------------------------------------ the text
{
  const f = fields('- ядро · радио: станции · потоку · radio-stream · 12 сентября 2026');
  check('an item with " · " inside keeps it', f.repo === 'ядро' && f.item === 'радио: станции · потоку' && f.branch === 'radio-stream',
    JSON.stringify(f));

  const one = take(BACKLOG, { repo: 'ядро', item: 'радио: интернет-станции', branch: 'radio-stream', date: '12 сентября 2026' });
  check('the first claim replaces the placeholder', one.ok && !one.text.includes(EMPTY) && one.text.includes('- ядро · радио: интернет-станции · radio-stream'));
  check('nothing outside the section moves', one.text.endsWith('## Bugs\n\n- a bug that must never move\n'));

  const two = take(one.text, { repo: 'Модули', item: 'Mixpanel: релизы на графике', branch: 'metrics-insights', date: '12 сентября 2026' });
  const p = parse(two.text);
  check('the next claim goes after the last one', p.claims.length === 2 && p.claims[1].branch === 'metrics-insights');

  const same = take(two.text, { repo: 'ядро', item: 'Радио', branch: 'other', date: 'x' });
  check('a claim already taken is refused, naming the line', !same.ok && same.taken.branch === 'radio-stream');
  const sameBranch = take(two.text, { repo: 'ядро', item: 'something else', branch: 'metrics-insights', date: 'x' });
  check('so is a second claim on the same branch', !sameBranch.ok);
  const yo = take(two.text, { repo: 'ядро', item: 'MIXPANEL — релизы', branch: 'b', date: 'x' });
  check('case, the Russian yo and punctuation do not hide a clash', !yo.ok, JSON.stringify(yo.taken || {}));

  const d1 = drop(two.text, 'radio-stream');
  check('drop by branch', d1.ok && d1.dropped.length === 1 && parse(d1.text).claims.length === 1);
  const d2 = drop(d1.text, 'mixpanel');
  check('dropping the last claim brings the placeholder back', d2.ok && d2.text.includes(EMPTY) && parse(d2.text).claims.length === 0);
  check('and the file is what it was', d2.text.replace(/\n{3,}/g, '\n\n') === BACKLOG.replace(/\n{3,}/g, '\n\n'),
    JSON.stringify(d2.text.slice(0, 200)));

  const many = drop(take(one.text, { repo: 'ядро', item: 'радиоточка', branch: 'radio2', date: 'x' }).text, 'радио');
  check('a drop that matches two lines is refused', !many.ok && many.many.length === 2);
  check('the date is written the way the section writes it', /^\d{1,2} [а-я]+ \d{4}$/.test(dateOf()), dateOf());
}

// ------------------------------------------------------------------ the tool
{
  const dir = mkdtempSync(path.join(tmpdir(), 'valey-claim-'));
  const file = path.join(dir, 'BACKLOG.md');
  writeFileSync(file, BACKLOG);
  const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), 'claim.mjs');
  const run = (...args) => new Promise((resolve) => {
    const p = spawn(process.execPath, [tool, ...args], { env: { ...process.env, VALEY_BACKLOG: file }, cwd: dir });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code, out, err }));
  });

  const a = await run('take', 'радио: станции', '--branch', 'radio-stream', '--repo', 'ядро');
  check('take from the command line', a.code === 0 && readFileSync(file, 'utf8').includes('- ядро · радио: станции · radio-stream'), a.err);
  const b = await run('take', 'Радио', '--branch', 'other', '--repo', 'ядро');
  check('a taken item exits 1 and says by whom', b.code === 1 && b.err.includes('radio-stream'));
  const noBranch = await run('take', 'something');
  check('no branch (not a checkout) is refused, not guessed', noBranch.code === 2, noBranch.err);

  // Ten sessions claiming at once: every one lands, none overwrites another.
  const many = await Promise.all(Array.from({ length: 10 }, (_, i) => run('take', `пункт ${i}`, '--branch', `b${i}`, '--repo', 'ядро')));
  const claims = parse(readFileSync(file, 'utf8')).claims;
  check('ten claims at once, ten lines', many.every((r) => r.code === 0) && claims.length === 11,
    `${claims.length} lines; ${many.filter((r) => r.code).map((r) => r.err).join(' | ')}`);

  const list = await run();
  check('the list names every claim', list.code === 0 && list.out.includes('11. ') && list.out.includes('radio-stream'));
  const gone = await run('drop', 'radio-stream');
  check('drop from the command line', gone.code === 0 && !readFileSync(file, 'utf8').includes('radio-stream'));
  const none = await run('drop', 'nothing-like-this');
  check('dropping what is not there exits 1', none.code === 1);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
