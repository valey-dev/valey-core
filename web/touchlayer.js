// The touch layer on the screen: the ring and knob of the stick, the three
// buttons, and the ≡ sheet. The arithmetic lives in touch.js; this is the part
// that listens to fingers and draws where they are.
//
// It is off until the screen can be touched — `(pointer: coarse)`, or the first
// touch on a screen that did not say so — and a mouse never wakes it: a laptop
// with a touchscreen gets the layer the day somebody touches it, not before.
//
// Nothing here presses a key by itself. read() hands main.js a snapshot in the
// gamepad's shape and main.js runs it through the gamepad's loop, so a finger
// on ● is the same press as SPACE everywhere a panel listens. The sheet is the
// one exception, and only because it is a list of keys: a button there asks
// main.js to press that key, once, through the same onKey.
import {
  RING, KNOB, ACTION, BACK, MENU, restCentre, grab, tilt, snapshot, buttonsAt, keyOfCode,
} from './touch.js';
import { all, codesOf } from './keymap.js';
import { t as tr } from './i18n.js';

let on = false;
let opts = null;
let layer = null, ring = null, knob = null, sheet = null;
const btn = {};
// One finger on the stick, any number on the buttons: a thumb holds the stick
// while the other presses ●, and each is released by its own pointer id.
let stickId = null, centre = null, axes = null;
const held = new Map();

const W = () => innerWidth, H = () => innerHeight;
const place = (node, cx, cy, size) => {
  node.style.left = `${cx - size / 2}px`;
  node.style.top = `${cy - size / 2}px`;
};

function build() {
  layer = document.createElement('div');
  layer.id = 'touch';
  layer.hidden = true;
  layer.innerHTML = `<div class="tchring"><div class="tchknob"></div></div>
    <button class="tchbtn tchback" data-b="back" aria-label="Esc">✕</button>
    <button class="tchbtn tchmenu" data-b="menu" aria-label="≡">≡</button>
    <button class="tchbtn tchaction" data-b="action" aria-label="Space"><span></span></button>`;
  document.body.appendChild(layer);
  ring = layer.querySelector('.tchring');
  knob = layer.querySelector('.tchknob');
  for (const b of layer.querySelectorAll('.tchbtn')) btn[b.dataset.b] = b;

  sheet = document.createElement('div');
  sheet.id = 'touchmenu';
  sheet.hidden = true;
  document.body.appendChild(sheet);
  // A tap on the dimmed office around the sheet closes it, as ✕ does: on a
  // tablet the edge of a sheet is where the hand goes to be rid of it.
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

  // ● and ✕ are held, not clicked: the gamepad's loop wants a press and a
  // release, and holding ● at a sofa is how the office knows you are still sitting.
  for (const name of ['action', 'back']) {
    const b = btn[name];
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      held.set(e.pointerId, name);
      b.classList.add('down');
    });
    const up = (e) => { if (held.get(e.pointerId) === name) held.delete(e.pointerId); if (![...held.values()].includes(name)) b.classList.remove('down'); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }
  btn.menu.addEventListener('click', (e) => { e.preventDefault(); openSheet(); });
  layout();
  addEventListener('resize', layout);
}

// Where everything stands for this window. The ring goes back to rest unless a
// finger is holding it somewhere else.
function layout() {
  const w = W(), h = H();
  const b = buttonsAt(w, h);
  place(btn.action, b.action.x, b.action.y, ACTION);
  place(btn.back, b.back.x, b.back.y, BACK);
  place(btn.menu, b.menu.x, b.menu.y, MENU);
  if (stickId === null) {
    const c = restCentre(w, h);
    place(ring, c.x, c.y, RING);
    knob.style.transform = '';
  }
}

function stickDown(e) {
  if (!on || layer.hidden || stickId !== null) return;
  if (e.pointerType === 'mouse') return;
  // The stick is taken only from the floor itself — the canvas, or the empty
  // part of the entrance screen, which lets touches through to the canvas. A
  // finger on a menu item, a panel or one of our buttons is theirs.
  if (e.target !== opts.canvas) return;
  const c = grab(e.clientX, e.clientY, W(), H());
  if (!c) return;
  e.preventDefault();
  stickId = e.pointerId;
  centre = c;
  place(ring, c.x, c.y, RING);
  ring.classList.add('live');
  stickMove(e);
}
function stickMove(e) {
  if (e.pointerId !== stickId) return;
  axes = tilt(centre, e.clientX, e.clientY);
  knob.style.transform = `translate(${axes.knob.x - centre.x}px, ${axes.knob.y - centre.y}px)`;
  ring.classList.toggle('run', axes.run && !!(axes.x || axes.y));
}
function stickUp(e) {
  if (e.pointerId !== stickId) return;
  stickId = null; centre = null; axes = null;
  ring.classList.remove('live', 'run');
  layout();
}

