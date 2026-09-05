// Tiny zero-dependency bridge: static files + SSE stream of the office state.
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot, fileOwners, conversation, PACK_IDS, namePool, nameSample, effectivePack, previewPack } from './agents.js';
import { realWeather, forgetWeather, geocode } from './weather.js';
import { getSettings, patchSettings, publicSettings, ownerToken } from './settings.js';
import { deliver, deliveryStatus, isBusy, MODES } from './deliver.js';
import { releaseNudge } from './release.js';
import { loadModules, moduleList, moduleRoute, moduleErrors, moduleOnPatch, moduleObserve, moduleAll, setModuleOff } from './modules.js';
import { check as checkNetwork, newToken, isLocal, proxied } from './network.js';
import { MIME, fileType, fileHeaders } from './files.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WEB = path.join(ROOT, 'web');
const MODS = path.join(ROOT, 'modules');
const PORT = Number(process.env.PORT || 5177);
const POLL_MS = 2500;

// Версия офиса — из своего package.json, а не строкой в интерфейсе: её
// показывает табличка на титульном экране, и в релизном ролике она должна
// совпадать с тегом.
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

let last = { now: 0, agents: [], version: VERSION };

// Опись словарей: сколько имён в паке и четыре образца. Не меняется никогда,
// поэтому считается один раз и уезжает вместе с настройками — панель рисует
// строку словаря сразу, не дожидаясь круга до сервера.
const PACK_LIST = PACK_IDS.map((id) => ({ id, size: namePool(id).length, sample: nameSample(id) }));

// Страховка от одной пропущенной ошибки. Обработчик ниже завёрнут в try, но
// промис, брошенный без await, туда не попадает — а без этой строки Node
// гасит процесс, и офис, к которому подключены вкладки, просто исчезает.
process.on('unhandledRejection', (err) => {
  console.error('[unhandled]', (err && err.stack) || err);
});
// Комната -> каталог на диске. Единственный способ назвать каталог для /api/git:
// клиент присылает ключ комнаты, который офис и так показывает на двери.
const cwdOfProject = (project) => {
  const a = (last.agents || []).find((x) => x.project === project && x.cwd);
  return a ? a.cwd : null;
};
const clients = new Set();
// Notes the player left, plus whatever was actually sent into a live chat.
const outbox = [];
let taskSeq = 0;

// --------------------------------------------------------------- проекция
// Что гость видит об агенте. Ровно то, что видно всякому, кто стоит рядом с
// его столом: имя, роль, комната, состояние, давность. И ничего из того, что
// агент делает: ни последней реплики, ни запроса, ни файлов, ни ветки, ни пути
// проекта — путь тут вообще чужой домашний каталог.
//
// Список белый, а не чёрный, и это не вкусовщина: снимок собирается из
// транскрипта, и следующее добавленное туда поле по чёрному списку уехало бы
// наружу молча.
const SHOWN = [
  'id', 'name', 'gender', 'project', 'seat', 'role', 'roleKey',
  'status', 'act', 'activity', 'mood', 'idleFor', 'startedAt',
  'limited', 'version', 'stack',
];

// Кому что открыли: id гостя -> Set id агентов. Живёт в памяти и только в ней —
// разрешение не должно переживать перезапуск офиса, как не переживает его
// присутствие. Хозяин, ушедший и вернувшийся, никому ничего не должен.
const grants = new Map();

const granted = (guestId, agentId) => !!(guestId && grants.get(guestId)?.has(agentId));

// Запросы доступа. Ключ — пара «гость и агент»: второй запрос от того же
// человека про того же агента заменяет первый, а не ложится рядом. Так
// «попросить снова» не превращается в способ давить.
const asks = new Map();
const askKey = (guestId, agentId) => `${guestId}:${agentId}`;

// Что видит о доступе сам гость: о чём попросил, что открыто, где отказали.
function accessForGuest(guestId) {
  const mine = [...asks.values()].filter((a) => a.guestId === guestId);
  return {
    pending: mine.filter((a) => a.state === 'pending').map((a) => a.agentId),
    refused: mine.filter((a) => a.state === 'refused').map((a) => a.agentId),
    granted: [...(grants.get(guestId) || [])],
  };
}

// Что видит хозяин: кто просит и кому уже открыто. Имя гостя берётся из
// присутствия — оно там и так есть, а второй раз спрашивать его незачем.
function accessForOwner() {
  const nameOf = (id) => (people.get(id) || {}).name || '';
  const open = [];
  for (const [guestId, set] of grants) {
    for (const agentId of set) open.push({ guestId, who: nameOf(guestId), agentId });
  }
  return {
    requests: [...asks.values()]
      .filter((a) => a.state === 'pending')
      .map((a) => ({ ...a, who: nameOf(a.guestId) })),
    open,
  };
}

function project(snapshot, guestId) {
  return {
    ...snapshot,
    access: accessForGuest(guestId),
    agents: (snapshot.agents || []).map((a) => {
      if (granted(guestId, a.id)) return a;
      const out = {};
      for (const k of SHOWN) if (a[k] !== undefined) out[k] = a[k];
      // outbox — записки на столе: их оставляет и сам гость, и они про него же.
      // Ответ агента из них вырезан тем же правилом.
      out.outbox = (a.outbox || []).map((t) => ({
        id: t.id, agentId: t.agentId, at: t.at, state: t.state, text: t.text,
      }));
      return out;
    }),
  };
}

