// node tools/test-landing.mjs — демо-этаж лендинга стоит на настоящем офисе.
//
// До 30 августа 2026 у лендинга был свой движок, нарисованный «по мотивам», и
// в нём игрок застревал в дверях: проём 18, коробка 8, окно прохода 10, а
// столкновения по осям раздельно намертво клинили на диагонали. Движок снесли
// и посадили демку на buildLayout/blocked из web/ — те же, которыми ходит
// приложение.
//
// Здесь проверяется не рисование, а два условия, на которых демка вообще имеет
// смысл: каждому выдуманному агенту достался стол, и точка, куда ставится
// игрок, проходима. Второе — прямой наследник того самого бага: посадить
// человека в стену значит встретить посетителя словами «я застрял».
import { AGENTS, BOARD } from '../web/landing.js';
import { buildLayout, blocked, WALL } from '../web/layout.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const L = buildLayout(AGENTS);

ok('этаж построился', !!L && Array.isArray(L.rooms) && L.rooms.length > 0, L && L.rooms && L.rooms.length);
// Считаем только комнаты проектов: пультовая и переговорка тоже лежат в
// L.rooms и помечены service. Первая версия этой проверки сравнивала со всей
// длиной списка и упала при слиянии с main, когда в офисе появилась
// переговорка, — то есть увидела ровно то, ради чего написана.
const projectRooms = L.rooms.filter((r) => !r.service);
ok('комнат столько же, сколько проектов',
  projectRooms.length === new Set(AGENTS.map((a) => a.project)).size,
  { комнат: projectRooms.length, проектов: new Set(AGENTS.map((a) => a.project)).size });
ok('служебные комнаты на месте', L.rooms.some((r) => r.draw === 'security') && L.rooms.some((r) => r.draw === 'meeting'),
  L.rooms.filter((r) => r.service).map((r) => r.key));

// каждому агенту — свой стол, иначе кто-то сидит в воздухе
const seated = new Map();
for (const r of L.rooms) {
  r.agents.forEach((id, i) => { if (r.desks[i]) seated.set(id, { room: r.key, desk: i }); });
}
ok('у каждого агента есть стол', AGENTS.every((a) => seated.has(a.id)),
  AGENTS.filter((a) => !seated.has(a.id)).map((a) => a.id));

// пультовая — та самая, про которую на странице отдельный раздел
// точка появления игрока: она считается в landing.js как первый стол + 44 вниз
const first = L.rooms[0];
const seat0 = first.desks[0];
const start = { x: seat0.x, y: seat0.y + 44 };
ok('игрок появляется не в стене', !blocked(L, start.x, start.y), start);

// и может сделать шаг в любую сторону — иначе он «застрял» уже на старте
const step = 4;
const dirs = [[step, 0], [-step, 0], [0, step], [0, -step]];
const free = dirs.filter(([dx, dy]) => !blocked(L, start.x + dx, start.y + dy));
ok('со старта есть куда шагнуть', free.length >= 2, { свободно: free.length });

// У комнаты есть проходимая дверь. Две предыдущие версии этой проверки падали
// не на этаже, а на моём представлении о нём: сначала я шёл вниз по прямой от
// стола (дверь стоит в другом месте стены), потом щупал нижнюю стену — а
// главная дверь в офисе прорезана в ВЕРХНЕЙ, `r.door`, и ведёт в коридор над
// комнатой. Задняя дверь при этом может оказаться слева или справа.
for (const r of projectRooms) {
  const cx = r.door.x + r.door.w / 2;
  const снаружи = !blocked(L, cx, r.y - 6);
  const вПроёме = !blocked(L, cx, r.y + 4);
  const внутри = !blocked(L, cx, r.y + WALL + 6);
  ok('в комнату ' + r.key + ' можно войти с коридора', снаружи && вПроёме && внутри,
    { снаружи, вПроёме, внутри });

  // косяк рядом с проёмом обязан быть стеной, иначе «дверь» — это дыра во всю стену
  const косяк = blocked(L, r.door.x - 8, r.y + 4);
  ok('у двери ' + r.key + ' есть косяк', косяк, { косяк });
}

