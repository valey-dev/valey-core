// One picture per room, chosen to match what that room actually does, plus a few
// rare jokes hanging in the corridors. Everything is derived from the seed, so a
// room keeps its picture between sessions.
import { hash } from './sprites.js';
import { t as tr } from './i18n.js';

const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0)); };

const FRAMES = [
  { outer: '#2a1d15', inner: '#8a6247', lit: '#a9784c' },   // wood
  { outer: '#241a10', inner: '#c9a06a', lit: '#e0bd85' },   // gilded
  { outer: '#1c1c22', inner: '#4d4a56', lit: '#6b6675' },   // metal
  { outer: '#2a1518', inner: '#7a3f38', lit: '#9a564a' },   // cherry
];

// What the room is about, guessed from the project name. First match wins.
const MOTIFS = [
  { kind: 'food', re: /restaurant|pizza|kitchen|food|cafe|кафе|еда|кухн|ресторан/i },
  { kind: 'money', re: /budget|money|wallet|bank|finance|invoice|бюджет|деньг|счёт|финанс/i },
  { kind: 'dog', re: /kennel|dog|pet|puppy|собак|питомник|щен/i },
  { kind: 'chart', re: /dashboard|analytic|metric|activity|report|stat|дашборд|отчёт|метрик/i },
  { kind: 'network', re: /ping|monitor|uptime|server|proxy|net|пинг|сервер|монитор/i },
  { kind: 'muscle', re: /grip|iron|gym|fit|sport|workout|спорт|зал|качал/i },
  { kind: 'design', re: /design|figma|ui|ux|brand|дизайн|макет/i },
  { kind: 'valley', re: /valley|office|ai\b|долин|офис/i },
  { kind: 'game', re: /game|play|arcade|quest|игр/i },
];

// Rare corridor pictures: half of the fun is finding them
const EGGS = ['blacksquare', 'catlord', 'deadline', 'prodfell', 'missing', 'recursion', 'ready'];

export function motifOf(title = '') {
  const found = MOTIFS.find((m) => m.re.test(title));
  return found ? found.kind : null;
}

export function artOf(slot) {
  const seed = typeof slot === 'string' ? slot : slot.seed;
  const h = hash('art' + seed);
  const kind = slot.egg
    ? EGGS[hash('egg' + seed) % EGGS.length]
    : (motifOf(slot.theme || '') || ['code', 'valley', 'chart'][h % 3]);
  return {
    kind,
    egg: !!slot.egg,
    frame: FRAMES[kind === 'catlord' ? 1 : (h >>> 5) % FRAMES.length],
    tint: (h >>> 9) % 360,
    seed: h,
    tilt: ((h >>> 17) % 7 === 0) ? 1 : 0,   // one in seven hangs crooked
  };
}