// ------------------------------------------------------------------- хозяин
// Смотреть может кто угодно, командовать — только хозяин. Право живёт в токене
// из .settings.json; страница предъявляет его заголовком.
//
// Пока офис не объявлен общим, всё, что пришло с этой же машины, считается
// хозяйским: так офис работал всегда, и локальная работа не должна меняться
// от появления гостей. Сокращение опасное ровно в одном месте — туннель
// запускается здесь же, и его гость приходит с петли. Поэтому режим 'shared'
// надо включать ДО того, как офис станет виден снаружи, и это переключатель
// человека, а не догадка сервера.
// Наружу у приглашения нет ни кода, ни гостевого токена: панель показывает,
// кого звали и вошёл ли он, а ссылку хозяин получил в момент создания.
const safeInvite = (i) => ({
  id: i.id, name: i.name, from: i.from, at: i.at, usedAt: i.usedAt, used: !!i.usedAt,
});

async function isOwner(req) {
  const s = await getSettings();
  // Заголовок для обычных запросов, параметр — для потока. EventSource
  // заголовки ставить не умеет, и без этого хозяин в общем режиме терял
  // собственный офис: страница жива, а поток ей отказывают. Найдено 30 августа
  // 2026 первой же перезагрузкой после переключения в shared.
  //
  // Токен в строке запроса хуже, чем в заголовке, — но кука здесь хуже обоих:
  // офис живёт на одном порту с чужими вкладками того же localhost, и куку они
  // делят. Гостевой пропуск ходит тем же путём по той же причине.
  const given = req.headers['x-valey-owner']
    || new URL(req.url, 'http://localhost').searchParams.get('owner');
  if (s.access.token && given && given === s.access.token) return true;
  if (s.access.mode === 'shared') return false;
  // Пришло через посредника — значит не «с этой машины», чей бы адрес ни был в
  // сокете. Туннель (cloudflared, ngrok, любой обратный прокси) соединяется с
  // офисом с петли, и без этой проверки его гость в режиме private оказывался
  // бы хозяином: адрес совпал. Заголовки ставит сам посредник, подделать их
  // может только тот, кто и так уже внутри.
  //
  // Это не замена переключателю в shared, а страховка от того, что о нём
  // забудут: правильный порядок — сначала shared, потом туннель.
  if (proxied(req)) return false;
  return isLocal(req);
}

// Гость — тот, кто вошёл по приглашению и держит выданный ему токен. От
// хозяина отличается всем: смотреть может, командовать нет.
async function guestOf(req) {
  // Заголовок для обычных запросов, параметр — для потока: EventSource
  // заголовки ставить не умеет, а поток нужен гостю первым делом.
  const given = req.headers['x-valey-guest']
    || new URL(req.url, 'http://localhost').searchParams.get('guest');
  if (!given) return null;
  const s = await getSettings();
  return (s.access.invites || []).find((i) => i.guest && i.guest === given) || null;
}

// Кого вообще пускать на порог. В private офис открыт, как и был: он на вашей
// машине, и коллега в той же Wi-Fi заходит просто по адресу. В shared офис
// виден снаружи, и тогда смотреть может только тот, кого позвали.
async function admitted(req) {
  const s = await getSettings();
  if (s.access.mode !== 'shared') return true;
  if (await isOwner(req)) return true;
  return !!(await guestOf(req));
}

const forbidden = (res) => send(res, 403, {
  error: 'смотреть можно, командовать нельзя',
  errorKey: 'err.guest',
});

// -------------------------------------------------------------------- люди
// Кто сейчас ходит по офису. Живёт в памяти и только в ней: присутствие не
// переживает перезапуск сервера, и это правильно — человек, которого нет,
// не должен оставаться стоять.
//
// У людей свой такт, потому что общий снимок ходит раз в POLL_MS = 2.5 с. За
// это время человек проходит через полкоридора, и чужая ходьба выглядела бы
// телепортацией. Снимок тяжёлый — сессии, погода, настройки; присутствие
// лёгкое, и гонять его чаще стоит буквально ничего.
const people = new Map();
const PEOPLE_MS = 120;
const PEOPLE_TTL = 8000;

// Внешность приходит с чужой машины, поэтому просеивается здесь, а не в
// отрисовке. 30 августа 2026 человек с половиной полей уронил drawPerson на
// shade(look.shirt) — undefined вместо цвета, — и вместе с кадром пропали все,
// кто стоял в очереди ниже. Пропускаем только известные ключи и только годные
// значения: чего нет, то клиент достроит своими умолчаниями.
const HEX = /^#[0-9a-fA-F]{3,8}$/;
const LOOK_COLOURS = ['skin', 'hair', 'shirt', 'pants', 'boots'];
const LOOK_WORDS = ['head', 'face', 'hands'];

