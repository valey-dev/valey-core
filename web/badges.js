// The badge above the head: what the person is busy with right now. It lived
// inside main.js and was reachable from nowhere — while the state sheet for the
// design library has to draw exactly the same badge as the office. A copy in the
// mock-up would diverge from the engine silently, so the badge moved out here and
// is drawn by one function in both places.
import { pxText } from './office.js';

// The shell alone: the box, the tail and the light border. Exported because a
// module draws its own state inside the same bubble — the voice puts a speaking
// mark over a person's head — and a second bubble drawn by hand somewhere else
// would drift from this one exactly the way the mock-up used to.
export function bubbleShell(ctx, x, y) {
  const w = 16, h = 12;
  ctx.fillStyle = 'rgba(28,22,18,0.85)';
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillRect(x - 2, y, 4, 3);
  ctx.fillStyle = '#f6e3c0';
  ctx.fillRect(x - w / 2, y - h, w, 1); ctx.fillRect(x - w / 2, y - 1, w, 1);
  ctx.fillRect(x - w / 2, y - h, 1, h); ctx.fillRect(x + w / 2 - 1, y - h, 1, h);
}

export function drawBubble(ctx, x, y, agent, t) {
  bubbleShell(ctx, x, y);
  if (agent.limited) {
    // an hourglass: there is nothing to work with, waiting for the limit to reset
    const flip = Math.floor(t / 900) % 2;
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x - 3, y - 11, 6, 1); ctx.fillRect(x - 3, y - 3, 6, 1);
    ctx.fillRect(x - 2, y - 10, 4, 1); ctx.fillRect(x - 2, y - 4, 4, 1);
    ctx.fillRect(x - 1, y - 9, 2, 1); ctx.fillRect(x - 1, y - 5, 2, 1);
    ctx.fillRect(x, y - 8, 1, 3);
    ctx.fillStyle = '#e8a33c';
    ctx.fillRect(x - 2, flip ? y - 9 : y - 5, 4, 1);
  } else if (agent.status === 'awaiting') {
    const blink = Math.sin(t / 260) > -0.3;
    ctx.fillStyle = blink ? '#ffd166' : '#8a6a2a';
    ctx.fillRect(x - 1, y - 10, 2, 5); ctx.fillRect(x - 1, y - 4, 2, 2);
  } else if (agent.status === 'stopped') {
    // Two bars, still: cut off mid-step. It does not blink — blinking calls, and
    // a stopped agent has nothing to call about. The colour is --off.
    // Design: [Bubbles · stopped](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=2122-6372)
    ctx.fillStyle = '#c2795f';
    ctx.fillRect(x - 3, y - 10, 2, 7); ctx.fillRect(x + 1, y - 10, 2, 7);
  } else if (agent.status === 'idle') {
    pxText(ctx, 'z z', x - 6, y - 3, '#9fb4c8');
  } else {
    const col = { design: '#c39bff', research: '#8fc8ff', plan: '#ffd166', test: '#ff9f8f', build: '#ffc48f' }[agent.mood] || '#9fe0a8';
    for (let i = 0; i < 3; i++) {
      const on = (Math.floor(t / 220) % 3) === i;
      ctx.fillStyle = on ? col : 'rgba(255,255,255,0.22)';
      ctx.fillRect(x - 5 + i * 4, y - 7 - (on ? 1 : 0), 2, 2);
    }
  }
}
