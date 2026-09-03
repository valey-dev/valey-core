// Раскладка графа коммитов по полосам. Чистая функция: на входе список из
// server/git.js, на выходе — что нарисовать в каждой строке. Тем и хороша, что
// проверяется без браузера — tools/test-gitgraph.mjs.
//
// Полоса это линия истории, а не ветка: имя ветки живёт в refs и может исчезнуть,
// а линия существует ровно столько, сколько её кто-то ждёт родителем.

// Те же шесть цветов, что и у подсветки кода в highlight.css. Палитра в офисе
// одна: полосе не нужно объяснять отдельно, что зелёный — это зелёный.
export const LANE_COLORS = ['#9fe0a8', '#ffd166', '#8fc8ff', '#c39bff', '#ff9f8f', '#bcd8a8'];

export const laneColor = (i) => LANE_COLORS[i % LANE_COLORS.length];

const firstFree = (active) => {
  for (let i = 0; i < active.length; i++) if (!active[i]) return i;
  return active.length;
};

const busy = (active) => active.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);

// commits идут сверху вниз, как их отдаёт git log: от нового к старому.
export function layoutGraph(commits) {
  const active = [];   // полоса -> хеш, которого она ждёт следующим
  const rows = [];
  let width = 1;

  for (const c of commits) {
    let lane = active.indexOf(c.hash);
    if (lane === -1) {
      lane = firstFree(active);
      active[lane] = c.hash;
    }
    // Тот же коммит могли ждать две полосы сразу — линии сходятся здесь.
    // Он садится в левую, остальные закрываются с уходом внутрь.
    const joins = [];
    active.forEach((h, i) => { if (h === c.hash && i !== lane) joins.push(i); });

    const top = busy(active);

    active[lane] = c.parents[0] || null;
    for (const j of joins) active[j] = null;

    // Второй и следующие родители: либо уходят в уже живую полосу, либо
    // открывают новую справа.
    const steps = [];
    for (const p of c.parents.slice(1)) {
      let to = active.indexOf(p);
      if (to === -1) { to = firstFree(active); active[to] = p; }
      if (to !== lane) steps.push({ from: lane, to });
    }
    while (active.length && !active[active.length - 1]) active.pop();

    const bottom = busy(active);
    width = Math.max(width, lane + 1, ...top.map((i) => i + 1), ...bottom.map((i) => i + 1));
    rows.push({
      hash: c.hash,
      lane,
      merge: c.parents.length > 1,
      top,
      bottom,
      steps,
      joins,
    });
  }
  return { rows, width };
}

// Геометрия одной строки в пикселях: прямоугольники рельсов и точка коммита.
// Отдельно от раскладки, потому что размеры — вопрос вёрстки, а полосы — нет.
export const RAIL = { rowH: 34, laneW: 14, x0: 10, dot: 8, line: 2 };

export function railBits(row, opts = {}) {
  const { rowH, laneW, x0, dot, line } = { ...RAIL, ...opts };
  const cx = (lane) => x0 + lane * laneW;
  const mid = Math.round(rowH / 2);
  const bits = [];
  const rail = (lane, y, h) => bits.push({
    x: cx(lane) - line / 2, y, w: line, h, color: laneColor(lane),
  });

  for (const lane of row.top) if (!row.joins.includes(lane)) rail(lane, 0, mid);
  for (const lane of row.bottom) rail(lane, mid, rowH - mid);

  // Лесенка: горизонтальная перекладина в половине строки плюс отвес по той
  // полосе, куда линия уходит. Кривых нет нарочно — холст пиксельный.
  const stair = (from, to, half) => {
    const a = Math.min(cx(from), cx(to)), b = Math.max(cx(from), cx(to));
    const y = half === 'top' ? mid - line : mid - line / 2;
    bits.push({ x: a, y, w: b - a, h: line, color: laneColor(to) });
    if (half === 'top') bits.push({ x: cx(to) - line / 2, y: 0, w: line, h: mid, color: laneColor(to) });
    else bits.push({ x: cx(to) - line / 2, y: mid, w: line, h: rowH - mid, color: laneColor(to) });
  };
  for (const j of row.joins) stair(row.lane, j, 'top');
  for (const s of row.steps) stair(s.from, s.to, 'bottom');

  const size = row.merge ? dot + 3 : dot;
  return {
    bits,
    dot: {
      x: cx(row.lane) - size / 2,
      y: mid - size / 2,
      size,
      color: laneColor(row.lane),
      merge: row.merge,
    },
    width: cx(Math.max(row.lane, ...row.top, ...row.bottom)) + dot,
  };
}
