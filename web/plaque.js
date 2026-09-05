// The plaque over the office door — a module of its own, because two things draw it.
//
// The entrance screen hangs it on the wall, and the generator of the form's cover
// prints a picture out of it. While there was no shared module, the cover was
// drawn alongside "after the motifs", and it diverged silently: wood #6f4f2e
// instead of #6b472a, text #fbdc8d instead of #ffd166, and the lines swapped —
// the small one on top, VALEY underneath. Nobody noticed, because there was
// nothing to compare against: two pictures in two windows look equally like the
// truth.
//
// It depends on pixfont only — no DOM, no i18n — so that the generator can call
// it from node without a browser. For the same reason the module moved here out
// of title.js whole: the site lives in its own repository and takes the plaque
// from here.
import * as PF from './pixfont.js';

const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

// The geometry is in the pixels of the 400×225 world. The nails stick out 4 px
// above the frame, and that is part of the picture: the cover counts its safe
// area from them, not from the frame.
export const PLAQUE = { x: 148, y: 76, w: 104, h: 24 };
export const NAIL_RISE = 4;

// Both lines are set in pixels, not by fillText. Five-point type on a 400×225
// canvas is drawn in grey half-tones, and the office blows every half-tone up
// into a square: on a frame from the office «офис агентов» was unreadable, letter
// by letter.
//
// The face is chosen by the string itself, not by the language. A Russian one
// needs the wide face — there is no Cyrillic in 3×5 and there will not be; an
// English one is served by 3×5, where the Latin alphabet is complete. If no face
// takes the string, the fallback is called: a soapy caption is better than a
// missing one. The caller passes it in — the entrance screen can do pxText, the
// cover generator cannot.
export function drawPlaque(ctx, P, sub, fallback) {
  px(ctx, P.x, P.y, P.w, P.h, '#8a5f3a');
  px(ctx, P.x + 2, P.y + 2, P.w - 4, P.h - 4, '#6b472a');
  px(ctx, P.x + 12, P.y - NAIL_RISE, 3, 5, '#6d5040');
  px(ctx, P.x + P.w - 15, P.y - NAIL_RISE, 3, 5, '#6d5040');

  const mid = P.x + P.w / 2;
  PF.drawText(ctx, 'VALEY', Math.round(mid - PF.textWidth('VALEY', PF.WIDE, 2) / 2), P.y + 3, '#ffd166', PF.WIDE, 2);

  const face = PF.canDraw(sub, PF.WIDE) ? PF.WIDE : PF.canDraw(sub) ? PF.SMALL : null;
  if (face) PF.drawText(ctx, sub, Math.round(mid - PF.textWidth(sub, face) / 2), P.y + 15, '#c9b391', face);
  else if (fallback) fallback(ctx, sub, P.x + 30, P.y + 20, '#c9b391', 5);
}
