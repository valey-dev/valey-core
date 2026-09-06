// How much world is visible and at what scale. Pure arithmetic — no DOM, no canvas —
// so a stand checks it instead of an eye.
//
// The rule was approved by the "Масштаб офиса" frames on 6 September 2026: the scale is
// counted from the width and promises no less than BASE_W game pixels of world, while the
// visible slice of the world comes from the window — so there are never bars around the
// canvas.
//
// Before that the canvas was a fixed 400×225 and the scale was fitted to the window, so on
// a 1080×1920 vertical monitor the office lay as an 800×450 strip in the middle of an empty
// screen. The world is already larger than the canvas — the camera follows the player and
// stops at the floor edges — so "a bigger window" means "more is visible", not "bigger
// pixels".
//
// The scale is counted in PHYSICAL pixels per game pixel: only a whole number keeps a pixel
// a pixel. At a fractional browser zoom one game pixel would be stretched over 3.3 dots —
// some rows three, some four — and the seven-pixel font above the heads turns to soap.

export const BASE_W = 400;   // the width of world we promise on any window
export const BASE_H = 225;   // the entrance scene is drawn in these pixels
export const SCALE_MIN = 2, SCALE_MAX = 8;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// availW/availH — the free area in CSS pixels, dpr — devicePixelRatio,
// wanted — the step a person chose (0 = count it ourselves),
// fixed — the entrance screen: drawn in BASE_W×BASE_H and never stretched.
export function viewport(availW, availH, dpr = 1, wanted = 0, fixed = false) {
  const pw = Math.max(1, Math.round(availW * dpr));
  const ph = Math.max(1, Math.round(availH * dpr));

  if (fixed) {
    // The entrance scene whole or not at all: the scale is fitted on both sides, and
    // ×1 is allowed here — a window can be smaller than the scene, and it still must show.
    const scale = clamp(Math.min(Math.floor(pw / BASE_W), Math.floor(ph / BASE_H)), 1, SCALE_MAX);
    return { scale, vw: BASE_W, vh: BASE_H, auto: !wanted, tight: scale < SCALE_MIN };
  }

  const auto = clamp(Math.floor(pw / BASE_W), SCALE_MIN, SCALE_MAX);
  const scale = wanted ? clamp(Math.round(wanted), SCALE_MIN, SCALE_MAX) : auto;
  const vw = Math.max(1, Math.floor(pw / scale));
  const vh = Math.max(1, Math.floor(ph / scale));
  // The window is narrower than the promise: less than BASE_W of world fits across. We
  // do not go below SCALE_MIN — at ×1 the pixel art stops reading, which is worse than a
  // narrow slice of world.
  return { scale, vw, vh, auto: !wanted, tight: vw < BASE_W };
}

// A manual step. Returns the new scale, or null when there is nowhere to move — the
// caller turns that null into a message saying what it ran into.
export function stepScale(from, dir) {
  const next = clamp(from + dir, SCALE_MIN, SCALE_MAX);
  return next === from ? null : next;
}
