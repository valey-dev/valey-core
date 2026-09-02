// Клиентская половина загрузчика.
//
// Ядро объявляет точки, модули в них встают. Когда модулей нет, все списки
// пустые и офис работает ровно как работал — это проверяется тем, что ни одна
// точка не знает имён модулей.
//
// Две семантики вызова, и путать их дорого:
//   collect — спрашиваем всех и складываем, что вернули (отрисовка, подсказки);
//   first   — отдаём событие первому, кто взялся (клавиша, ПРОБЕЛ, ESC).
import { addDict } from './i18n.js';

const HOOKS = ['sig', 'layout', 'near', 'draw', 'act', 'hint', 'key', 'esc', 'tick', 'hud', 'lang', 'help'];
const hooks = Object.fromEntries(HOOKS.map(h => [h, []]));
const dicts = [];
let ids = [];
// Модули, которые не встали. Пустой список — не то же самое, что «всё
// хорошо»: пока он не показывался, мольберт молча отсутствовал в офисе,
// потому что register бросил на неизвестной точке, а видно это было
// только в консоли браузера. Стенд теперь спрашивает этот список.
let failed = [];

export async function loadModules() {
  let list = [];
  try {
    list = await (await fetch('/api/modules')).json();
  } catch {
    return [];                       // сервер без модулей — обычный случай
  }
  // Ответом может прийти не список, а отказ: гость без приглашения получает
  // {error}. Раньше здесь начинался for..of по объекту, он падал, а падал он на
  // верхнеуровневом await в main.js — то есть уносил с собой весь офис. Пустой
  // этаж и «нужно приглашение» вместо комнат: найдено 1 сентября 2026 первым же
  // кадром в режиме shared.
  if (!Array.isArray(list)) return [];
  for (const m of list) {
    if (m.style) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/modules/${m.id}/${m.style}`;
      document.head.appendChild(link);
    }
    if (!m.client) continue;
    try {
      const mod = await import(`/modules/${m.id}/${m.client}`);
      await mod.register?.(apiFor(m.id));
      ids.push(m.id);
    } catch (err) {
      // Молча падать нельзя: «мольберт пропал» иначе расследуется глазами.
      console.warn('модуль не встал:', m.id, err);
      failed.push({ id: m.id, error: String((err && err.message) || err) });
    }
  }
  return ids;
}

function apiFor(id) {
  return {
    id,
    on(name, fn) {
      if (!hooks[name]) throw new Error(`нет такой точки: ${name}`);
      hooks[name].push({ id, fn });
    },
    // Словарь модуля вливается в общий сразу: ключи именуются с его id
    // впереди, иначе два модуля однажды подерутся за одно имя.
    i18n(dict) { dicts.push(dict); addDict(dict); }
  };
}

export function moduleDicts() { return dicts; }
export function moduleIds() { return ids.slice(); }
export function moduleFailures() { return failed.slice(); }

export function collect(name, ...args) {
  const out = [];
  for (const h of hooks[name] || []) {
    let v;
    try { v = h.fn(...args); } catch (err) { console.warn(`точка ${name} упала в ${h.id}:`, err); continue; }
    if (Array.isArray(v)) out.push(...v);
    else if (v != null && v !== false) out.push(v);
  }
  return out;
}

export function first(name, ...args) {
  for (const h of hooks[name] || []) {
    let v;
    try { v = h.fn(...args); } catch (err) { console.warn(`точка ${name} упала в ${h.id}:`, err); continue; }
    if (v) return v;
  }
  return null;
}
