// The control-room cameras: any piece of the floor fitted into the screen whole
// — a project room or a corridor. It is the same office as outside, only shot
// from above and through a cheap monitor: grain, a scan line and a green cast
// over the ordinary drawing.
import { drawPerson, drawCat, hash } from './sprites.js';
import { t as tr } from './i18n.js';
import { drawRoom, drawRoomProps, drawBoard, drawDesk, drawCorridor, drawSecurity, pxText } from './office.js';

const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

// What the control room sees: a camera per room and per corridor, including the
// approach to the control room itself — it falls into no corridor "strip" at all.
export function buildCameras(L) {
  if (!L) return [];
  const cams = L.projectRooms.map((r) => ({
    kind: 'room', room: r, title: r.title,
    rect: { x: r.x - 8, y: r.y - 18, w: r.w + 16, h: r.h + 26 },
  }));
  (L.bands || []).forEach((b, i) => cams.push({
    kind: 'corridor', title: i === 0 ? tr('cam.entrance') : tr('cam.corridor', { n: i + 1 }),
    rect: { x: 0, y: b.y - 10, w: L.w, h: b.h + 20 },
  }));
  const s = L.security;
  if (s) cams.push({
    kind: 'corridor', title: tr('cam.security'),
    rect: { x: s.x - 150, y: s.y - 86, w: s.w + 300, h: 104 },
  });
  return cams;
}

// How many people got into the frame: for a room those are its agents, for a
// corridor everyone standing inside the camera's rectangle right now.
function inFrame(cam, agents, actors) {
  if (cam.kind === 'room') return agents.filter((a) => cam.room.agents.includes(a.id));
  const r = cam.rect;
  const ids = new Set();
  for (const act of actors.values()) {
    if (act.x > r.x && act.x < r.x + r.w && act.y > r.y && act.y < r.y + r.h) ids.add(act.id);
  }
  return agents.filter((a) => ids.has(a.id));
}