function cleanLook(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const k of LOOK_COLOURS) if (typeof src[k] === 'string' && HEX.test(src[k])) out[k] = src[k];
  for (const k of LOOK_WORDS) if (typeof src[k] === 'string' && src[k].length <= 12) out[k] = src[k];
  if (typeof src.glasses === 'boolean') out.glasses = src.glasses;
  for (const k of ['style', 'tall']) {
    if (Number.isFinite(src[k])) out[k] = Math.max(0, Math.min(4, Math.round(src[k])));
  }
  return out;
}

function livePeople(now = Date.now()) {
  for (const [id, p] of people) if (now - p.at > PEOPLE_TTL) people.delete(id);
  return [...people.values()];
}

function peopleTick() {
  const list = livePeople();
  // Одному человеку рассылать некому: он и так знает, где стоит.
  if (list.length > 1) {
    const payload = `event: people\ndata: ${JSON.stringify(list)}\n\n`;
    for (const res of clients) res.write(payload);
  }
  setTimeout(peopleTick, PEOPLE_MS);
}

async function tick() {
  try {
    // Предыдущий снимок нужен наблюдателям: событие — это разница, а не
    // состояние. Ядро само её не считает, оно только отдаёт обе стороны.
    const prev = last;
    last = await snapshot();
    last.version = VERSION;
    last.release = await releaseNudge(ROOT);
    for (const a of last.agents) a.outbox = outbox.filter((t) => t.agentId === a.id).slice(-5);
    last.weather = await realWeather();
    last.settings = publicSettings(await getSettings());
    last.delivery = await deliveryStatus();
    last.people = livePeople();
    last.access = accessForOwner();
    // Наблюдатели — до рассылки: модуль может дописать своё в снимок, и
    // клиент должен получить его в том же такте, а не через 2.5 секунды.
    await moduleObserve(last, prev);
    const full = `data: ${JSON.stringify(last)}\n\n`;
    // Гостям — по своей проекции: у каждого свой набор открытого.
    for (const res of clients) {
      res.write(res.valeyGuest ? `data: ${JSON.stringify(project(last, res.valeyGuest))}\n\n` : full);
    }
  } catch (err) {
    console.error('[tick]', err.message);
  }
  setTimeout(tick, POLL_MS);
}

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// Ошибка тела — это ответ, а не падение: код и ключ уходят клиенту из
// обёртки обработчика, и она же закрывает соединение, чтобы недочитанное тело
// не висело в сокете.
class BodyError extends Error {
  constructor(code, key, message) { super(message); this.code = code; this.key = key; }
}

// Потолок на тело. До 3 сентября 2026 его не было ни у одной ручки, включая
// открытые до входа: гигабайт в /api/enter копился в памяти до конца.
// Кадру со стенда нужно больше — он один и его шлёт только хозяин.
const BODY_MAX = 64 * 1024;
const SHOT_MAX = 16 * 1024 * 1024;

