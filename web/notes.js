// Заметки к репликам разговора.
//
// Живут только в браузере и наружу не ходят: это личные мысли, а не часть
// офиса. Ключ тот же, что у остальных пользовательских настроек, — valey-*.
//
// Якорь — метка времени реплики (ts), а не её номер и не хеш текста. Номер
// не годится: /api/chat отдаёт последние шестнадцать сообщений, окно едет по
// мере разговора. Хеш не годится тоже: хвостовая реплика растёт, пока агент
// печатает, и текст меняется под руками. ts выставляется на сервере один раз
// при разборе транскрипта и дальше не двигается.

const KEY = 'valey-chat-notes';

// Date.now() не различает две записи внутри одной миллисекунды, и порядок в
// общем списке становится делом удачи. Держим метку строго возрастающей: она
// остаётся временем создания, но одинаковых больше не бывает.
let lastAt = 0;
const stampNow = () => (lastAt = Math.max(Date.now(), lastAt + 1));

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

function writeAll(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch { return false; }
}

// Порядок — по времени создания: заметка к одной и той же реплике ложится под
// предыдущую, а не перед ней.
export function notesOf(agentId) {
  return (readAll()[agentId] || []).slice().sort((a, b) => a.at - b.at);
}

export function noteCount(agentId) {
  return (readAll()[agentId] || []).length;
}

// ctx — снимок того, где заметка родилась: имя агента, проект, заголовок чата и
// начало реплики-якоря. Именно снимок, а не ссылка. Офис строится из ЖИВЫХ
// сессий: закрыл чат — агента нет, /api/chat на его id отвечает 404. Значит
// большинство заметок переживут свой разговор, и без снимка в общем списке
// останется висящий идентификатор вместо контекста.
export function addNote(agentId, ts, text, ctx) {
  const body = String(text || '').trim();
  if (!body) return null;
  const all = readAll();
  const note = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: ts || null, text: body, at: stampNow(), edited: null };
  if (ctx) {
    note.ctx = {
      agent: String(ctx.agent || '').slice(0, 60),
      project: String(ctx.project || '').slice(0, 80),
      title: String(ctx.title || '').slice(0, 120),
      quote: String(ctx.quote || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    };
  }
  (all[agentId] = all[agentId] || []).push(note);
  return writeAll(all) ? note : null;
}

// Все заметки разом, свежие сверху. agentId возвращается рядом: по нему панель
// решает, жив ли ещё разговор и можно ли в него провалиться.
export function allNotes() {
  const all = readAll();
  const out = [];
  for (const agentId of Object.keys(all)) {
    for (const n of all[agentId] || []) out.push({ ...n, agentId });
  }
  return out.sort((a, b) => b.at - a.at);
}

export function editNote(agentId, id, text) {
  const body = String(text || '').trim();
  const all = readAll();
  const note = (all[agentId] || []).find((n) => n.id === id);
  if (!note) return null;
  // пустой текст — то же самое, что удалить: иначе останется пустая карточка
  if (!body) return removeNote(agentId, id) ? 'removed' : null;
  note.text = body;
  note.edited = Date.now();
  return writeAll(all) ? note : null;
}

export function removeNote(agentId, id) {
  const all = readAll();
  const list = all[agentId] || [];
  const i = list.findIndex((n) => n.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  if (!list.length) delete all[agentId];
  return writeAll(all);
}

// Раскладывает заметки на две кучи: те, чья реплика сейчас в окне, и те, чья
// уехала. Вторые нельзя молча прятать — записанное не должно пропадать вместе
// с сообщением, к которому оно привязано.
export function splitNotes(agentId, msgs) {
  const known = new Set((msgs || []).map((m) => m.ts).filter((t) => t != null));
  const byTs = new Map();
  const orphans = [];
  for (const n of notesOf(agentId)) {
    if (n.ts != null && known.has(n.ts)) {
      if (!byTs.has(n.ts)) byTs.set(n.ts, []);
      byTs.get(n.ts).push(n);
    } else orphans.push(n);
  }
  return { byTs, orphans };
}
