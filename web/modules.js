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
import { define as defineKeys } from './keymap.js';

// `action` — новая точка рядом со старой `key`, а не вместо неё. Модуль,
// объявивший свои действия через api.keys(), получает сюда идентификатор и не
// знает никаких букв; модуль, который так и остался на `key`, работает как
// работал. Это не любезность: платные модули уезжают покупателю архивом, и
// сломать их обновлением офиса нельзя.
const HOOKS = ['sig', 'room', 'layout', 'near', 'draw', 'act', 'hint', 'key', 'action', 'esc', 'tick', 'hud', 'lang', 'help', 'busy'];
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
  // Стили — раньше клиентов и с ожиданием. Ссылка, добавленная в head, не
  // задерживает ничего: страница живёт дальше, а стиль приезжает когда приедет.
  // Пока он в пути, разметка модуля уже может быть на экране и уже может быть
  // измерена — и намерить она способна что угодно. 3 сентября 2026 книга в
  // читальне так и вышла: панель без своих стилей растянулась во всё окно,
  // ширина колонки посчиталась по 1372 пикселям вместо 886, и глава легла одной
  // колонкой поперёк разворота. Тайм-аут на случай стиля, который не приедет
  // никогда: офис важнее одного модуля.
  const styles = list.filter((m) => m.style).map((m) => new Promise((done) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `/modules/${m.id}/${m.style}`;
    link.onload = link.onerror = done;
    document.head.appendChild(link);
    setTimeout(done, 3000);
  }));
  if (styles.length) await Promise.all(styles);

  for (const m of list) {
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
    i18n(dict) { dicts.push(dict); addDict(dict); },
    // Клавиши модуля объявляются, а не проверяются буквой в обработчике. Так
    // ядро знает, что занято, и умеет об этом рассказать — до 5 сентября 2026
    // спор двух модулей за одну букву решался порядком загрузки, то есть
    // алфавитом по имени папки, и молча.
    keys(list) {
      const own = [].concat(list || []).map((a) => ({ ...a, id: a.id.startsWith(id + '.') ? a.id : `${id}.${a.id}` }));
      defineKeys(own);
      return own.map((a) => a.id);
    }
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
