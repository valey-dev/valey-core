// Геймпад. Чистая арифметика над снимком из navigator.getGamepads(): ни DOM,
// ни состояния — поэтому проверяется стендом, а не руками.
//
// Зачем он вообще: офис читается с клавиатуры целиком, но ходить по нему
// стиком приятнее, а печатать — всё равно с клавиатуры. Эти два входа не
// мешают друг другу сами собой: текст набирается только в открытых панелях,
// а открытая панель и так останавливает ходьбу.
//
// Два канала наружу. Оси — аналог: стик наклонён на треть — идёшь на треть
// скорости. Кнопки — имена клавиш: «A» превращается в пробел, «B» в Escape,
// крестовина в стрелки. main.js прогоняет их через тот же обработчик, что и
// клавиатуру, и все панели — ростер, карточка, лифт, экран входа — отвечают
// геймпаду, не зная о нём.
//
// Раскладка стандартная (mapping: 'standard'): так Elite Series 2 и любой
// Xbox-геймпад видны из Chrome и Safari на macOS. Лепестки Elite сюда не
// доходят — они назначаются на кнопки в самом геймпаде и приходят как они.

export const DEADZONE = 0.2;
// Стик как крестовина: дальше этой отметки он «нажат» для меню и панелей.
export const DIGITAL = 0.5;

// Кнопка → клавиша. Bumpers на масштаб, триггеры на бег: и то и другое
// держится, а не нажимается, поэтому стоит на том, что под пальцем всегда.
export const BUTTONS = {
  0: ' ',        // A — заговорить, попить, нажать выбранное
  1: 'Escape',   // B — назад
  2: 'b',        // X — скейт
  3: 'Tab',      // Y — обход
  4: '-',        // LB — мельче
  5: '+',        // RB — крупнее
  6: 'Shift',    // LT — бежать / толкаться
  7: 'Shift',    // RT
  12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight',
};

const IDLE = Object.freeze({ x: 0, y: 0, down: new Set() });

// Радиальная мёртвая зона, а не по осям: с покоординатной стик, наклонённый
// строго вбок, дрожит по второй оси и человек «плывёт». После зоны шкала
// растягивается с нуля, чтобы движение начиналось плавно, а не рывком.
export function stick(ax = 0, ay = 0, dz = DEADZONE) {
  const mag = Math.hypot(ax, ay);
  if (!(mag > dz)) return { x: 0, y: 0 };
  const k = Math.min(1, (mag - dz) / (1 - dz)) / mag;
  return { x: ax * k, y: ay * k };
}

// Снимок геймпада → { x, y, down }. Без геймпада — покой, а не исключение:
// getGamepads() отдаёт массив с null в дырках, и это норма.
export function readPad(gp) {
  if (!gp || !gp.buttons) return IDLE;
  const pressed = (i) => { const b = gp.buttons[i]; return !!(b && (b.pressed || b.value > 0.5)); };
  const down = new Set();
  for (const i of Object.keys(BUTTONS)) if (pressed(+i)) down.add(BUTTONS[i]);

  const s = stick(gp.axes[0] || 0, gp.axes[1] || 0);
  // Стик за порогом — это ещё и стрелка: в меню и панелях ходят им же.
  if (s.x >= DIGITAL) down.add('ArrowRight'); else if (s.x <= -DIGITAL) down.add('ArrowLeft');
  if (s.y >= DIGITAL) down.add('ArrowDown'); else if (s.y <= -DIGITAL) down.add('ArrowUp');

  // Крестовина ходит тоже, как стрелки с клавиатуры — целым шагом.
  let x = s.x, y = s.y;
  if (!x) x = (pressed(15) ? 1 : 0) - (pressed(14) ? 1 : 0);
  if (!y) y = (pressed(13) ? 1 : 0) - (pressed(12) ? 1 : 0);
  return { x, y, down };
}

// Что изменилось между кадрами: нажатые и отпущенные клавиши. Кнопка,
// которую держат, не повторяется — это забота того, кто получил keydown.
export function edges(prev, next) {
  const pressed = [], released = [];
  for (const k of next.down) if (!prev.down.has(k)) pressed.push(k);
  for (const k of prev.down) if (!next.down.has(k)) released.push(k);
  return { pressed, released };
}
