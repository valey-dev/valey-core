// Приёмная для запросов разрешения из Claude Code.
//
// Хук `PermissionRequest` срабатывает ровно тогда, когда в терминале должен
// появиться диалог «Allow Claude to run …?», и ждёт ответа на stdout. Пока он
// ждёт, диалога в терминале НЕТ: вопрос держим мы. Отсюда всё остальное в этом
// файле — это про то, чтобы вопрос не завис навсегда.
//
// Три способа отпустить его обратно:
//  - хозяин ответил в офисе: allow, deny или always;
//  - хозяин сказал «в терминале» — отвечаем пустотой, и Claude Code спрашивает сам;
//  - никто не ответил за WAIT_MS — то же самое, но без человека.
//
// Пустой ответ — это не отказ. Хук, вернувший `{}`, пропускает вопрос дальше по
// штатному пути, и человек видит родной диалог. Поэтому «отложить» и «истекло»
// сделаны одинаково: офис отходит в сторону, а не решает за хозяина.
import crypto from 'node:crypto';

// Хук ждёт 600 секунд (умолчание Claude Code). Отвечаем заметно раньше, чтобы
// вопрос вернулся в терминал по нашему решению, а не по чужому таймауту: иначе
// момент, когда карточка в офисе перестала что-то значить, наступает молча.
export const WAIT_MS = 9 * 60 * 1000;

// id -> { ...публичные поля, resolve, timer }
const waiting = new Map();

// Что из tool_input показывать на пейджере и в карточке. Bash — главный
// случай, ради него всё и делалось: там решают по тексту команды. Остальные
// инструменты показывают то, что у них есть за «что именно ты трогаешь».
function commandOf(tool, input) {
  if (!input || typeof input !== 'object') return '';
  const first = (...keys) => {
    for (const k of keys) if (typeof input[k] === 'string' && input[k]) return input[k];
    return '';
  };
  if (tool === 'Bash') return first('command');
  const named = first('file_path', 'path', 'url', 'pattern', 'query', 'notebook_path');
  if (named) return named;
  // Незнакомый инструмент — показываем его вход как есть, а не «…». Обрезать
  // будем в одном месте, ниже, и одинаково для всех.
  try { return JSON.stringify(input); } catch { return ''; }
}

// Потолок на то, что уходит в браузер. Команда, которую невозможно прочитать
// целиком, — это обманутый хозяин, поэтому предел щедрый; но `tool_input` для
// Write — это весь файл, и класть его в снимок каждые 2.5 секунды незачем.
const CUT = 4000;
const cut = (s) => (String(s || '').length > CUT ? String(s).slice(0, CUT) + ' …' : String(s || ''));

// Публичная часть записи: то, что уходит хозяину в снимке и в событии.
const shown = (e) => ({
  id: e.id, agentId: e.agentId, tool: e.tool, command: e.command,
  description: e.description, at: e.at, until: e.until,
  // Правило, которое ляжет в настройки по «всегда разрешать». Показываем
  // словами до нажатия: молча записанное правило — это разрешение, которое
  // хозяин не давал.
  rule: e.rule,
});

// Правило для «всегда». Claude Code присылает свои предложения в
// permission_suggestions — берём их, а не сочиняем свои: кнопка «Always allow»
// в терминале запишет ровно это, и офис не должен расходиться с ней.
function ruleOf(suggestions) {
  const list = Array.isArray(suggestions) ? suggestions : [];
  for (const s of list) {
    const rules = (s && Array.isArray(s.rules)) ? s.rules : [];
    for (const r of rules) {
      if (!r || !r.toolName) continue;
      return r.ruleContent ? `${r.toolName}(${r.ruleContent})` : String(r.toolName);
    }
  }
  return '';
}

// Пришёл запрос. Возвращает промис с вердиктом для хука; `null` означает
// «офис отходит в сторону» — хук отвечает пустотой, спрашивает терминал.
export function ask(payload, { audience }) {
  const agentId = String((payload && payload.session_id) || '');
  const tool = String((payload && payload.tool_name) || '');
  const input = (payload && payload.tool_input) || {};
  // Некому смотреть — некому и отвечать. Держать вопрос в офисе, которого
  // никто не открыл, значит воровать девять минут у человека в терминале.
  if (!audience) return { held: false, verdict: null };

  const e = {
    id: crypto.randomUUID().slice(0, 8),
    agentId,
    tool,
    command: cut(commandOf(tool, input)),
    description: cut((input && input.description) || ''),
    rule: ruleOf(payload && payload.permission_suggestions),
    suggestions: (payload && payload.permission_suggestions) || [],
    at: Date.now(),
    until: Date.now() + WAIT_MS,
  };
  const verdict = new Promise((resolve) => { e.resolve = resolve; });
  e.timer = setTimeout(() => finish(e.id, null), WAIT_MS);
  // Таймер не должен держать процесс живым сам по себе: девять минут ожидания
  // не повод не дать серверу закрыться.
  if (e.timer.unref) e.timer.unref();
  waiting.set(e.id, e);
  return { held: true, verdict, entry: shown(e) };
}

// Отпустить вопрос. Один раз: второй ответ на тот же запрос — это гонка между
// офисом и таймером, и выигрывать её должен первый.
function finish(id, verdict) {
  const e = waiting.get(id);
  if (!e) return false;
  waiting.delete(id);
  clearTimeout(e.timer);
  e.resolve(verdict);
  return true;
}

// Ответ хозяина. `always` — это allow плюс правило в настройки проекта;
// `terminal` — офис отходит в сторону, как при истёкшем ожидании.
export function answer(id, { decision, message } = {}) {
  const e = waiting.get(id);
  if (!e) return null;
  if (decision === 'terminal') return finish(id, null) ? { ok: true, decision } : null;
  if (decision === 'allow' || decision === 'always') {
    return finish(id, {
      decision: 'allow',
      // Правила отдаём хуку теми же объектами, какими их прислал Claude Code.
      updatedPermissions: decision === 'always' ? e.suggestions : [],
    }) ? { ok: true, decision } : null;
  }
  if (decision === 'deny') {
    return finish(id, { decision: 'deny', message: String(message || '').slice(0, 2000) })
      ? { ok: true, decision } : null;
  }
  return null;
}

// Что показать хозяину. Порядок — по времени прихода: пейджер зовёт по
// очереди, и «первый» должен значить «первый спросил».
export function permits() {
  return [...waiting.values()].sort((a, b) => a.at - b.at).map(shown);
}

// Сессия исчезла из офиса — держать её вопрос незачем: отвечать некому и не о
// чем. Зовётся из такта снимка.
export function forgetGone(aliveIds) {
  const alive = new Set(aliveIds || []);
  for (const e of [...waiting.values()]) {
    if (e.agentId && !alive.has(e.agentId)) finish(e.id, null);
  }
}

// Для тестов и для остановки сервера: отпустить всё, что ждёт.
export function releaseAll() {
  for (const id of [...waiting.keys()]) finish(id, null);
}
