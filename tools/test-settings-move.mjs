// node tools/test-settings-move.mjs — переезд настроек из каталога кода в
// пользовательский конфиг.
//
// Настройки лежали рядом с кодом до 30 августа 2026. Пока офис ставился через
// git clone, это было незаметно; с доставкой приложением каталог кода
// становится сменным — обновление версии заменяет его целиком. А внутри имена
// агентов (в живом файле их было 157), рассадка и токен Figma. Обновление
// молча переименовало бы весь офис, и это ровно тот сорт поломки, который
// никто не заметит до следующего входа.
//
// Проверяется здесь одно: что переезд НИЧЕГО не теряет. Старый файл остаётся
// на месте, новый не перезаписывается, а когда есть оба — не выбирается
// молча ни один.
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// VALEY_SETTINGS перебивает и VALEY_CONFIG_DIR, и всё остальное: это «весь файл
// в сторону» одной переменной. Стенд заводит себе временный каталог, но если
// переменная досталась ему из окружения — а она достаётся, когда в соседнем
// ворктри поднимали офис своей командой, — тест проверяет чужой файл и падает
// на ровном месте. Найдено 2 сентября 2026: переезд «не состоялся», потому что
// на новом месте лежал файл другой ветки.
delete process.env.VALEY_SETTINGS;

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

// fileURLToPath, а не url.pathname: в пути проекта есть пробел, и pathname
// оставляет его как %20 — файл тогда ищется рядом с несуществующим каталогом.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LEGACY = path.join(ROOT, '.settings.json');
const legacyExisted = await fsp.readFile(LEGACY, 'utf8').catch(() => null);

// VALEY_SETTINGS уводит файл настроек целиком в сторону — и AGENTS.md прямо
// велит ставить его каждому воркtree. Со включённой переменной этот стенд
// проверял чужой файл и падал так, будто сломан переезд: 1 сентября 2026 на
// этом потерялось время, хотя код был ни при чём. Стенд отвечает за свои
// временные каталоги, поэтому переменную снимает с себя сам.
delete process.env.VALEY_SETTINGS;

const fresh = async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-cfg-'));
  process.env.VALEY_CONFIG_DIR = dir;
  const mod = await import('../server/settings.js?' + Math.random());
  return { dir, mod };
};
const writeLegacy = (o) => fsp.writeFile(LEGACY, JSON.stringify(o, null, 2));

const SAMPLE = { lang: 'en', names: { 's1': 'Петя', 's2': 'Лиза' }, secrets: { token: 'СЕКРЕТ' } };

// ---------------------------------------------- переезд со старого места
{
  await writeLegacy(SAMPLE);
  const { dir, mod } = await fresh();
  const r = await mod.migrateSettings();
  ok('переезд состоялся', r.done === true, r);
  const moved = JSON.parse(await fsp.readFile(path.join(dir, 'settings.json'), 'utf8'));
  ok('имена доехали целиком', JSON.stringify(moved.names) === JSON.stringify(SAMPLE.names), moved.names);
  ok('токен доехал', moved.secrets.token === 'СЕКРЕТ');
  const still = await fsp.readFile(LEGACY, 'utf8').catch(() => null);
  ok('старый файл остался на месте', still !== null);
  const s = await mod.getSettings();
  ok('офис читает перенесённые имена', s.names.s1 === 'Петя', s.names);
}

// ------------------------------------- на новом месте уже есть свои данные
{
  await writeLegacy(SAMPLE);
  const { dir, mod } = await fresh();
  const mine = { lang: 'ru', names: { 's9': 'Марк' }, secrets: { token: 'МОЙ' } };
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'settings.json'), JSON.stringify(mine));
  const r = await mod.migrateSettings();
  ok('когда есть оба — переезд не делается', r.done === false && r.reason === 'both', r);
  const after = JSON.parse(await fsp.readFile(path.join(dir, 'settings.json'), 'utf8'));
  ok('существующий конфиг не затёрт', after.secrets.token === 'МОЙ', after.secrets);
  ok('и его имена целы', after.names.s9 === 'Марк', after.names);
}

// ------------------------------------------------- переносить нечего
{
  await fsp.rm(LEGACY, { force: true });
  const { mod } = await fresh();
  const r = await mod.migrateSettings();
  ok('без старого файла переезд молчит', r.done === false && r.reason === 'nothing-to-move', r);
  const s = await mod.getSettings();
  ok('и настройки берутся по умолчанию', s.lang === 'ru' && Object.keys(s.names).length === 0, s.lang);
}

// ------------------------------------------------------- битый старый файл
{
  await fsp.writeFile(LEGACY, '{ это не json');
  const { dir, mod } = await fresh();
  let threw = false;
  try { await mod.migrateSettings(); } catch { threw = true; }
  ok('битый файл не переносится', threw === true);
  const made = await fsp.readFile(path.join(dir, 'settings.json'), 'utf8').catch(() => null);
  ok('и мусор на новом месте не создаётся', made === null);
  const s = await mod.getSettings();
  ok('офис при этом поднимается на умолчаниях', s.lang === 'ru');
}

// вернуть дерево ровно в то состояние, в каком тест его застал
await fsp.rm(LEGACY, { force: true });
if (legacyExisted !== null) await fsp.writeFile(LEGACY, legacyExisted);

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