// Числа в HUD — это не подпись к картинке, а обещание: тем же числам верит
// заголовок раздела «зачем» («Восемь сессий. Три ждут ответа»). До 30 августа
// 2026 демка показывала пятерых, и страница спорила сама с собой в двух
// экранах прокрутки. Держим строки и состав агентов вместе.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'web', 'landing.html'), 'utf8');
const count = (status) => AGENTS.filter((a) => a.status === status).length;
const hud = (re) => { const m = html.match(re); return m ? Number(m[1]) : null; };

ok('HUD: всего агентов', hud(/hudAgents: '(\d+) agents'/) === AGENTS.length,
  { вHUD: hud(/hudAgents: '(\d+) agents'/), вСписке: AGENTS.length });
ok('HUD: работают', hud(/hudWork: '(\d+) working'/) === count('working'),
  { вHUD: hud(/hudWork: '(\d+) working'/), вСписке: count('working') });
ok('HUD: ждут ответа', hud(/hudWait: '(\d+) waiting on you'/) === count('awaiting'),
  { вHUD: hud(/hudWait: '(\d+) waiting on you'/), вСписке: count('awaiting') });
ok('HUD: в лимите', hud(/hudLimit: '(\d+) out of quota'/) === count('idle'),
  { вHUD: hud(/hudLimit: '(\d+) out of quota'/), вСписке: count('idle') });

// русский HUD обязан говорить то же самое, что английский
ok('русский HUD совпадает с английским', [
  [/hudAgents: '(\d+) агентов'/, AGENTS.length],
  [/hudWork: '(\d+) работают'/, count('working')],
  [/hudWait: '(\d+) ждут тебя'/, count('awaiting')],
  [/hudLimit: '(\d+) в лимите'/, count('idle')],
].every(([re, n]) => hud(re) === n));

// Значок над головой рисует общий drawBubble из badges.js, и он читает
// agent.status и agent.limited. Свой `state` здесь уже был и молча не совпадал
// ни с чем — из-за него все восемь сидящих рисовались как работающие.
ok('поля агентов названы как в офисе',
  AGENTS.every((a) => ['working', 'awaiting', 'idle'].includes(a.status)),
  AGENTS.filter((a) => !['working','awaiting','idle'].includes(a.status)).map((a) => a.id));
ok('ровно один в лимите', AGENTS.filter((a) => a.limited).length === 1,
  AGENTS.filter((a) => a.limited).map((a) => a.id));

// и заголовок раздела «зачем» называет те же восемь и три
ok('заголовок «зачем» согласован с этажом',
  html.includes('Eight sessions. Three are waiting') && AGENTS.length === 8 && count('awaiting') === 3,
  { всего: AGENTS.length, ждут: count('awaiting') });

// Доска: страница обещает «готовое висит на стене, клик — просмотр». Пока
// карточки рисовались, а открыть было нечего, это обещание было обмануто.
// Здесь держим данные в форме, которую просмотр умеет показать.
const files = Object.values(BOARD).flat();
ok('на доске есть работы', files.length >= 5, files.length);
ok('у каждой работы есть автор', files.every((f) => f.who), files.filter((f) => !f.who).map((f) => f.path));
ok('у каждого текстового файла есть содержимое',
  files.filter((f) => !f.image).every((f) => f.body && f.body.length > 40),
  files.filter((f) => !f.image && !(f.body && f.body.length > 40)).map((f) => f.path));
ok('доска есть у каждой комнаты проекта',
  projectRooms.every((r) => (BOARD[r.key] || []).length > 0),
  projectRooms.filter((r) => !(BOARD[r.key] || []).length).map((r) => r.key));

// Слово «демо» до 31 августа 2026 жило только в aria-label: его слышали
// скринридеры и не видел никто. Теперь оно на экране, и на обоих языках.
ok('подпись «демо» есть в разметке', /data-t="demoNote"/.test(html));
ok('подпись «демо» переведена на оба языка',
  /demoNote: 'A demo floor/.test(html) && /demoNote: 'Демо-этаж/.test(html));

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
