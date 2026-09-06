// The colour of the office. The whole brown palette of the interface is derived
// from one hue: turn it, and the panels, the frames and the input fields follow.
// The pixel canvas lives separately, its tree is not touched here.
const KEY = 'valey-theme';

// [variable, hue shift from the base, saturation, lightness] — taken off the original palette (hue 25°).
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

// The name of a preset is a dictionary key rather than a ready word: the colour
// panel speaks the same language as the rest of the office.
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

// ------------------------------------------------------- the size of the panel text
// The canvas is not part of this: it has its own scale on + and 0. Here it is the
// panels only, and they grow whole — together with the paddings, the borders and
// the input fields. Growing one font size would have been cheaper, but at 150%
// the text would run into edges that had not changed.
const UI_KEY = 'valey-uiscale';
export const UI_STEPS = [1, 1.15, 1.3, 1.5, 1.75];
export const ui = { scale: 1 };

// Who has to be told the interface got bigger. The canvas is the one that cares:
// the HUD is measured by fit() to decide how much room the office gets, so a size
// change that does not reach fit() leaves the office laid out for the old strip —
// the gap above it goes wrong and only a reload puts it right. i18n does the same
// thing with onLang, and for the same reason.
const uiListeners = new Set();
export function onUiScale(fn) { uiListeners.add(fn); return () => uiListeners.delete(fn); }

export function applyUiScale(v) {
  ui.scale = UI_STEPS.includes(Number(v)) ? Number(v) : 1;
  document.documentElement.style.setProperty('--ui', String(ui.scale));
  try { localStorage.setItem(UI_KEY, String(ui.scale)); } catch {}
  for (const fn of uiListeners) fn(ui.scale);
}

applyUiScale(Number(localStorage.getItem(UI_KEY)));