export function drawCamera(ctx, VW, VH, cam, view, t) {
  const { agents, actors, looks, boardItems, index, total, online, layout, night, weather, cat, player, me, unlocked, auto, dwell, since } = view;

  ctx.fillStyle = '#0b0f0e';
  ctx.fillRect(0, 0, VW, VH);
  if (!cam) {
    pxText(ctx, tr('cam.noSignal'), VW / 2 - 33, VH / 2, '#4f6a5c', 8);
    return;
  }

  // the frame fits into the screen whole, with margins for the top and bottom plates
  const r = cam.rect;
  const padX = 12, padTop = 20, padBottom = 24;
  const scale = Math.min((VW - padX * 2) / r.w, (VH - padTop - padBottom) / r.h);
  const offX = (VW - r.w * scale) / 2;
  const offY = padTop + ((VH - padTop - padBottom) - r.h * scale) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(4, 14, VW - 8, VH - 32);
  ctx.clip();
  ctx.translate(offX - r.x * scale, offY - r.y * scale);
  ctx.scale(scale, scale);

  const byId = new Map(agents.map((a) => [a.id, a]));
  const draws = [];
  const addRoom = (room) => {
    drawRoom(ctx, room, t);
    drawRoomProps(ctx, room, t);
    draws.push({ y: room.y - 1, fn: () => drawBoard(ctx, room, boardItems(room), t, false) });
    for (const d of room.desks) {
      const a = byId.get(room.agents[d.i]);
      draws.push({ y: d.y + 12, fn: () => drawDesk(ctx, d, a, t) });
    }
  };
  const overlaps = (o) => o.x < r.x + r.w && o.x + o.w > r.x && o.y - 20 < r.y + r.h && o.y + o.h > r.y;

  if (cam.kind === 'room') {
    addRoom(cam.room);
  } else {
    // a corridor is shot together with what opens onto it: room walls, doors, the control room
    drawCorridor(ctx, layout, t, night, weather);
    for (const room of layout.projectRooms) if (overlaps(room)) addRoom(room);
    const s = layout.security;
    if (s && overlaps(s)) drawSecurity(ctx, s, t, { unlocked, camsOn: true });
  }

  const visible = (act) => (cam.kind === 'room'
    ? act.room === cam.room
    : act.x > r.x - 20 && act.x < r.x + r.w + 20 && act.y > r.y - 20 && act.y < r.y + r.h + 20);
  for (const act of actors.values()) {
    if (!visible(act)) continue;
    const a = byId.get(act.id);
    if (!a) continue;
    const sitting = act.state === 'sit';
    const frame = act.state === 'walk' ? Math.floor(t / 130)
      : a.status === 'working' ? Math.floor(t / 160) : Math.floor(t / 520);
    draws.push({ y: act.y, fn: () => drawPerson(ctx, act.x, act.y, looks.get(a.id), {
      pose: sitting ? 'sit' : act.state === 'walk' ? 'walk' : 'stand',
      frame, dir: act.dir, bob: 0,
    }) });
  }
  // you can see yourself in the frame too — the camera makes no exceptions
  if (player && player.x > r.x && player.x < r.x + r.w && player.y > r.y && player.y < r.y + r.h) {
    draws.push({ y: player.y, fn: () => drawPerson(ctx, player.x, player.y, me, {
      pose: 'stand', frame: 0, dir: player.dir, bob: Math.floor(t / 800) % 2,
    }) });
  }
  if (cat && cat.x > r.x && cat.x < r.x + r.w && cat.y > r.y && cat.y < r.y + r.h) {
    draws.push({ y: cat.y, fn: () => drawCat(ctx, cat.x, cat.y, Math.floor(t / 300)) });
  }
  draws.sort((a, b) => a.y - b.y).forEach((d) => d.fn());
  ctx.restore();

  // ---- what makes the picture a camera rather than a window
  ctx.globalAlpha = 0.16;
  for (let y = 0; y < VH; y += 2) px(ctx, 0, y, VW, 1, '#000000');
  ctx.globalAlpha = 0.10;
  const sweep = (t / 14) % (VH + 60) - 30;
  px(ctx, 0, sweep, VW, 18, '#a8ffd0');
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 70; i++) {
    const h = hash('gr' + ((i + Math.floor(t / 90)) | 0));
    px(ctx, h % VW, (h >>> 7) % VH, 1, 1, '#dfffe8');
  }
  ctx.globalAlpha = 1;

  // the green cast and the vignette of cheap optics
  ctx.globalAlpha = 0.12;
  px(ctx, 0, 0, VW, VH, '#2fbf7a');
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(VW / 2, VH / 2, VH / 3.2, VW / 2, VH / 2, VH);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,10,6,0.75)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);

  // the frame of the interface
  px(ctx, 0, 0, VW, 13, 'rgba(6,12,9,0.85)');
  px(ctx, 0, VH - 15, VW, 15, 'rgba(6,12,9,0.85)');
  px(ctx, 0, 13, VW, 1, '#1f4a38');
  px(ctx, 0, VH - 16, VW, 1, '#1f4a38');
  const rec = Math.sin(t / 340) > 0;
  px(ctx, 8, 4, 5, 5, rec ? '#ff5a4a' : '#5e2620');
  pxText(ctx, `REC  CAM ${index + 1}/${total}`, 18, 9, '#9fe0a8');
  if (auto) {
    // the strip runs to its end — and the desk moves on to the next camera by itself
    pxText(ctx, tr('cam.auto'), 96, 9, Math.sin(t / 500) > -0.5 ? '#ffd166' : '#9a7a34');
    const left = Math.max(0, Math.min(1, (t - since) / dwell));
    px(ctx, 120, 5, 40, 4, '#173026');
    px(ctx, 120, 5, Math.round(40 * left), 4, '#ffd166');
  }
  const here = inFrame(cam, agents, actors);
  const busy = here.filter((a) => a.status === 'working').length;
  pxText(ctx, cam.kind === 'room' ? tr('cam.inRoom', { n: here.length, busy })
    : here.length ? tr('cam.inFrame', { n: here.length }) : tr('cam.nobody'), VW - 118, 9, '#7fc79c');
  // the name of the spot lives at the bottom: at the top the game header would cover it
  const title = cam.title.length > 24 ? cam.title.slice(0, 23) + '…' : cam.title;
  pxText(ctx, title.toUpperCase(), 8, VH - 5, '#dff5e6');
  pxText(ctx, tr('cam.keys', { state: auto ? tr('cam.on') : tr('cam.off') }),
    8 + title.length * 4 + 12, VH - 5, '#6fae8c');
  const clock = new Date();
  pxText(ctx, `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}:${String(clock.getSeconds()).padStart(2, '0')}`,
    VW - 46, VH - 5, '#6fae8c');
  if (!online) pxText(ctx, tr('cam.signal'), VW / 2 - 22, VH / 2, '#9fe0a8', 8);
}