// ------------------------------------------------------------------ the art
function scene(ctx, x, y, w, h, art) {
  const s = art.seed;
  const mid = x + Math.floor(w / 2);

  switch (art.kind) {
    case 'food': {                                   // a plate of pasta
      px(ctx, x, y, w, h, '#e8d9c0');
      px(ctx, mid - 7, y + h - 8, 15, 6, '#f6efe2');
      px(ctx, mid - 6, y + h - 7, 13, 4, '#e0c88f');
      for (let i = 0; i < 5; i++) px(ctx, mid - 5 + i * 3, y + h - 7 + (i % 2), 2, 3, '#d9a441');
      px(ctx, mid - 2, y + h - 6, 2, 2, '#c25a4b');
      px(ctx, mid + 9, y + h - 9, 1, 7, '#8c8f9a');
      return;
    }
    case 'money': {                                  // coins and an arrow up
      px(ctx, x, y, w, h, '#2f4a3f');
      for (let i = 0; i < 3; i++) px(ctx, x + 3, y + h - 3 - i * 2, 7, 2, '#d9a441');
      px(ctx, x + 4, y + h - 9, 5, 2, '#e8c46a');
      for (let i = 0; i < 6; i++) px(ctx, mid + i * 2, y + h - 4 - i * 2, 2, 2, '#9fe0a8');
      px(ctx, x + w - 4, y + 2, 3, 3, '#9fe0a8');
      return;
    }
    case 'dog': {                                    // a shepherd dog in profile
      px(ctx, x, y, w, h, '#d8c8a8');
      const dx = mid - 4, dy = y + h - 10;
      px(ctx, dx, dy + 3, 9, 6, '#7a5a3e');
      px(ctx, dx + 6, dy, 5, 5, '#7a5a3e');
      px(ctx, dx + 6, dy - 2, 2, 3, '#4a3325');
      px(ctx, dx + 9, dy - 2, 2, 3, '#4a3325');
      px(ctx, dx + 10, dy + 3, 2, 2, '#2b2118');
      px(ctx, dx + 8, dy + 2, 1, 1, '#2b2118');
      px(ctx, dx - 2, dy + 1, 2, 4, '#7a5a3e');
      px(ctx, dx + 6, dy + 5, 4, 2, '#c25a4b');       // the collar
      return;
    }
    case 'chart': {                                  // bars going up
      px(ctx, x, y, w, h, '#1f2a33');
      px(ctx, x + 2, y + h - 2, w - 4, 1, '#5c93b8');
      const bars = Math.max(3, Math.floor((w - 6) / 4));
      for (let i = 0; i < bars; i++) {
        const bh = 2 + ((s >>> (i % 9)) % Math.max(2, h - 5)) * (i + 1) / bars;
        px(ctx, x + 3 + i * 4, y + h - 3 - bh, 3, bh, i === bars - 1 ? '#9fe0a8' : '#4a7fa8');
      }
      return;
    }
    case 'network': {                                // a radar with a dot
      px(ctx, x, y, w, h, '#12261f');
      for (let r = 2; r < Math.min(w, h); r += 3) {
        px(ctx, mid - r, y + h - 2 - r, r * 2, 1, '#2f6a4a');
        px(ctx, mid - r, y + h - 2, 1, r, '#2f6a4a');
        px(ctx, mid + r, y + h - 2 - r, 1, r, '#2f6a4a');
      }
      px(ctx, mid + 3, y + 3, 2, 2, '#9fe0a8');
      return;
    }
    case 'muscle': {                                 // a dumbbell
      px(ctx, x, y, w, h, '#3a3a46');
      const gy = y + Math.floor(h / 2) - 1;
      px(ctx, mid - 7, gy, 14, 2, '#c9ccd4');
      px(ctx, mid - 9, gy - 3, 3, 8, '#8f9aa8');
      px(ctx, mid + 6, gy - 3, 3, 8, '#8f9aa8');
      px(ctx, mid - 11, gy - 1, 2, 4, '#6b7280');
      px(ctx, mid + 9, gy - 1, 2, 4, '#6b7280');
      return;
    }
    case 'design': {                                 // a palette and a brush
      px(ctx, x, y, w, h, '#efe6d2');
      const cols = ['#c25a4b', '#d9a441', '#7aa85a', '#4a7fa8', '#8a6bb0'];
      for (let i = 0; i < cols.length; i++) px(ctx, x + 3 + i * 3, y + h - 6, 3, 4, cols[i]);
      px(ctx, x + w - 7, y + 2, 1, 8, '#8a6247');
      px(ctx, x + w - 8, y + 9, 3, 3, '#c25a4b');
      return;
    }
    case 'game': {                                   // a joystick
      px(ctx, x, y, w, h, '#241a2e');
      px(ctx, mid - 8, y + h - 7, 16, 5, '#4a3a5e');
      px(ctx, mid - 6, y + h - 6, 3, 1, '#c9ccd4');
      px(ctx, mid - 5, y + h - 7, 1, 3, '#c9ccd4');
      px(ctx, mid + 4, y + h - 6, 2, 2, '#c25a4b');
      px(ctx, mid + 1, y + h - 6, 2, 2, '#9fe0a8');
      return;
    }
    case 'code': {                                   // a terminal
      px(ctx, x, y, w, h, '#1a1f2b');
      px(ctx, x, y, w, 3, '#2c3444');
      px(ctx, x + 2, y + 1, 1, 1, '#c25a4b');
      px(ctx, x + 4, y + 1, 1, 1, '#d9a441');
      px(ctx, x + 6, y + 1, 1, 1, '#9fe0a8');
      for (let i = 0; i < Math.floor((h - 5) / 2); i++) {
        const len = 4 + ((s >>> (i % 11)) % Math.max(4, w - 8));
        px(ctx, x + 2, y + 5 + i * 2, Math.min(len, w - 4), 1,
          ['#9fe0a8', '#8fc8ff', '#d9a441'][i % 3]);
      }
      px(ctx, x + 2, y + h - 2, 2, 1, '#f6e3c0');
      return;
    }
    case 'valley': {                                 // a valley with the office
      px(ctx, x, y, w, h, '#8fb8d8');
      px(ctx, x, y, w, Math.floor(h / 2), '#a8c8e0');
      px(ctx, x + w - 6, y + 2, 3, 3, '#ffe07a');
      px(ctx, x, y + h - 6, w, 6, '#5d8f4a');
      for (let i = 0; i < w; i += 3) px(ctx, x + i, y + h - 7 - ((s >>> (i % 7)) % 2), 3, 2, '#4a7a3c');
      px(ctx, mid - 3, y + h - 11, 7, 5, '#7a5a3e');
      px(ctx, mid - 2, y + h - 10, 2, 2, '#ffd166');
      px(ctx, mid + 1, y + h - 10, 2, 2, '#ffd166');
      return;
    }

    // ---- the easter eggs ----
    case 'blacksquare': {
      px(ctx, x, y, w, h, '#efe6d2');
      const side = Math.min(w - 4, h - 4);
      px(ctx, mid - Math.floor(side / 2), y + Math.floor((h - side) / 2), side, side, '#0f0f11');
      return;
    }
    case 'catlord': {                                // a cat in a ruff
      px(ctx, x, y, w, h, '#2a2038');
      const cy = y + h - 9;
      px(ctx, mid - 4, cy + 4, 9, 5, '#3a2a4a');
      px(ctx, mid - 3, cy + 3, 7, 2, '#efe6d2');     // the ruff
      px(ctx, mid - 3, cy - 2, 7, 6, '#d99a5c');
      px(ctx, mid - 3, cy - 5, 2, 3, '#d99a5c');
      px(ctx, mid + 2, cy - 5, 2, 3, '#d99a5c');
      px(ctx, mid - 2, cy, 1, 1, '#2b2118');
      px(ctx, mid + 2, cy, 1, 1, '#2b2118');
      px(ctx, mid, cy + 1, 1, 1, '#b87a44');
      return;
    }
    case 'deadline': {                               // a burning calendar
      px(ctx, x, y, w, h, '#2a1a14');
      px(ctx, mid - 5, y + h - 8, 11, 7, '#efe6d2');
      px(ctx, mid - 5, y + h - 8, 11, 2, '#c25a4b');
      px(ctx, mid - 2, y + h - 5, 5, 3, '#2b2118');
      for (let i = 0; i < 4; i++) {
        px(ctx, mid - 4 + i * 3, y + h - 12 - (i % 2), 2, 4, i % 2 ? '#ff9f4b' : '#ffd166');
      }
      return;
    }
    case 'prodfell': {                               // a chart going down
      px(ctx, x, y, w, h, '#1f1418');
      px(ctx, x + 2, y + h - 2, w - 4, 1, '#6b4a4a');
      for (let i = 0; i < Math.floor((w - 6) / 2); i++) {
        px(ctx, x + 3 + i * 2, y + 3 + i * 1.4, 2, 2, '#e05a4b');
      }
      px(ctx, x + w - 6, y + h - 6, 2, 4, '#f6e3c0');
      px(ctx, x + w - 7, y + h - 9, 4, 3, '#f6e3c0');
      return;
    }
    case 'missing': {                                // «здесь была картина»
      px(ctx, x, y, w, h, '#6d5040');
      px(ctx, x + 1, y + 1, w - 2, h - 2, '#5c4335');
      px(ctx, mid, y + 1, 1, 3, '#c9ccd4');           // a nail
      px(ctx, mid - 4, y + Math.floor(h / 2) - 1, 9, 1, '#8a6247');
      return;
    }
    case 'recursion': {                              // an office inside the office
      px(ctx, x, y, w, h, '#b98a5e');
      px(ctx, x, y, w, 4, '#6d5040');
      px(ctx, x + 2, y + h - 5, 6, 3, '#9a6440');     // a desk
      px(ctx, x + 3, y + h - 8, 3, 3, '#3c3b46');     // a monitor
      px(ctx, x + w - 8, y + 1, 6, 4, '#8a6247');     // a painting inside the painting
      px(ctx, x + w - 7, y + 2, 4, 2, '#4a7fa8');
      return;
    }
    default: {                                       // 'ready' — a waiter by the water cooler
      px(ctx, x, y, w, h, '#cfd6d8');
      px(ctx, mid - 4, y + h - 9, 9, 8, '#9aa8ac');
      px(ctx, mid - 3, y + h - 12, 7, 4, '#9aa8ac');
      px(ctx, mid - 2, y + h - 10, 1, 1, '#2b2118');
      px(ctx, mid + 2, y + h - 10, 1, 1, '#2b2118');
      px(ctx, mid - 6, y + h - 5, 3, 2, '#9aa8ac');
      px(ctx, mid + 5, y + h - 5, 3, 2, '#9aa8ac');
    }
  }
}

