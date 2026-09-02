// Weather behind the corridor windows. Procedural by default: the sky is picked
// deterministically per three-hour block, so it stays put across reloads.
import { hash } from './sprites.js';

const KINDS = ['clear', 'clouds', 'rain', 'storm', 'snow', 'fog'];

export function proceduralWeather(date = new Date()) {
  const block = Math.floor(date.getTime() / (3 * 3600 * 1000));
  const h = hash('sky' + block);
  const month = date.getMonth();
  const winter = month === 11 || month <= 1;
  const roll = h % 100;
  let kind;
  if (roll < 34) kind = 'clear';
  else if (roll < 62) kind = 'clouds';
  else if (roll < 80) kind = winter ? 'snow' : 'rain';
  else if (roll < 88) kind = 'fog';
  else if (roll < 96) kind = winter ? 'snow' : 'rain';
  else kind = winter ? 'snow' : 'storm';
  return {
    kind,
    intensity: 0.4 + ((h >>> 7) % 60) / 100,
    wind: (((h >>> 13) % 200) - 100) / 100,
    source: 'выдумана',
  };
}

// Open-Meteo weather codes -> our little vocabulary
export function fromWeatherCode(code, wind = 0) {
  const k = code === 0 ? 'clear'
    : code <= 3 ? 'clouds'
    : code <= 48 ? 'fog'
    : code <= 67 ? 'rain'
    : code <= 77 ? 'snow'
    : code <= 82 ? 'rain'
    : code <= 86 ? 'snow'
    : 'storm';
  return { kind: k, intensity: 0.6, wind: Math.max(-1, Math.min(1, wind / 30)), source: 'настоящая' };
}

// Названия погоды переехали в словарь (sky.*): здесь они были вторым списком,
// который при переводе разошёлся бы с первым.

// 0..1 — how much the room lights up from lightning right now
export function flash(t, w) {
  if (w.kind !== 'storm') return 0;
  const period = 4200;
  const phase = t % period;
  const strike = hash('bolt' + Math.floor(t / period)) % 100 < 55;
  if (!strike || phase > 420) return 0;
  const a = phase < 60 ? phase / 60 : Math.max(0, 1 - (phase - 60) / 360);
  return a * (phase > 150 && phase < 210 ? 0.4 : 1);
}

const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