// Letting go of everything at once: a panel opened over the layer takes the
// screen, and a finger still counted as on the stick would walk on underneath.
function release() {
  stickId = null; centre = null; axes = null;
  held.clear();
  if (ring) ring.classList.remove('live', 'run');
  for (const b of Object.values(btn)) b.classList.remove('down');
  if (layer) layout();
}

function enable() {
  if (on) return;
  on = true;
  document.body.classList.add('touch');
  if (!layer) build();
  // Shown at once rather than by the next frame's showTouch(): the touch that
  // woke the layer goes on to stickDown() in the same event, and a layer still
  // hidden there dropped it — the first finger on a touchscreen laptop walked
  // nobody, and the office read as deaf. The loop corrects this within a frame
  // if a panel is actually open.
  layer.hidden = false;
}

export function initTouch(options) {
  opts = options;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (coarse) enable();
  // The first touch on a screen that did not call itself coarse turns it on.
  addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && !on) enable();
    stickDown(e);
  }, { passive: false });
  addEventListener('pointermove', stickMove);
  addEventListener('pointerup', stickUp);
  addEventListener('pointercancel', stickUp);
}

export function touchOn() { return on; }

// The layer's state as the gamepad reports it. Off, it is rest.
export function readTouch() {
  if (!on || !layer || layer.hidden) return snapshot(null);
  return snapshot(axes, [...held.values()]);
}

// Shown while the floor or the free entrance screen is what is in front of
// the person; gone, with every finger let go, the moment a panel takes over.
export function showTouch(visible) {
  if (!on || !layer) return;
  const hide = !visible || !sheet.hidden;
  if (hide && !layer.hidden) release();
  layer.hidden = hide;
}

// ------------------------------------------------------------------ the sheet
// «≡ Действия»: the keys of the panels as words. The list is the registry's,
// not one typed here — a module that declares a panel key gets a button the
// same day, and the sheet cannot drift from the keyboard. Two groups are left
// out: walking and SPACE are the stick and ●, and the 1:1 frame is a key for
// whoever is making screenshots, not for a hand on a tablet.
const SKIP = new Set(['act.interact', 'service.shot', 'zoom.in', 'zoom.out', 'zoom.reset']);

export function sheetOpen() { return !!sheet && !sheet.hidden; }

function openSheet() {
  const entrance = opts.entrance();
  // Panels first, as the frame lays them out, then the acts, then the service
  // keys; inside a group the registry's own order, which is the keys panel's too.
  const rank = { panel: 0, act: 1, service: 2 };
  const list = all().filter((a) => a.group !== 'move' && !SKIP.has(a.id) && a.codes.length)
    .map((a, i) => ({ a, i })).sort((p, q) => (rank[p.a.group] ?? 1) - (rank[q.a.group] ?? 1) || p.i - q.i)
    .map((x) => x.a);
  // On the entrance screen only what it answers works; the rest is dimmed
  // rather than removed, so the sheet is the same sheet on both sides of the door.
  const live = (a) => !entrance || opts.entranceActions.includes(a.id);
  sheet.innerHTML = `<div class="rwrap touchwrap">
    <div class="vhead">${tr('touch.title')}<button class="tchclose" aria-label="Esc">✕</button></div>
    <div class="touchbody">
      <div class="touchgrid">${list.map((a) => `<button class="obtn" data-id="${a.id}"${live(a) ? '' : ' disabled'}>${tr(a.hint)}</button>`).join('')}</div>
      <div class="touchzoom"><span>${tr('touch.scale')}</span>
        <button class="obtn" data-id="zoom.out">−</button>
        <b>×${opts.scale()}</b>
        <button class="obtn" data-id="zoom.in">+</button>
      </div>
    </div>
  </div>`;
  sheet.querySelector('.tchclose').onclick = closeSheet;
  for (const b of sheet.querySelectorAll('button[data-id]')) {
    b.onclick = () => {
      const id = b.dataset.id;
      const code = codesOf(id)[0];
      if (!code) return;
      // The scale stays on the sheet — people press it more than once and
      // want to see the number move; everything else is a panel of its own,
      // and the sheet makes way for it.
      if (id.startsWith('zoom.')) {
        opts.press({ key: keyOfCode(code), code });
        sheet.querySelector('.touchzoom b').textContent = `×${opts.scale()}`;
        return;
      }
      closeSheet();
      opts.press({ key: keyOfCode(code), code });
    };
  }
  release();
  sheet.hidden = false;
  layer.hidden = true;
}

export function closeSheet() {
  if (sheet) sheet.hidden = true;
}
