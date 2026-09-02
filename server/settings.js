// Small persisted settings blob. Lives in the user's config directory, NOT next
// to the code.
//
// Оно лежало рядом с кодом до 30 августа 2026, и это работало ровно пока
// единственным способом доставки был git clone. Как только офис уезжает
// приложением или пакетом, каталог с кодом становится чужим и сменным: при
// обновлении версии он заменяется целиком. А в этом файле — имена агентов
// (сессия -> имя), рассадка и ключи подключённых сервисов. То есть обновление молча
// переименовывало бы весь офис и роняло мольберт, а секрет оставался бы
// лежать в кеше пакетного менеджера.
//
// Каталог свой, не `~/.claude`: офис сегодня читает состояние оттуда, но это
// источник данных, а не наш дом, и оркестратор со временем может быть другим.
import fsp from 'node:fs/promises';
import { moduleDefaults, moduleMerge, modulePublic } from './modules.js';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Каталог настроек. VALEY_CONFIG_DIR — для тестов и для тех, кто держит
// конфиги не по XDG.
const CONFIG_DIR = process.env.VALEY_CONFIG_DIR
  || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'valey');
// VALEY_SETTINGS уводит весь файл в сторону целиком: так стенд не переписывает
// настройки офиса, в котором вы работаете, — а он их переписал бы, потому что
// токен хозяина заводится при первом же запуске. Пригодится и для второго
// офиса на одной машине.
const FILE = process.env.VALEY_SETTINGS || path.join(CONFIG_DIR, 'settings.json');
// Файл со старого места. Он НЕ удаляется и не переписывается никогда: это
// единственная копия имён и токена у тех, кто обновится, и цена ошибки тут —
// чужие данные, а не наши.
const LEGACY = path.join(ROOT, '.settings.json');

export const PATHS = { dir: CONFIG_DIR, file: FILE, legacy: LEGACY };

const exists = async (f) => { try { await fsp.access(f); return true; } catch { return false; } };

// Разовый переезд: старый файл копируется на новое место и остаётся лежать
// где лежал. Если на новом месте уже что-то есть — не трогаем ничего и
// говорим об этом вслух: молча выбрать один из двух файлов с именами
// агентов значит потерять половину офиса без единого сообщения.
export async function migrateSettings() {
  const hasNew = await exists(FILE);
  const hasOld = await exists(LEGACY);
  if (hasNew) return hasOld ? { done: false, reason: 'both', file: FILE, legacy: LEGACY } : { done: false, reason: 'new-only' };
  if (!hasOld) return { done: false, reason: 'nothing-to-move' };
  const raw = await fsp.readFile(LEGACY, 'utf8');
  JSON.parse(raw);                                   // битый файл не переносим
  await fsp.mkdir(path.dirname(FILE), { recursive: true });
  await fsp.writeFile(FILE, raw, { flag: 'wx' });    // wx — не перезаписать гонкой
  return { done: true, reason: 'moved', file: FILE, legacy: LEGACY };
}

// Умолчания модулей приезжают сюда же, но функцией, а не константой: модули
// поднимаются при старте сервера, и снимок, снятый на разборе файла, был бы
// пуст. Ключи модуля лежат в общем файле рядом с остальными — отдельного
// файла настроек у модуля нет, иначе их станет столько же, сколько модулей.
const withModules = () => ({ ...DEFAULTS, ...moduleDefaults() });

const DEFAULTS = {
  weather: { enabled: false, lat: null, lon: null, label: '' },
  // язык интерфейса. Живёт здесь, а не в браузере: переключатель стоит в
  // коридоре, и его щелчок должен доехать до всех открытых вкладок сразу
  lang: 'ru',
  // how much a delivered task is allowed to do on its own
  delivery: { mode: 'acceptEdits' },
  // Кто в офисе хозяин и открыт ли он наружу.
  //
  // token — настоящий секрет этого файла: он и есть право
  // раздавать задания. Наружу не отдаётся, см. publicSettings ниже.
  //
  // mode: 'private' — офис ваш, и всё, что пришло с этой же машины, считается
  // хозяйским: так офис вёл себя всегда, и локальная работа не меняется.
  // 'shared' — этот сокращённый путь выключается, и хозяином считается только
  // тот, кто предъявил token. Переключать надо ДО того, как офис станет виден
  // снаружи: туннель работает с этой же машины, и для сервера его гость
  // выглядит как вы.
  // invites — выданные приглашения: { code, name, from, at, usedAt, guest }.
  // Живут на диске, потому что ссылку отправляют в мессенджер и открывают
  // позже: приглашение, умирающее с перезапуском сервера, бесполезно.
  access: { mode: 'private', token: '', invites: [] },
  // Дресс-код этажа: 'casual' — как рисовалось всегда, 'office' — светлый верх,
  // галстуки, пиджаки и юбки. Настройка офиса, а не браузера: переодеваются
  // все вкладки сразу, как и с погодой.
  dress: { code: 'casual' },
  // Оранжерея. Общая на офис, как имена и рассадка: полил ты — увидят все.
  // pots: индекс горшка -> { wateredAt, streak }. Четыре полива в лейке —
  // столько же, сколько в web/garden.js CAN_FULL; сюда его не импортировать,
  // сервер про web/ ничего не знает.
  garden: { pots: {}, can: { left: 4 } },
  // sessionId -> name, so an agent keeps the face and the name you learned
  names: {},
  // sessionId -> { project, i }: чей стол какой. Живёт на диске, чтобы место
  // пережило перезапуск сервера и F5 — пока агент здесь, он сидит там же.
  seats: {},
};

