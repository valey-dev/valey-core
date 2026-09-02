// Демо-этаж лендинга: тот же офис, только агенты выдуманы.
//
// До 30 августа 2026 здесь жил второй движок — лендинг верстался отдельным
// артефактом, импортировать было неоткуда, и офис был нарисован заново «по
// мотивам»: мир 320×150 вместо 400×225, стол 26×10 вместо 48×14, таблички
// системным Courier в 6 пикселей вместо пиксельного шрифта. Отличия копились
// молча, а игрок вдобавок застревал в дверях: проём 18, коробка 8, окно
// прохода 10, и столкновения по осям раздельно намертво клинили на диагонали.
//
// Чинить это было нельзя — только снести. Рисование офиса от сервера не
// зависит вовсе: buildLayout и blocked — чистые функции от списка агентов,
// draw* из office.js берут готовый план, и ни один из этих модулей не ходит
// в сеть. Значит демо-этаж собирается из выдуманного списка теми же функциями,
// и любая правка настоящего офиса приезжает сюда сама.
import { buildLayout, blocked } from './layout.js';
import {
  drawCorridor, drawRoom, drawRoomProps, drawSecurity, drawMeeting, drawLift, drawReception,
  drawDesk, drawBoard, pxText,
} from './office.js';
import { lookOf, drawPerson } from './sprites.js';
import { drawBubble } from './badges.js';

const VW = 400, VH = 225;                 // тот же вид, что в офисе

// Восемь выдуманных агентов в трёх проектах: 4 работают, 3 ждут ответа, 1 в
// лимите. Поля названы как в офисе — status и limited, — потому что значок над
// головой рисует общий drawBubble из badges.js, а он читает именно их. Числа не случайные — их называет заголовок раздела «зачем»
// («Восемь сессий. Три ждут ответа»), и до 30 августа 2026 демка показывала
// пятерых, то есть страница спорила сама с собой в двух экранах прокрутки.
// Поля ровно те, которые читает рисование: id, name, project, state, mood.
export const AGENTS = [
  { id: 'a1', name: 'Пётр', project: 'valey',      status: 'working',  mood: 'code',
    en: { name: 'Pyotr', role: 'Developer', act: 'Edit · server/agents.js', when: 'spoke a minute ago',
          say: 'Taught it to recognise the subscription limit — that line is a notice now, not something the agent said. Tests left to run.' },
    ru: { name: 'Пётр', role: 'Разработчик', act: 'Edit · server/agents.js', when: 'говорил минуту назад',
          say: 'Добавил распознавание лимита подписки — теперь это объявление, а не реплика агента. Осталось прогнать тесты.' } },
  { id: 'a2', name: 'Ася', project: 'valey',       status: 'awaiting',  mood: 'design',
    en: { name: 'Asya', role: 'Designer', act: 'waiting on you · 12 minutes', when: 'spoke 12 minutes ago',
          say: 'I hung the corridor paintings two ways. Which do we keep — tight between the windows, or sparse?' },
    ru: { name: 'Ася', role: 'Дизайнер', act: 'ждёт твоего ответа · 12 минут', when: 'говорил 12 минут назад',
          say: 'Собрала две развески картин для коридора. Какую берём — плотную по простенкам или разреженную?' } },
  { id: 'a3', name: 'Марк', project: 'storefront', status: 'working',  mood: 'research',
    en: { name: 'Mark', role: 'Researcher', act: 'WebSearch · "spotify web playback sdk"', when: 'spoke 3 minutes ago',
          say: 'Digging into why the SDK answers account_error without Premium. So far that looks like the only cause.' },
    ru: { name: 'Марк', role: 'Исследователь', act: 'WebSearch · «spotify web playback sdk»', when: 'говорил 3 минуты назад',
          say: 'Ищу, почему SDK отвечает account_error без Premium. Пока похоже, что это единственная причина.' } },
  { id: 'a4', name: 'Гоша', project: 'storefront', status: 'idle', limited: true, mood: 'code',
    en: { name: 'Gosha', role: 'Developer', act: 'out of quota — dozing', when: 'spoke 40 minutes ago',
          say: "Hit the session limit. I'll walk back to my desk on my own as soon as access returns." },
    ru: { name: 'Гоша', role: 'Разработчик', act: 'лимит кончился — дремлет', when: 'говорил 40 минут назад',
          say: 'Упёрся в лимит сессии. Вернусь за стол сам, как только доступ появится.' } },
  { id: 'a6', name: 'Тимка', project: 'valey',      status: 'awaiting',  mood: 'qa',
    en: { name: 'Timka', role: 'QA', act: 'waiting on you \u00b7 6 minutes', when: 'spoke 6 minutes ago',
          say: 'The doorway test passes on my machine and fails on yours. Do I chase it, or do we ship and watch?' },
    ru: { name: 'Тимка', role: 'Тестировщик', act: 'ждёт твоего ответа \u00b7 6 минут', when: 'говорил 6 минут назад',
          say: 'Тест на дверные проёмы у меня зелёный, у тебя красный. Копать дальше или выкатываем и смотрим?' } },
  { id: 'a7', name: 'Марта', project: 'storefront', status: 'working',  mood: 'plan',
    en: { name: 'Marta', role: 'Product', act: 'Write \u00b7 pricing.md', when: 'spoke 8 minutes ago',
          say: 'Writing down what the free tier actually includes, because right now two pages answer that differently.' },
    ru: { name: 'Марта', role: 'Продакт', act: 'Write \u00b7 pricing.md', when: 'говорил 8 минут назад',
          say: 'Записываю, что входит в бесплатный тариф: сейчас две страницы отвечают на это по-разному.' } },
  { id: 'a8', name: 'Савва', project: 'docs-site',  status: 'working',  mood: 'release',
    en: { name: 'Savva', role: 'Release engineer', act: 'Bash \u00b7 npm version patch', when: 'spoke 2 minutes ago',
          say: 'Cutting 0.1.1. The tag and the plaque in the office read the same version now, so the video will not lie.' },
    ru: { name: 'Савва', role: 'Релиз-инженер', act: 'Bash \u00b7 npm version patch', when: 'говорил 2 минуты назад',
          say: 'Режу 0.1.1. Тег и табличка в офисе теперь показывают одну версию — ролик не соврёт.' } },
  { id: 'a5', name: 'Лиза', project: 'docs-site',  status: 'awaiting',  mood: 'plan',
    en: { name: 'Liza', role: 'Product', act: 'waiting on you · 4 minutes', when: 'spoke 4 minutes ago',
          say: "Broke the landing page into seven blocks. Confirm the order and I'll hand it to layout." },
    ru: { name: 'Лиза', role: 'Продакт', act: 'ждёт твоего ответа · 4 минуты', when: 'говорил 4 минуты назад',
          say: 'Разложила лендинг на семь блоков. Подтверди порядок — и я отдам его в вёрстку.' } },
];