// x, y — top-left of the frame; w, h — outer size including the frame
export function drawPainting(ctx, x, y, w, h, art, t = 0) {
  const dy = art.tilt ? 1 : 0;
  px(ctx, x, y + dy, w, h, art.frame.outer);
  px(ctx, x + 1, y + dy + 1, w - 2, h - 2, art.frame.inner);
  px(ctx, x + 1, y + dy + 1, w - 2, 1, art.frame.lit);
  scene(ctx, x + 3, y + dy + 3, w - 6, h - 6, art);
  ctx.fillStyle = 'rgba(255,238,200,0.10)';
  ctx.fillRect((x + 3) | 0, (y + dy + 3) | 0, Math.max(1, Math.floor((w - 6) / 3)), h - 6);
  px(ctx, x, y + dy + h, w, 1, 'rgba(0,0,0,0.35)');
}

// ---------------------------------------------------------------- the labels
const THEMED_KINDS = ['food', 'money', 'dog', 'chart', 'network', 'muscle', 'design', 'game', 'code', 'valley'];
const EGG_KINDS = ['blacksquare', 'catlord', 'deadline', 'prodfell', 'missing', 'recursion', 'ready'];
const PER_KIND = 3;
const MEDIUMS = 4;

// The title and the technique are dictionary keys rather than ready strings: the
// caption under a painting is read aloud in both languages. The choice of a
// variant is still deterministic, from the same hash, so a painting is not renamed
// between sessions.
export function titleOf(slot) {
  const art = artOf(slot);
  if (art.egg) {
    const kind = EGG_KINDS.includes(art.kind) ? art.kind : 'missing';
    return { name: tr(`egg.${kind}.name`), medium: tr(`egg.${kind}.medium`) };
  }
  const kind = THEMED_KINDS.includes(art.kind) ? art.kind : 'code';
  const h = hash('title' + (slot.seed || slot));
  return { name: tr(`art.${kind}.${h % PER_KIND}`), medium: tr(`medium.${(h >>> 4) % MEDIUMS}`) };
}