let cache = null;

// Токен заводится один раз и живёт в файле. Без него офис не отличает хозяина
// от гостя, поэтому он должен существовать раньше первого запроса.
export async function ownerToken() {
  const s = await getSettings();
  if (!s.access.token) await patchSettings({ access: { ...s.access, token: crypto.randomUUID() } });
  return (await getSettings()).access.token;
}

export async function getSettings() {
  if (cache) return cache;
  try {
    const m = await migrateSettings();
    if (m.done) console.log(`Настройки переехали в ${m.file}; старый файл оставлен на месте.`);
    // Два файла — единственный случай, когда офис может тихо потерять половину
    // имён. Сказать вслух дешевле, чем угадать.
    if (m.reason === 'both') console.log(`Настройки есть и в ${m.file}, и в ${m.legacy}. Взят первый; второй не тронут.`);
  } catch (e) { console.log(`Настройки не переехали: ${e.message}. Старый файл цел.`); }
  try {
    const saved = JSON.parse(await fsp.readFile(FILE, 'utf8'));
    // Мерж поверхностный ровно на один уровень вглубь: файл, записанный до
    // появления нового ключа, иначе прячет его целиком. На этом молча
    // отвалился мольберт: в файле лежала половина его секции, и комната
    // решила, что файл для неё не настроен. Сам мольберт с тех пор уехал в
    // модуль, а правило осталось — оно про любую секцию, не про его.
    const base = withModules();
    cache = { ...base, ...saved };
    for (const [k, v] of Object.entries(base)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) cache[k] = { ...v, ...(saved[k] || {}) };
    }
  } catch {
    cache = structuredClone(withModules());
    // seed from the old env-var way, if it is still around
    const spec = process.env.AI_VALEY_WEATHER || '';
    const [lat, lon] = spec.split(',').map((v) => Number(v.trim()));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      cache.weather = { enabled: true, lat, lon, label: `${lat.toFixed(2)}, ${lon.toFixed(2)}` };
    }
  }
  return cache;
}

export async function patchSettings(patch) {
  const s = await getSettings();
  cache = {
    ...s, ...patch,
    weather: { ...s.weather, ...(patch.weather || {}) },
    delivery: { ...s.delivery, ...(patch.delivery || {}) },
    // Токен хозяина — по той же причине: страница его не видела, и первое же
    // сохранение настроек стёрло бы право раздавать задания.
    access: {
      ...s.access, ...(patch.access || {}),
      token: (patch.access || {}).token || s.access.token,
      // Список приглашений заменяется целиком: погашенное должно исчезать, а
      // слияние по ключам удалять не умеет — та же причина, что у names.
      invites: (patch.access || {}).invites || s.access.invites || [],
    },
    // names и seats заменяются целиком по одной причине: ушедшая сессия должна
    // освобождать и стол, и имя, а слияние по ключам удалять записи не умеет.
    // Имена мержились до 30 августа 2026 — из-за этого пул в пятьдесят имён
    // кончился на пятьдесят первой сессии и не восстанавливался никогда.
    names: patch.names || s.names,
    seats: patch.seats || s.seats,
    // Модули — последними: их фрагмент кладётся поверх, потому что про свои
    // ключи они знают то, чего не знает ядро.
    ...moduleMerge(s, patch),
  };
  await fsp.mkdir(path.dirname(FILE), { recursive: true });
  await fsp.writeFile(FILE, JSON.stringify(cache, null, 2));
  return cache;
}

// Всё, что можно показать странице. Токен сюда не попадает никогда: настройки
// уходят в браузер и SSE-потоком каждые 2.5 секунды, а на странице живут
// чужие iframe — приёмник модуля радио и песочница для чужого HTML.
export function publicSettings(s) {
  // Токен хозяина не отдаётся никогда и никому: страница гостя читает эти
  // настройки тем же запросом, что и страница хозяина.
  // Ни токена хозяина, ни кодов приглашений, ни выданных гостевых токенов:
  // эти настройки читает страница гостя тем же запросом, что и страница
  // хозяина. Наружу уходит только то, что и так видно — режим и сколько
  // приглашений висит невостребованными.
  const { token: owner, invites = [], ...access } = s.access || {};
  return {
    ...s,
    ...modulePublic(s),
    access: { ...access, pending: invites.filter((i) => !i.usedAt).length },
  };
}