// Файлы на доске. Выдуманные, как и агенты, и панель говорит об этом вслух:
// показываем механику — «готовое висит на стене» — а не чью-то работу.
// path и image нужны отрисовке доски, остальное — просмотру.
export const BOARD = {
  valey: [
    { path: 'paintings.md', who: 'Ася', body: '# Развеска картин\n\nСобрала два варианта для коридора: плотный по простенкам и разреженный.\n\n## Плотный\n\n- картина каждые 40 пикселей мира\n- в узких простенках рама налезает на окно\n- зато коридор не выглядит пустым\n\n## Разреженный\n\n- одна картина на простенок, остальное стена\n- пустее, но рамы нигде не спорят с окнами\n\nЖду решения, чтобы не вешать дважды.' },
    { path: 'limit-notice.md', who: 'Пётр', body: '# Лимит подписки\n\nЭто говорит подписка, а не агент. В офисе такое должно выглядеть объявлением на двери, а не его репликой.\n\n```\nYou have hit your session limit \u00b7 resets 12:10am\n```\n\nСервер ловит такие строки отдельно и отдаёт полем `limited`, вместе со временем возврата.' },
  ],
  storefront: [
    { path: 'sdk-notes.md', who: 'Марк', body: '# Spotify Web Playback SDK\n\nИщу, почему SDK отвечает `account_error` без Premium. Пока похоже, что это единственная причина, но проверил не всё.\n\n## Что проверено\n\n- токен живой, `/me` отвечает 200\n- `device_id` приходит, плеер регистрируется\n- на Premium-аккаунте тот же код играет\n\n```\nplayer.addListener(\'account_error\', e => {\n  console.log(e.message);   // Premium required\n});\n```\n\nВывод: без Premium играть нельзя вообще, превью на 30 секунд SDK не отдаёт.' },
    { path: 'pricing.md', who: 'Марта', body: '# Что входит в бесплатный тариф\n\nСейчас две страницы отвечают на это по-разному, и это надо свести.\n\n- на лендинге сказано «всё локально, зависимостей нет»\n- в справке упомянут лимит на число комнат, которого в коде нет\n\nПишу один список и убираю второй.' },
    { path: 'checkout.png', who: 'Марк', image: true },
  ],
  'docs-site': [
    { path: 'blocks.md', who: 'Лиза', body: '# Лендинг: семь блоков\n\n1. Заголовок и демо-этаж\n2. Зачем — три столба\n3. Приватность\n4. Что дальше\n5. Замер спроса\n6. Скачать\n7. Подвал\n\nПодтверди порядок — и я отдам в вёрстку.' },
    { path: 'release.md', who: 'Савва', body: '# 0.1.1\n\nТег и табличка в офисе показывают одну версию — ролик не соврёт.\n\n```\nnpm version patch\n```' },
  ],
};