// night: 0 = midday, 1 = deep night
export function drawSky(ctx, x, y, w, h, t, night, weather) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

  const overcast = weather.kind === 'rain' || weather.kind === 'storm' || weather.kind === 'snow' || weather.kind === 'fog';
  const day = 1 - night;
  const top = overcast
    ? `rgb(${44 + day * 60},${46 + day * 60},${58 + day * 62})`
    : `rgb(${28 + day * 70},${44 + day * 90},${92 + day * 110})`;
  const low = overcast
    ? `rgb(${58 + day * 66},${58 + day * 62},${68 + day * 60})`
    : `rgb(${52 + day * 110},${62 + day * 110},${104 + day * 100})`;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top); g.addColorStop(1, low);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);

  // sun or moon: only when the sky is open enough to show it
  if (weather.kind === 'clear' || weather.kind === 'clouds') {
    const arc = (t / 90000) % 1;
    const bx = x + 8 + ((Math.sin(arc * Math.PI * 2) * 0.4 + 0.5) * (w - 16));
    const by = y + 4 + night * 4;
    if (night > 0.55) {
      px(ctx, bx, by, 6, 6, '#ffe9b8'); px(ctx, bx - 2, by + 2, 2, 2, '#3a4a72');
      if (!overcast) for (let i = 0; i < 10; i++) {
        const hh = hash(`st${x}${i}`);
        px(ctx, x + 2 + (hh % (w - 4)), y + 2 + ((hh >>> 3) % (h - 6)), 1, 1, '#fff3d0');
      }
    } else {
      px(ctx, bx, by, 7, 7, overcast ? '#d8d2c0' : '#ffe07a');
      if (!overcast) { px(ctx, bx - 1, by + 1, 9, 5, '#ffe07a'); px(ctx, bx + 1, by - 1, 5, 9, '#ffe07a'); }
    }
  }

  // skyline: keeps to the bottom third so the sky stays the sky
  const base = y + h;
  const maxRoof = Math.max(3, Math.round(h * 0.42));
  for (let i = 0; i < 9; i++) {
    const hh = hash(`bld${x}${i}`);
    const bw = 7 + (hh % 9);
    const bh = 2 + ((hh >>> 4) % maxRoof);
    const bx = x + (i * (w / 9)) - 2;
    px(ctx, bx, base - bh, bw, bh, night > 0.5 ? '#171b28' : '#2b3040');
    if (night > 0.5 && (hh >>> 9) % 3 === 0) px(ctx, bx + 2, base - bh + 2, 2, 2, '#ffd98a');
    if (night > 0.5 && (hh >>> 11) % 4 === 0) px(ctx, bx + bw - 4, base - bh + 4, 2, 2, '#ffd98a');
  }

  // clouds
  if (weather.kind !== 'clear') {
    const n = weather.kind === 'clouds' ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const hh = hash(`cl${x}${i}`);
      const speed = 0.004 + (hh % 5) / 900;
      const cw = 16 + (hh % 14);
      const cx = x - 20 + (((t * speed * (1 + weather.wind * 0.4)) + (hh % w)) % (w + 40));
      const cy = y + 2 + ((hh >>> 5) % Math.max(2, h - 12));
      const tone = overcast ? (night > 0.5 ? '#3c3f4c' : '#8d8f9c') : (night > 0.5 ? '#39405c' : '#d8dce8');
      px(ctx, cx, cy, cw, 4, tone);
      px(ctx, cx + 4, cy - 2, cw - 10, 3, tone);
    }
  }

  // precipitation
  if (weather.kind === 'rain' || weather.kind === 'storm') {
    const drops = Math.round(w * h * 0.035 * weather.intensity);
    const tilt = weather.wind * 0.6;
    ctx.fillStyle = night > 0.5 ? 'rgba(150,180,225,0.5)' : 'rgba(215,230,250,0.6)';
    for (let i = 0; i < drops; i++) {
      const hh = hash(`rn${i}`);
      const speed = 0.14 + (hh % 7) / 45;
      const dy = (((hh >>> 3) % h) + t * speed) % h;
      const dx = ((((hh % w) + dy * tilt) % w) + w) % w;
      ctx.fillRect((x + dx) | 0, (y + dy) | 0, 1, 2 + (hh % 2));
    }
  }
  if (weather.kind === 'snow') {
    const flakes = Math.round(w * h * 0.025 * weather.intensity);
    ctx.fillStyle = 'rgba(242,246,255,0.9)';
    for (let i = 0; i < flakes; i++) {
      const hh = hash(`sn${i}`);
      const speed = 0.012 + (hh % 5) / 420;
      const dy = (((hh >>> 3) % h) + t * speed) % h;
      const dx = ((((hh % w) + Math.sin(t / 1100 + i) * 3) % w) + w) % w;
      ctx.fillRect((x + dx) | 0, (y + dy) | 0, 1, 1);
    }
  }
  if (weather.kind === 'fog') {
    ctx.fillStyle = `rgba(200,205,215,${0.18 + 0.06 * Math.sin(t / 2400)})`;
    ctx.fillRect(x, y + h / 3, w, h);
  }

  const f = flash(t, weather);
  if (f > 0) { ctx.fillStyle = `rgba(226,235,255,${0.85 * f})`; ctx.fillRect(x, y, w, h); }

  // frame shadow inside the opening
  px(ctx, x, y, w, 1, 'rgba(0,0,0,0.35)');
  ctx.restore();
}
