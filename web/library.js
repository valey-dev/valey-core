// The tree of modules: what the office is assembled from and what grows out of what.
//
// It lies in the core rather than in the modules, on purpose: a free build has to
// know what it does not have, or the tree has nothing to draw. A node is not a
// module but a branch: free branches have no folder, they are the core itself;
// for paid ones `module` is the id of a folder in modules/, and by it the node
// lights up when the folder is there.
//
// Three tiers — three columns in the bag: «Комната» (free, the root), «Офис»
// (modules, one-off), «Этаж» (the network, by subscription, not built yet). An
// edge goes from what is extended to what extends it: the git tree and the easel
// grow out of the work board, the card index out of the control room. `row` is a
// row in a column, as in the mock-up; the rows of the root's lower branches
// coincide with the rows of «Этаж», so that the edge runs straight past «Офис» —
// that is the network, not the modules.
//
// The mock-up: Figma, Prod, section «18 · Дерево модулей в инвентаре», frames
// 932:2 (a free build) and 934:2 (an «Офис» build). Approved 4 September 2026.
export const TIERS = ['room', 'office', 'floor'];

export const LIBRARY = [
  // ---- «Комната»: the core, free and whole
  { id: 'floor1', tier: 'room', row: 0,
    name: { ru: 'Этаж и комнаты', en: 'Floor and rooms' },
    gives: { ru: 'Комнаты по проектам, таблички на дверях, планировка, лифт между этажами. Столько агентов, сколько запущено, — лимита нет и не будет.',
             en: 'Rooms per project, door plates, the layout, the lift between floors. As many agents as are running — there is no limit and will not be.' },
    where: { ru: 'Это и есть офис: Enter на титульном экране.', en: 'This is the office itself: Enter on the title screen.' } },
  { id: 'art', tier: 'room', row: 1,
    name: { ru: 'Картины, кот, скейт', en: 'Paintings, cat, skate' },
    gives: { ru: 'Картины с пасхалками, кот, скейт у входа, футбол и курилка; день и ночь, погода за окном.',
             en: 'Paintings with easter eggs, the cat, the skate by the door, football and the smoking corner; day and night, weather outside.' },
    where: { ru: 'На этаже. Погода настраивается у окна и по умолчанию выдуманная.', en: 'On the floor. The weather is set at the window and is made up by default.' } },
  { id: 'board', tier: 'room', row: 2,
    name: { ru: 'Доска и заметки', en: 'The board and notes' },
    gives: { ru: 'Доска работ в каждой комнате, заметки в разговоре и все заметки разом.',
             en: 'A work board in every room, notes inside a conversation and all notes at once.' },
    where: { ru: 'Доска — у стены комнаты, заметки — клавиша N.', en: 'The board is on the room wall, notes are on N.' } },
  { id: 'task', tier: 'room', row: 3,
    name: { ru: 'Задания на стол', en: 'Tasks on the desk' },
    gives: { ru: 'Записка на стол агенту и отправка в чат. Доставка в живую сессию остаётся твоим решением, каждый раз.',
             en: 'A note on an agent’s desk and delivery into the chat. Sending into a live session stays your call, every time.' },
    where: { ru: 'Вкладка «задание» в разговоре с агентом.', en: 'The “task” tab in a conversation with an agent.' } },
  { id: 'cctv', tier: 'room', row: 4,
    name: { ru: 'Пультовая с камерами', en: 'The control room' },
    gives: { ru: 'Служебная комната с камерами по всем комнатам. Сюда же встают шкафы и приборы модулей.',
             en: 'A service room with cameras on every room. Module cabinets and instruments stand here too.' },
    where: { ru: 'Лифт, служебный этаж.', en: 'The lift, the service floor.' } },
  { id: 'radio', tier: 'room', row: 5, module: 'radio',
    name: { ru: 'Радио у входа', en: 'The radio' },
    gives: { ru: 'Приёмник у входа: lofi для работы, тихое пианино, своя волна из Spotify — своим ключом, мимо нас.',
             en: 'A receiver by the door: lofi for work, quiet piano, your own wave from Spotify — with your key, past us.' },
    where: { ru: 'Первый бесплатный модуль: лежит в modules/radio рядом с офисом.', en: 'The first free module: it lives in modules/radio next to the office.' } },
  { id: 'dress', tier: 'room', row: 6,
    name: { ru: 'Дресс-код, инвентарь', en: 'Dress code, inventory' },
    gives: { ru: 'Свой персонаж, одежда на весь этаж, паки имён, эта панель.',
             en: 'Your own character, clothes for the whole floor, name packs, this panel.' },
    where: { ru: 'Клавиши C и I.', en: 'Keys C and I.' } },
  { id: 'agents', tier: 'room', row: 7,
    name: { ru: 'Агенты и роли', en: 'Agents and roles' },
    gives: { ru: 'Каждая сессия Claude Code — человек на этаже: статус, пузырь, роль, внешность, имя.',
             en: 'Every Claude Code session is a person on the floor: status, bubble, role, looks, name.' },
    where: { ru: 'Читается из ~/.claude на этой машине; наружу не уходит ничего.', en: 'Read from ~/.claude on this machine; nothing leaves it.' } },
  { id: 'talk', tier: 'room', row: 8,
    name: { ru: 'Разговор с агентом', en: 'Talking to an agent' },
    gives: { ru: 'Диалог, транскрипт, список файлов и просмотр; разметка .md, подсветка кода, песочница для .html.',
             en: 'Dialogue, transcript, the file list and the viewer; .md rendering, code highlighting, a sandbox for .html.' },
    where: { ru: 'Подойти и нажать ПРОБЕЛ.', en: 'Walk up and press SPACE.' } },
  { id: 'door', tier: 'room', row: 9,
    name: { ru: 'Вход и два языка', en: 'Entrance, two languages' },
    gives: { ru: 'Титульный экран, русский и английский, звук офиса.',
             en: 'The title screen, Russian and English, the office sound.' },
    where: { ru: 'Язык переключается у таблички в коридоре.', en: 'The language switches at the sign in the corridor.' } },

  // ---- «Офис»: the modules, growing out of the branches of the root
  { id: 'bible', tier: 'office', row: 0, parent: 'floor1', module: 'bible',
    name: { ru: 'Офисная библия', en: 'The office bible' },
    gives: { ru: 'Книга метода в читальне на этаже 0: как давать задание, работать в параллель, писать отчёт, которому верят.',
             en: 'The book of method in the reading room on floor 0: how to give a task, work in parallel, write a report people trust.' },
    without: { ru: 'Этажа 0 нет вовсе: ни комнаты, ни остановки лифта.', en: 'There is no floor 0 at all: no room, no lift stop.' } },
  // The easel grows out of the work board rather than out of the paintings on the
  // wall: on 4 September 2026 it was decided that it is a working tool, and a
  // professional one at that — without Figma it is not needed at all — and among
  // the cat and the skateboard it stood by its looks rather than by its business.
  // The board therefore has two children, and the edge to the easel goes by an elbow.
  { id: 'easel', tier: 'office', row: 1, parent: 'board', module: 'easel',
    name: { ru: 'Мольберт с макетами', en: 'The easel' },
    gives: { ru: 'Страница WIP твоего файла Figma на стене комнаты: секции, кадры и кружок состояния. Видно, что утверждено и что ещё рисуется.',
             en: 'The WIP page of your Figma file on the room wall: sections, frames and the state circle — what is approved and what is still being drawn.' },
    without: { ru: 'Мольберта в комнате нет.', en: 'There is no easel in the room.' } },
  { id: 'gittree', tier: 'office', row: 2, parent: 'board', module: 'gittree',
    name: { ru: 'Дерево гита', en: 'The git tree' },
    gives: { ru: 'В комнате с репозиторием растёт дерево. ПРОБЕЛ — история проекта: ветки, коммиты, кто и когда, отметка «этого ещё нет на origin». ENTER на коммите открывает диф.',
             en: 'A tree grows in a room with a repository. SPACE — the project history: branches, commits, who and when, a mark for “not on origin yet”. ENTER on a commit opens the diff.' },
    without: { ru: 'В углу комнаты обычный цветок, и смотреть историю негде. Серых заглушек в комнате не остаётся.',
               en: 'An ordinary plant stands in the corner and there is nowhere to read the history. No grey placeholders are left in the room.' } },
  { id: 'feed', tier: 'office', row: 3, parent: 'task', module: 'feed',
    name: { ru: 'Живая лента', en: 'The live feed' },
    gives: { ru: 'События офиса на телефоне: PWA и журнал. Телефон достаёт офис по твоей же сети или туннелю, наших серверов в этом нет.',
             en: 'Office events on your phone: a PWA and a journal. The phone reaches the office over your own network or tunnel; none of our servers are involved.' },
    without: { ru: 'Телефону показать нечего: ленты нет.', en: 'There is nothing to show the phone: no feed.' } },
  { id: 'dossier', tier: 'office', row: 4, parent: 'cctv', module: 'dossier',
    name: { ru: 'Картотека личных дел', en: 'Personnel files' },
    gives: { ru: 'Личное дело каждого агента: бланк, счётчики, история.',
             en: 'A personnel file for every agent: the form, counters, history.' },
    without: { ru: 'Шкафа в пультовой нет.', en: 'There is no cabinet in the control room.' } },
  { id: 'more', tier: 'more', row: 5,
    name: { ru: '+ то, что выйдет за год', en: '+ whatever ships this year' },
    gives: { ru: '«Офис» — год обновлений: модули приезжают вместе с ними и появляются в офисе сами. Списка нет нарочно: обещать число нельзя, обещать «приедет само» — можно.',
             en: '“Office” is a year of updates: modules arrive with them and appear in the office by themselves. There is no list on purpose: a number cannot be promised, “it arrives on its own” can.' } },

  // ---- «Этаж»: the network, growing out of the lower branches of the root past «Офис»
  { id: 'floor', tier: 'floor', row: 7, parent: 'agents',
    name: { ru: 'Общий этаж: тиммейты', en: 'Floor with teammates' },
    gives: { ru: 'Агенты и люди нескольких участников на одном этаже — чужие сессии видны проекцией с их машины, а не копией файлов. Прочитать, чем занят чужой агент, — да; открыть его транскрипт — только с согласия хозяина.',
             en: 'Agents and people of several members on one floor — other sessions are projected from their machines, not copied. Reading what someone’s agent is doing — yes; opening its transcript — only with the owner’s consent.' },
    without: { ru: 'Этаж один и твой. Соседа некуда принять: у него свой офис на своей машине.', en: 'The floor is one and yours. There is nowhere to receive a neighbour: they have their own office on their own machine.' } },
  { id: 'meet', tier: 'floor', row: 8, parent: 'talk',
    name: { ru: 'Переговорка', en: 'The meeting room' },
    gives: { ru: 'Комната со звуком для людей на общем этаже.', en: 'A room with sound for the people on the shared floor.' },
    without: { ru: 'Закрытая дверь с табличкой: комната — это архитектура, и пустое место было бы дырой в стене.',
               en: 'A closed door with a plate: a room is architecture, and an empty spot would be a hole in the wall.' } },
  { id: 'guest', tier: 'floor', row: 9, parent: 'door',
    name: { ru: 'Гости по ссылке', en: 'Guests by link' },
    gives: { ru: 'Гость входит по ссылке и видит этаж; доступ к чему-либо — только с согласия хозяина, и ссылку можно погасить.',
             en: 'A guest enters by link and sees the floor; access to anything — only with the owner’s consent, and the link can be revoked.' },
    without: { ru: 'Ссылку выдать некому: выдача и отзыв живут на нашей стороне.', en: 'There is nobody to issue the link to: issuing and revoking live on our side.' } },
];

export const byId = (id) => LIBRARY.find((n) => n.id === id);
export const children = (id) => LIBRARY.filter((n) => n.parent === id);
// The column of a node: "what will come out over the year" stands in the «Офис» column.
export const colOf = (n) => (n.tier === 'more' ? 1 : TIERS.indexOf(n.tier));