export function createFloor(canvas, opts = {}) {
  const view = canvas.getContext('2d');
  const buf = document.createElement('canvas');
  buf.width = VW; buf.height = VH;
  const ctx = buf.getContext('2d');

  const L = buildLayout(AGENTS);
  const byId = new Map(AGENTS.map((a) => [a.id, a]));
  const looks = new Map(AGENTS.map((a) => [a.id, lookOf(a.id + a.name)]));

  // Игрок ставится внутрь первой комнаты, у столов. Не в (0,0) — оттуда его
  // вытолкнет первым же кадром, и первое впечатление будет «застрял», — и не
  // в коридор под комнатой: камера тогда смотрит в пустой пол, а весь смысл
  // кадра в том, что за столами кто-то сидит.
  const first = L.rooms[0];
  const seat0 = first && first.desks[0];
  const me = {
    x: seat0 ? seat0.x : (first ? first.x + first.w / 2 : 80),
    y: seat0 ? seat0.y + 44 : (first ? first.y + first.h - 30 : 80),
    dir: 0, moving: false, look: opts.look || lookOf('гость-в-офисе'),
  };
  const keys = new Set();
  let focused = false, talking = null, cam = { x: 0, y: 0 };

  const seatOf = (a) => {
    for (const r of L.rooms) {
      const i = r.agents.indexOf(a.id);
      if (i >= 0) { const d = r.desks[i]; if (d) return { r, d }; }
    }
    return null;
  };
  const seats = new Map(AGENTS.map((a) => [a.id, seatOf(a)]).filter(([, s]) => s));

  // Доска висит на верхней стене комнаты. Подходить к ней надо изнутри, поэтому
  // меряем до её нижнего края, а не до середины.
  const nearestBoard = () => {
    let best = null, bd = 44;
    for (const r of L.rooms) {
      if (r.service || !r.board) continue;
      const bx = r.board.x + r.board.w / 2, by = r.board.y + r.board.h;
      const d = Math.hypot(bx - me.x, by - me.y);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  };

  const nearest = () => {
    let best = null, bd = 46;
    for (const a of AGENTS) {
      const s = seats.get(a.id); if (!s) continue;
      // меряем до самого агента: он сидит в desk.y, а не на 16 пикселей ниже
      const d = Math.hypot(s.d.x - me.x, s.d.y - me.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  };

  function draw(t) {
    const night = 0.35;
    ctx.fillStyle = '#1b120c'; ctx.fillRect(0, 0, VW, VH);
    const camX = Math.max(0, Math.min(Math.max(0, L.w - VW), Math.round(me.x - VW / 2)));
    const camY = Math.max(0, Math.min(Math.max(0, L.h - VH), Math.round(me.y - VH / 2)));
    cam = { x: camX, y: camY };
    ctx.save(); ctx.translate(-camX, -camY);

    drawCorridor(ctx, L, t, night, { kind: 'clear', intensity: 0.4, wind: 0.2 });
    const visible = L.rooms.filter((r) => r.x < camX + VW + 40 && r.x + r.w > camX - 40
      && r.y - 20 < camY + VH && r.y + r.h > camY - 40);
    // Служебные комнаты приехали в общий список и рисуются по r.draw — так же,
    // как их рисует main.js. Раньше пультовая лежала отдельно в L.security;
    // после слияния с main этой ветки уже нет, и повторять её здесь значило бы
    // снова завести вторую версию офиса.
    for (const r of visible) {
      if (r.draw === 'security') { drawSecurity(ctx, r, t, { unlocked: false, camsOn: false }); continue; }
      if (r.draw === 'meeting') { drawMeeting(ctx, r, t); continue; }
      drawRoom(ctx, r, t); drawRoomProps(ctx, r, t);
    }
    drawLift(ctx, L, t, {});
    drawReception(ctx, L, t);

    const draws = [];
    for (const r of visible) {
      if (r.service) continue;                 // у пультовой и переговорки нет ни доски, ни столов
      draws.push({ y: r.y - 1, fn: () => drawBoard(ctx, r, BOARD[r.key] || [], t, false) });
      r.desks.forEach((d, i) => {
        const a = byId.get(r.agents[i]);
        draws.push({ y: d.y + 12, fn: () => drawDesk(ctx, d, a, t) });
      });
    }
    // Сидящий агент стоит ровно в desk.x/desk.y и рисуется РАНЬШЕ стола — тогда
    // столешница закрывает ноги, и человек выглядит сидящим. Так делает офис
    // (actors.js сажает в spot.desk.x/y, main.js кладёт стол на y+12). У меня
    // сначала было +16 и порядок наоборот: все восемь стояли за столами.
    for (const a of AGENTS) {
      const s = seats.get(a.id); if (!s) continue;
      const frame = a.status === 'idle' ? Math.floor(t / 520) : Math.floor(t / 160);
      draws.push({ y: s.d.y, fn: () => {
        drawPerson(ctx, s.d.x, s.d.y, looks.get(a.id), { pose: 'sit', frame, dir: 0 });
        drawBubble(ctx, s.d.x + 14, s.d.y - 26, a, t);
      } });
    }
    draws.push({ y: me.y, fn: () => drawPerson(ctx, me.x, me.y, me.look, {
      pose: me.moving ? 'walk' : 'stand', frame: Math.floor(t / 130), dir: me.dir }) });

    draws.sort((a, b) => a.y - b.y).forEach((d) => d.fn());

    if (!talking) {
      const hint = opts.talkHint ? opts.talkHint() : 'SPACE';
      const a = nearest();
      if (a) {
        const s = seats.get(a.id);
        pxText(ctx, hint, s.d.x - 12, s.d.y - 22, '#ffd166');
      } else {
        // у доски подсказка тоже нужна: без неё карточки выглядят нажимаемыми
        // и молчат — ровно то, что чинится этой правкой
        const r = nearestBoard();
        if (r) pxText(ctx, hint, r.board.x + r.board.w / 2 - 12, r.board.y + r.board.h + 12, '#ffd166');
      }
    }
    ctx.restore();

    view.imageSmoothingEnabled = false;
    view.clearRect(0, 0, canvas.width, canvas.height);
    view.drawImage(buf, 0, 0, canvas.width, canvas.height);
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(50, now - last) / 16.67; last = now;
    if (focused && !talking) {
      const fast = keys.has('shift') ? 2.4 : 1.5;
      let dx = 0, dy = 0;
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;
      me.moving = !!(dx || dy);
      if (me.moving) {
        const k = (dx && dy) ? 0.707 : 1;
        const nx = me.x + dx * fast * k * dt, ny = me.y + dy * fast * k * dt;
        // те же столкновения, что в офисе: в дверях больше не клинит
        if (!blocked(L, nx, me.y)) me.x = nx;
        if (!blocked(L, me.x, ny)) me.y = ny;
        if (dx) me.dir = dx > 0 ? 1 : -1;
      }
    } else me.moving = false;
    draw(now);
    if (opts.onRoom) opts.onRoom(roomOf());
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function roomOf() {
    for (const r of L.rooms) if (me.x > r.x && me.x < r.x + r.w && me.y > r.y && me.y < r.y + r.h) return r.title;
    return null;
  }

  return {
    layout: L,
    agents: AGENTS,
    focus(on) { focused = on; if (!on) keys.clear(); },
    key(k, down) { const s = k.toLowerCase(); if (down) keys.add(s); else keys.delete(s); },
    act() {
      if (talking) { talking = null; return null; }
      // агент вперёд доски: у стола стоишь ближе, и разговор ожидаемее
      const a = nearest();
      if (a) { talking = a; return { kind: 'agent', agent: a }; }
      const r = nearestBoard();
      if (r) return { kind: 'board', room: r, files: BOARD[r.key] || [] };
      return null;
    },
    close() { talking = null; },
    talking: () => talking,
    setLook(look) { me.look = look; },
  };
}