async function readBody(req, max = BODY_MAX) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) throw new BodyError(413, 'err.tooBig', 'слишком длинно');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// JSON-тело — только с заголовком application/json. Это не педантизм: запрос
// с таким заголовком браузер не пошлёт с чужого сайта без preflight, а на
// preflight офис не отвечает. Пустое тело — пустой объект, как и было.
async function readJson(req, max = BODY_MAX) {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new BodyError(415, 'err.notJson', 'нужен application/json');
  const raw = await readBody(req, max);
  if (!raw.trim()) return {};
  let b;
  try { b = JSON.parse(raw); } catch { throw new BodyError(400, 'err.badJson', 'не разобрать'); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new BodyError(400, 'err.badJson', 'ожидался объект');
  return b;
}

// ------------------------------------------------------------ чужая вкладка
// Всё с петли считается хозяйским (см. isOwner), и это доверие достаётся любой
// вкладке в том же браузере: страница чужого сайта шлёт POST на 127.0.0.1:5177,
// и сокет — петля. До 3 сентября 2026 такой POST в /api/settings менял токен
// хозяина и режим доставки, а /api/task с deliver запускал claude --resume
// с bypassPermissions. Два признака, оба ставит браузер и ни один нельзя
// подделать из скрипта:
//  - Origin и Sec-Fetch-Site: откуда пришёл запрос. Своя страница — тот же хост.
//  - Host: к кому обращались. DNS rebinding резолвит чужое имя в 127.0.0.1, и
//    тогда Origin совпадает с Host, зато Host — не наш.
// Без Origin и без Sec-Fetch-Site приходят curl, тесты и EventSource: это не
// браузерная вкладка, и здесь им верят.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i;

function hostOk(req) {
  // Через посредника имя хоста чужое по определению — туннель приходит со
  // своим публичным именем, и его запросы уже спросил о токене сетевой гейт.
  // Снаружи хост — адрес этой машины в чьей-то сети, его не перечислить.
  if (!isLocal(req)) return true;
  return LOCAL_HOST.test(req.headers.host || '');
}

function crossSite(req) {
  if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  if (origin === 'null') return true;
  let from;
  try { from = new URL(origin).host; } catch { return true; }
  // Посредник, переписывающий Host, обязан оставить настоящий в
  // X-Forwarded-Host — иначе своя же страница из туннеля окажется чужой.
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return from.toLowerCase() !== String(host).split(',')[0].trim().toLowerCase();
}

// Через эти две двери входят, поэтому они открыты всегда: иначе гость не
// сможет ни предъявить код, ни узнать, что код вообще нужен.
// /api/stand открыт вместе с ними: табличку стенда надо показать до входа,
// иначе на пустом экране непонятно, чей это офис и что на нём проверяют.
const OPEN = new Set(['/api/enter', '/api/whoami', '/api/stand']);

// Одна ошибка — один ответ 500, а не мёртвый офис. До 3 сентября 2026 битый
// JSON в /api/enter — ручке, открытой до входа, — ронял процесс вместе со
// всеми вкладками, которые его слушали.
const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (e) {
    if (e instanceof BodyError) {
      if (!res.headersSent) {
        res.setHeader('connection', 'close');
        send(res, e.code, { error: e.message, errorKey: e.key });
      }
      return;
    }
    console.error('[http]', req.method, req.url, (e && e.stack) || e);
    try {
      if (!res.headersSent) send(res, 500, { error: 'внутренняя ошибка', errorKey: 'err.internal' });
      else res.end();
    } catch { /* сокет уже закрыт */ }
  }
});

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');

  // Первый вопрос — не «кто вы», а «откуда». Гейт ниже решает, пускать ли
  // человека; этот решает, отвечать ли адресу вообще. Он стоит выше статики,
  // потому что дыра была именно в ней: без него офис отдавал страницу, поток
  // и /api/file всей сети Wi-Fi.
  const net = checkNetwork(req, url, (await getSettings()).network);
  if (!net.ok) {
    // Закрытый офис отвечает 404, а не 403: сканеру незачем знать, что по
    // этому адресу что-то живёт и просто не пускает.
    return send(res, net.reason === 'closed' ? 404 : 401, net.reason === 'closed'
      ? { error: 'not found', errorKey: 'err.notFound' }
      : { error: 'нужен токен', errorKey: 'err.needToken' });
  }
  // Токен приехал строкой в адресе — запоминаем кукой и уводим из URL, чтобы
  // секрет не остался в истории браузера и в заголовке Referer.
  if (net.setCookie) {
    res.setHeader('set-cookie', net.setCookie);
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      url.searchParams.delete('token');
      res.writeHead(302, { location: url.pathname + (url.search || '') });
      return res.end();
    }
  }

  // Чужое имя хоста на петле — rebinding. Отвечаем как закрытый офис: 404,
  // сканеру незачем знать, что тут кто-то живёт.
  if (!hostOk(req)) return send(res, 404, { error: 'not found', errorKey: 'err.notFound' });
  // Чужая вкладка меняет состояние только через не-GET: GET она и так не
  // прочитает, тот же origin ей не отдаст ответ.
  if (req.method !== 'GET' && req.method !== 'HEAD' && crossSite(req)) {
    return send(res, 403, { error: 'запрос с чужой страницы', errorKey: 'err.crossSite' });
  }

  // Гейт стоит до всех обработчиков, а не в каждом: так новый эндпоинт
  // закрыт по умолчанию, а не забыт. Статика не гейтится — страницу надо
  // показать хотя бы затем, чтобы сказать «нужен код».
  if (url.pathname.startsWith('/api/') && !OPEN.has(url.pathname) && !(await admitted(req))) {
    return send(res, 403, { error: 'нужно приглашение', errorKey: 'err.needCode' });
  }

  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive',
    });
    // Поток помнит, кто его слушает: снимок один, а видят его по-разному.
    const guest = await guestOf(req);
    const who = guest ? guest.guest : null;
    res.valeyGuest = who;
    res.write(`data: ${JSON.stringify(who ? project(last, who) : last)}\n\n`);
    // Вошедший видит тех, кто уже в офисе, сразу, а не через такт присутствия.
    res.write(`event: people\ndata: ${JSON.stringify(livePeople())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // Кто спрашивает. Страница узнаёт это раньше, чем нарисует хоть одну кнопку,
  // которой у гостя быть не должно.
  if (url.pathname === '/api/whoami') {
    const s = await getSettings();
    const guest = await guestOf(req);
    return send(res, 200, {
      owner: await isOwner(req),
      mode: s.access.mode,
      guest: !!guest,
      from: guest ? guest.from : '',
      // нужен ли код прямо сейчас: страница по этому решает, показывать ли
      // карточку «тебя позвали» или «код не годится»
      needsCode: !(await admitted(req)),
    });
  }

  // Гость просит доступ к одному агенту. Не «ко всему» и не «на время»:
  // просят про конкретного, и это же видит хозяин.
  if (url.pathname === '/api/access' && req.method === 'POST') {
    const guest = await guestOf(req);
    if (!guest) return send(res, 403, { error: 'просить может гость', errorKey: 'err.guestOnly' });
    const b = await readJson(req);
    const agentId = String(b.agentId || '');
    if (!agentId) return send(res, 400, { error: 'нужен agentId' });
    asks.set(askKey(guest.guest, agentId), {
      id: crypto.randomUUID().slice(0, 8),
      guestId: guest.guest, agentId,
      note: String(b.note || '').slice(0, 140),
      at: Date.now(), state: 'pending',
    });
    return send(res, 200, { ok: true });
  }

  // Хозяин отвечает. Отказ не стирает запрос: гость должен увидеть «нет», а не
  // тишину, — иначе он будет думать, что не дошло.
  if (url.pathname === '/api/access/answer' && req.method === 'POST') {
    if (!(await isOwner(req))) return forbidden(res);
    const b = await readJson(req);
    const ask = [...asks.values()].find((a) => a.id === b.id);
    if (!ask) return send(res, 404, { error: 'этого запроса уже нет' });
    if (b.yes) {
      if (!grants.has(ask.guestId)) grants.set(ask.guestId, new Set());
      grants.get(ask.guestId).add(ask.agentId);
      asks.delete(askKey(ask.guestId, ask.agentId));
    } else {
      ask.state = 'refused';
    }
    return send(res, 200, { ok: true, access: accessForOwner() });
  }

  // Закрыть открытое. Одной кнопкой и без подтверждения: отзыв должен быть не
  // длиннее выдачи, иначе им не пользуются.
  if (url.pathname === '/api/access/revoke' && req.method === 'POST') {
    if (!(await isOwner(req))) return forbidden(res);
    const b = await readJson(req);
    grants.get(String(b.guestId || ''))?.delete(String(b.agentId || ''));
    return send(res, 200, { ok: true, access: accessForOwner() });
  }

  // Хозяин зовёт гостя. Код длиннее, чем на макете: там в подписи стоял
  // 7f3a9c — шесть знаков, 24 бита, которые скрипт перебирает за минуты,
  // как только офис виден снаружи. Двенадцать знаков — те же полстроки в
  // ссылке и 48 бит, по которым перебором не ходят.
  if (url.pathname === '/api/invite' && req.method === 'POST') {
    if (!(await isOwner(req))) return forbidden(res);
    const b = await readJson(req);
    const s = await getSettings();
    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const invite = {
      // id — чтобы панель могла погасить приглашение, не зная кода: код
      // уходит в ссылку один раз и наружу больше не показывается.
      id: crypto.randomUUID().slice(0, 8),
      code,
      name: String(b.name || '').slice(0, 24),
      from: String(b.from || '').slice(0, 24),
      at: Date.now(), usedAt: null, guest: null,
    };
    // Приглашение и общий режим — одно действие. Пока офис private, хозяином
    // считается всё, что пришло с этой машины, а туннель работает с неё же:
    // приглашённый через туннель оказался бы хозяином. Звать, не открываясь,
    // нельзя, поэтому это не отдельный переключатель, а следствие.
    await patchSettings({
      access: { ...s.access, mode: 'shared', invites: [...(s.access.invites || []), invite] },
    });
    const host = req.headers.host || `localhost:${PORT}`;
    // Токен хозяина возвращается вместе со ссылкой — и это не послабление, а
    // условие того, чтобы приглашение вообще работало. Переход в shared гасит
    // сокращение «пришло с этой машины», и страница, которая только что была
    // хозяином по петле, следующим же запросом оказывалась гостем: человек
    // запирал себя, нажав «создать ссылку». Запрос сюда пропускает только
    // хозяин, так что отдать ему его же токен нечем не рискуем.
    return send(res, 200, {
      ok: true, invite, owner: (await getSettings()).access.token,
      url: `http://${host}/#code=${code}`,
    });
  }

  // Погасить: и невостребованную ссылку, и уже вошедшего по ней гостя. Разницы
  // в действии нет — исчезает приглашение, а с ним и выданный по нему токен.
  if (url.pathname === '/api/invite/revoke' && req.method === 'POST') {
    if (!(await isOwner(req))) return forbidden(res);
    const b = await readJson(req);
    const s = await getSettings();
    const left = (s.access.invites || []).filter((i) => i.id !== b.id);
    await patchSettings({ access: { ...s.access, invites: left } });
    return send(res, 200, { ok: true, invites: left.map(safeInvite) });
  }

  // Список для панели хозяина. Коды наружу не отдаются даже ему: ссылку он
  // получил один раз при создании, а список — чтобы видеть, кто вошёл.
  if (url.pathname === '/api/invites') {
    if (!(await isOwner(req))) return forbidden(res);
    const s = await getSettings();
    return send(res, 200, { invites: (s.access.invites || []).map(safeInvite) });
  }

  // Вход по коду. Одноразовый: сработал — погас, и второй раз по той же ссылке
  // не войти. Взамен выдаётся токен гостя, чтобы перезагрузка страницы не
  // выставляла человека за дверь.
  if (url.pathname === '/api/enter' && req.method === 'POST') {
    const b = await readJson(req);
    const s = await getSettings();
    const invites = s.access.invites || [];
    const invite = invites.find((i) => i.code === String(b.code || ''));
    if (!invite) return send(res, 403, { error: 'такого приглашения нет', errorKey: 'err.codeUnknown' });
    if (invite.usedAt) return send(res, 403, { error: 'код уже использован', errorKey: 'err.codeUsed' });
    invite.usedAt = Date.now();
    invite.guest = crypto.randomUUID();
    await patchSettings({ access: { ...s.access, invites } });
    return send(res, 200, { ok: true, guest: invite.guest, from: invite.from });
  }

  // Человек говорит, что он здесь и где именно. Наружу уходит только это:
  // имя, внешность, место и комната — то же, что видно любому, кто стоит
  // рядом. Ни транскриптов, ни путей, ни файлов тут нет и быть не может.
  if (url.pathname === '/api/here' && req.method === 'POST') {
    const raw = await readBody(req);
    if (raw.length > 2000) return send(res, 413, { error: 'слишком длинно' });
    let b;
    try { b = JSON.parse(raw); } catch { return send(res, 400, { error: 'не разобрать' }); }
    if (!b || typeof b.id !== 'string' || !b.id) return send(res, 400, { error: 'нужен id' });
    const num = (v) => (Number.isFinite(v) ? Math.round(v) : 0);
    people.set(b.id.slice(0, 64), {
      id: b.id.slice(0, 64),
      name: String(b.name || '').slice(0, 24),
      look: cleanLook(b.look),
      x: num(b.x), y: num(b.y), dir: b.dir === -1 ? -1 : 1,
      moving: !!b.moving,
      room: b.room == null ? null : String(b.room).slice(0, 64),
      at: Date.now(),
    });
    return send(res, 200, { ok: true, people: people.size });
  }

  // Ушёл честно, а не по таймауту: вкладка закрывается — место освобождается
  // сразу, без восьми секунд призрака в коридоре.
  if (url.pathname === '/api/gone' && req.method === 'POST') {
    const raw = await readBody(req);
    let b = null;
    try { b = JSON.parse(raw); } catch { /* пустое тело — тоже ответ */ }
    if (b && typeof b.id === 'string') people.delete(b.id.slice(0, 64));
    return send(res, 200, { ok: true });
  }

  // Присутствие считается на месте, а не берётся из последнего такта: снимок
  // собирается раз в 2.5 с, и за это время человек успевает войти и выйти.
  // Точечный запрос не должен врать о том, кто сейчас в комнате.
  if (url.pathname === '/api/state') {
    const guest = await guestOf(req);
    const seen = guest ? project(last, guest.guest) : last;
    // Присутствие и доступ считаются на месте: и то и другое меняется чаще,
    // чем собирается снимок, а точечный запрос не должен врать про то, кто
    // сейчас в комнате и кто чего попросил.
    return send(res, 200, {
      ...seen,
      people: livePeople(),
      access: guest ? accessForGuest(guest.guest) : accessForOwner(),
    });
  }

  // the full recent conversation of one agent, for reading in the office
  if (url.pathname === '/api/chat') {
    const id = url.searchParams.get('id') || '';
    // Разговор агента — не проекция. Гостю он открыт только по согласию, и
    // только с тем агентом, на которого согласие дали.
    const guest = await guestOf(req);
    if (guest && !granted(guest.guest, id)) {
      return send(res, 403, { error: 'этот разговор не открыт', errorKey: 'err.notGranted' });
    }
    const agent = last.agents.find((a) => a.id === id);
    if (!agent) return send(res, 404, { error: 'такого агента нет в офисе', errorKey: 'err.noSuchAgent' });
    return send(res, 200, { agent: { id, name: agent.name, title: agent.title }, messages: conversation(id) });
  }

  // Leave a note on the desk, or actually send it into the agent's chat.
  if (url.pathname === '/api/task' && req.method === 'POST') {
    try {
      const { agentId, text, deliver: wantsDelivery, mode: wantedMode, resend } = await readJson(req);
      // Записку на стол может оставить кто угодно: её увидит хозяин, когда
      // вернётся, и сам решит. Отправка в чат — другое: она запускает
      // claude --resume в живой сессии, а с bypassPermissions это терминал.
      // Смотреть можно, командовать нельзя.
      if ((wantsDelivery || resend) && !(await isOwner(req))) return forbidden(res);
      // A note already lying on the desk can be handed over to the chat as it is:
      // it moves rather than multiplies, so the desk does not keep a stale twin.
      const lying = resend
        ? outbox.find((t) => t.id === resend && t.agentId === agentId && t.state === 'note')
        : null;
      if (resend && !lying) return send(res, 400, { error: 'этой записки уже нет на столе', errorKey: 'err.noteGone' });
      const body = lying ? lying.text : text;
      if (!agentId || !body) return send(res, 400, { error: 'agentId and text required' });
      if (lying) outbox.splice(outbox.indexOf(lying), 1);
      const task = {
        id: ++taskSeq, agentId, text: String(body).slice(0, 4000),
        at: Date.now(), state: 'note', reply: null, error: null,
      };
      outbox.push(task);

      if (!wantsDelivery && !lying) {
        console.log(`[note] ${agentId}: ${task.text.slice(0, 80)}`);
        return send(res, 200, { ok: true, task, delivery: await deliveryStatus() });
      }

      const agent = last.agents.find((a) => a.id === agentId);
      if (!agent) { task.state = 'failed'; task.error = 'агента уже нет в офисе'; task.errorKey = 'err.agentGone'; return send(res, 200, { ok: true, task }); }
      const status = await deliveryStatus();
      if (!status.available) { task.state = 'failed'; task.error = status.hint; task.errorKey = status.hintKey; return send(res, 200, { ok: true, task, delivery: status }); }
      if (isBusy(agentId)) { task.state = 'failed'; task.error = 'ему уже что-то отправляется'; task.errorKey = 'err.busy'; return send(res, 200, { ok: true, task }); }

      const { delivery } = await getSettings();
      const mode = MODES.has(wantedMode) ? wantedMode : delivery.mode;
      task.state = 'sending';
      console.log(`[deliver] -> ${agent.name}: ${task.text.slice(0, 80)}`);
      deliver(task, agent, mode).catch((e) => { task.state = 'failed'; task.error = e.message; });
      return send(res, 200, { ok: true, task, delivery: status });
    } catch (e) {
      if (e instanceof BodyError) throw e;
      return send(res, 400, { error: e.message });
    }
  }

  if (url.pathname === '/api/delivery') return send(res, 200, await deliveryStatus());

  // Where the office looks out of the window, and whether it looks at all.
  if (url.pathname === '/api/settings') {
    if (req.method === 'POST') {
      // Настройки — это погода, язык, режим доставки и ключи сервисов: они общие
      // на весь офис, и менять их гостю нечего.
      if (!(await isOwner(req))) return forbidden(res);
      try {
        const patch = await readJson(req);
        const saved = await patchSettings(patch);
        forgetWeather();
        moduleOnPatch(patch);
        last.weather = await realWeather({ force: true });
        return send(res, 200, { ok: true, settings: publicSettings(saved), weather: last.weather, packs: PACK_LIST });
      } catch (e) {
        if (e instanceof BodyError) throw e;
        return send(res, 400, { error: e.message });
      }
    }
    return send(res, 200, { settings: publicSettings(await getSettings()), weather: last.weather, packs: PACK_LIST });
  }

  // City search, proxied so the page itself never talks to the outside.
  if (url.pathname === '/api/geocode') {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) return send(res, 200, { results: [] });
    try {
      return send(res, 200, { results: await geocode(q) });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }


  // Dev helper: the game posts a rendered frame, we drop it on disk to look at.
  if (url.pathname === '/api/shot' && req.method === 'POST') {
    // Кадр пишется файлом на диск хозяина. Гость может снять экран своим
    // браузером — но не класть картинки в чужую папку.
    if (!(await isOwner(req))) return forbidden(res);
    const body = await readBody(req, SHOT_MAX);
    const b64 = body.replace(/^data:image\/png;base64,/, '');
    const dir = path.join(ROOT, '.shots');
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, (url.searchParams.get('name') || 'latest').replace(/[^\w-]/g, '') + '.png');
    await fsp.writeFile(file, Buffer.from(b64, 'base64'));
    return send(res, 200, { ok: true, file });
  }

  // Serve an artifact, but only files that actually appeared in a transcript.
  if (url.pathname === '/api/file') {
    const p = url.searchParams.get('path') || '';
    const owners = fileOwners(p, last);
    if (!owners.length) return send(res, 403, { error: 'not an agent artifact' });
    // Файл принадлежит разговору: гостю он открыт ровно тогда, когда открыт
    // разговор, — тем же согласием, что и /api/chat. До 3 сентября 2026 тут
    // проверялся только сам список, и гость с любым пропуском читал всё, что
    // агент когда-либо открывал — включая Read по .env, если угадать путь.
    const guest = await guestOf(req);
    if (guest && !owners.some((id) => granted(guest.guest, id))) {
      return send(res, 403, { error: 'этот разговор не открыт', errorKey: 'err.notGranted' });
    }
    try {
      const st = await fsp.stat(p);
      if (st.size > 8 * 1024 * 1024) return send(res, 413, { error: 'too big' });
      // Показать, но не исполнить: html и svg уходят вложением, см. files.js.
      return send(res, 200, await fsp.readFile(p), fileType(p), fileHeaders(p));
    } catch {
      return send(res, 404, { error: 'gone' });
    }
  }

  // Что из модулей доехало до этой сборки. Клиент по этому списку строит
  // импорты, поэтому список — единственное, что ядро о модулях знает.
  // Как офис будет называться на каждом паке. Панель обязана показать цену
  // нажатия ДО нажатия, а посчитать её на странице нечем — словари живут здесь.
  //
  // Спрашивается только когда панель открыли. Сама по себе ручка стоит две
  // миллисекунды, но сервер однопоточный, и запрос, попавший в момент обхода
  // транскриптов, ждёт вместе со всеми — 4 секунды на этом стенде 4 сентября
  // 2026. Поэтому опись словарей (размер и образец) сюда не входит: она
  // статична и уезжает вместе с настройками, чтобы строка в панели стояла
  // сразу, а ждала только цена.
  if (url.pathname === '/api/names') {
    const s = await getSettings();
    const packs = [];
    for (const id of PACK_IDS) packs.push({ id, names: await previewPack(id) });
    return send(res, 200, { choice: s.namePack || 'auto', pack: effectivePack(s), packs });
  }

  if (url.pathname === '/api/modules') return send(res, 200, moduleList());

  // Тестовый стенд. Пустой text значит «это обычный офис» — тогда клиент
  // ничего не рисует. Ветку спрашиваем у git только здесь: в обычном запуске
  // этой ручки нет смысла, и лишний вызов наружу ни к чему.
  if (url.pathname === '/api/stand') {
    const text = process.env.VALEY_STAND || '';
    if (!text) return send(res, 200, { text: null });
    let branch = '';
    try {
      branch = execFileSync('git', ['-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch { /* не репозиторий — переживём без ветки */ }
    return send(res, 200, {
      text, branch, port: PORT,
      modules: moduleList().map((m) => m.id),
      all: moduleAll(),
      errors: moduleErrors(),
    });
  }

  // Переключатель модуля на стенде. Не в OPEN и только для хозяина: гость
  // офиса не должен уметь выключать чужие фичи. Живёт, пока жив сервер.
  if (url.pathname === '/api/stand/toggle') {
    if (!process.env.VALEY_STAND) return send(res, 404, { error: 'стенда нет' });
    if (!(await isOwner(req))) return forbidden(res);
    const body = await readJson(req);
    if (!setModuleOff(body.id, !!body.off)) return send(res, 404, { error: 'нет такого модуля' });
    return send(res, 200, { ok: true, all: moduleAll() });
  }

  // Файлы модуля. Отдельная ветка, а не WEB: папки modules/ в бесплатной
  // сборке нет вовсе, и путать её со статикой ядра значит однажды отдать
  // наружу то, чего не клали.
  if (url.pathname.startsWith('/modules/')) {
    const file = path.join(MODS, url.pathname.slice('/modules/'.length));
    if (!file.startsWith(MODS)) return send(res, 403, { error: 'nope' });
    try {
      const buf = await fsp.readFile(file);
      return send(res, 200, buf, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    } catch {
      return send(res, 404, 'not found', 'text/plain');
    }
  }

  // Собственные ручки модулей. Идут после всех ручек ядра: модуль дополняет
  // офис, а не переопределяет его.
  if (await moduleRoute(url, req, res, send)) return;

  // static; /callback — возврат OAuth: отдаём тот же офис, разбирает его модуль,
  // который эту авторизацию затеял. Ветка остаётся в ядре, потому что модуль
  // не может добавить себе статический адрес — и это честная дырка в шве.
  const rel = url.pathname === '/' || url.pathname === '/callback'
    ? 'index.html' : url.pathname.slice(1);
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB)) return send(res, 403, { error: 'nope' });
  try {
    const buf = await fsp.readFile(file);
    return send(res, 200, buf, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch {
    return send(res, 404, 'not found', 'text/plain');
  }
}

// Куда слушать. По умолчанию петля: до 30 августа 2026 хост не указывался
// вообще, а это `0.0.0.0` — офис отвечал всей сети Wi-Fi без единой проверки.
// Открыть наружу можно, но только вместе с токеном: одно без другого и есть
// та самая дыра.
let boot = await getSettings();
const EXTERNAL = process.env.VALEY_EXTERNAL === '1' || !!(boot.network || {}).external;
if (EXTERNAL && !(boot.network || {}).token) {
  boot = await patchSettings({ network: { external: true, token: newToken() } });
  console.log('Сетевой токен создан и записан в настройки офиса');
}
const HOST = process.env.HOST || (EXTERNAL ? '0.0.0.0' : '127.0.0.1');

server.listen(PORT, HOST, async () => {
  const mods = await loadModules(ROOT);
  const token = await ownerToken();
  const s = await getSettings();
  console.log(`Valey office at http://localhost:${PORT}`);
  if (EXTERNAL) {
    const t = (boot.network || {}).token || '';
    console.log(`  открыт наружу (${HOST}) — с другого устройства один раз с токеном:`);
    console.log(`  http://<адрес-этой-машины>:${PORT}/?token=${t || '<см. настройки>'}`);
  }
  if (mods.length) console.log(`  модули: ${mods.map(m => m.id).join(', ')}`);
  // Модуль, который не завёлся, обязан сказать это здесь: иначе пропавшая
  // фича расследуется глазами вместо одной строки в логе.
  for (const e of moduleErrors()) console.log(`  модуль не встал: ${e.id} — ${e.error}`);
  // Ссылка хозяина печатается всегда, а не только в общем режиме: открыв её
  // один раз, вы остаётесь хозяином в этом браузере и после того, как офис
  // станет общим. Искать её потом в .settings.json — лишний шаг в неудачный
  // момент.
  console.log(`  хозяин: http://localhost:${PORT}/#owner=${token}`);
  if (s.access.mode === 'private') {
    console.log('  режим: private — всё с этой машины считается хозяйским.');
    console.log('  Перед тем как открыть офис наружу, переключите на shared.');
  } else {
    console.log('  режим: shared — командовать может только тот, кто предъявил токен.');
  }
  tick();
  peopleTick();
});