// ------------------------------------------------------------------ the film poster
// Not a painting: it hangs on tape, without a frame, and there is one for the
// whole floor — in the control room, to the left of the door. The geometry is
// taken off frame 319:2 (the mock-up is ×2, here everything is half that), so the
// numbers here are not "by eye" but out of the mock-up.
export function drawPoster(ctx, x, y, w = 14, h = 20) {
  px(ctx, x, y, w, h, '#d8cdb4');                 // the paper
  px(ctx, x + 1, y + 1, 12, 12, '#1e2a38');       // the night sky
  px(ctx, x + 10, y + 2, 2, 2, '#ffd166');        // the moon
  px(ctx, x + 1, y + 10, 12, 3, '#16202b');       // the ground
  px(ctx, x + 7, y + 9, 5, 4, '#0f1418');         // the office block
  px(ctx, x + 3, y + 6, 2, 2, '#0f1418');
  px(ctx, x + 2, y + 8, 4, 5, '#0f1418');         // a figure with its back to the viewer
  px(ctx, x + 1, y + 14, 12, 3, '#c24b3f');       // the title plate
  px(ctx, x + 2, y + 15, 3, 1, '#f6e3c0');        // «НОЧНАЯ СМЕНА» — three words
  px(ctx, x + 6, y + 15, 2, 1, '#f6e3c0');        // read as a rhythm, not as text:
  px(ctx, x + 9, y + 15, 3, 1, '#f6e3c0');        // at 12 pixels there are no letters
  px(ctx, x + 2, y + 18, 6, 1, '#8c7660');        // the credits in small type
  px(ctx, x + 9, y + 18, 3, 1, '#8c7660');
  px(ctx, x - 1, y - 1, 4, 2, '#e8ddc8');         // tape at the top corners
  px(ctx, x + 11, y - 1, 4, 2, '#e8ddc8');
  px(ctx, x, y + h, w, 1, 'rgba(0,0,0,0.35)');
}
