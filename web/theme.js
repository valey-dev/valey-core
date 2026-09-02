// Цвет офиса. Вся коричневая палитра интерфейса выведена из одного тона:
// крутим его — и панели, рамки, поля ввода едут следом. Холст с пикселями
// живёт отдельно, его дерево здесь не трогается.
const KEY = 'valey-theme';

// [переменная, сдвиг тона от базового, насыщенность, светлота] — снято с исходной палитры (тон 25°).
const TOKENS = [
  ['--bg', -1, 39, 8], ['--bg-hi', 2, 35, 13], ['--bg-deep', 0, 43, 6],
  ['--field', 2, 35, 9], ['--wood-dark', 0, 33, 12], ['--wood-hi', 0, 31, 17],
  ['--wood', 0, 33, 22], ['--wood-lit', 2, 40, 30],
  ['--frame-dim', -1, 30, 34], ['--frame', 0, 32, 41],
  ['--muted-dim', 6, 21, 35], ['--muted', 7, 19, 46],
  ['--ink-dim', 9, 36, 68], ['--ink', 13, 74, 86],
  ['--cab-in', 2, 41, 26], ['--cab2', 1, 44, 29], ['--cab', 2, 41, 38],
  ['--cab-edge', 5, 39, 48], ['--cab-dial', 8, 47, 60],
];

// Имя пресета — ключ словаря, а не готовое слово: панель цвета говорит на том
// же языке, что и остальной офис.
export const PRESETS = [
  { key: 'oak', hue: 25, sat: 100, accent: '#9fe0a8' },
  { key: 'cherry', hue: 355, sat: 105, accent: '#ffa8b6' },
  { key: 'plum', hue: 285, sat: 90, accent: '#c39bff' },
  { key: 'night', hue: 220, sat: 85, accent: '#8fc8ff' },
  { key: 'moss', hue: 130, sat: 80, accent: '#c8e08f' },
  { key: 'steel', hue: 210, sat: 20, accent: '#9fe0a8' },
];

const DEFAULTS = { hue: 25, sat: 100, accent: '#9fe0a8' };

export const theme = { ...DEFAULTS, ...load() };

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function applyTheme(patch = {}) {
  Object.assign(theme, patch);
  theme.hue = ((Math.round(theme.hue) % 360) + 360) % 360;
  theme.sat = Math.max(0, Math.min(160, Math.round(theme.sat)));
  const root = document.documentElement.style;
  for (const [name, dh, s, l] of TOKENS) {
    const sat = Math.min(95, Math.round(s * theme.sat / 100));
    root.setProperty(name, `hsl(${(theme.hue + dh + 360) % 360} ${sat}% ${l}%)`);
  }
  root.setProperty('--accent', theme.accent);
  try { localStorage.setItem(KEY, JSON.stringify(theme)); } catch {}
}

export function resetTheme() { applyTheme({ ...DEFAULTS }); }

applyTheme();

// ------------------------------------------------------- размер текста панелей
// Холст сюда не входит: у него свой масштаб на + и 0. Здесь только панели, и
// растут они целиком — вместе с отступами, рамками и полями ввода. Растить один
// кегль было бы дешевле, но при 150% текст упирался бы в неизменившиеся края.
const UI_KEY = 'valey-uiscale';
export const UI_STEPS = [1, 1.15, 1.3, 1.5, 1.75];
export const ui = { scale: 1 };

export function applyUiScale(v) {
  ui.scale = UI_STEPS.includes(Number(v)) ? Number(v) : 1;
  document.documentElement.style.setProperty('--ui', String(ui.scale));
  try { localStorage.setItem(UI_KEY, String(ui.scale)); } catch {}
}

applyUiScale(Number(localStorage.getItem(UI_KEY)));
