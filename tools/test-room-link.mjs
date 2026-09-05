// node tools/test-room-link.mjs — where `#room=` in the address takes you.
//
// The address is the only way into the service rooms: the control room, the
// meeting room and the greenhouse are not in the TAB round and walking there
// costs a minute of held keys. On 5 September 2026 four attempts at a screenshot
// of the personnel files went nowhere — the rulebook promised «including service
// rooms» while the code searched the project rooms only and silently dropped the
// player into the first one it found. Nothing said it had missed.
//
// The layout is built for real: the picker is fed the same object the office
// gets, so a renamed field breaks the stand rather than the address.
import { buildLayout, pickRoom } from '../web/layout.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};

const agents = [
  { id: 'a', name: 'Тоня', project: 'carbonara-restaurant', seat: 0, roleKey: 'code', status: 'working' },
  { id: 'b', name: 'Пётр', project: 'storefront', seat: 0, roleKey: 'qa', status: 'idle' },
];
const L = buildLayout(agents);

// ------------------------------------------------------------- service rooms
ok('пультовая — по полному ключу', pickRoom(L, '__security')?.security === true, pickRoom(L, '__security')?.key);
ok('и без подчёркиваний, как напечатает человек', pickRoom(L, 'security')?.security === true, pickRoom(L, 'security')?.key);
ok('переговорка', pickRoom(L, 'meeting')?.meeting === true, pickRoom(L, 'meeting')?.key);
ok('оранжерея', pickRoom(L, 'greenhouse')?.greenhouse === true, pickRoom(L, 'greenhouse')?.key);

// ------------------------------------------------------------ project rooms
const proj = pickRoom(L, 'carbonara');
ok('старые ссылки по началу заголовка живы', !!proj && proj.title.startsWith('carbonara'), proj && proj.title);
ok('и по ключу проекта тоже', pickRoom(L, L.projectRooms[0].key)?.key === L.projectRooms[0].key, L.projectRooms[0].key);

// ------------------------------------------------------------------ nothing
ok('ничего не просили — ничего не нашли', pickRoom(L, '') === null && pickRoom(L, null) === null, null);
ok('такой комнаты нет — null, а не первая попавшаяся', pickRoom(L, 'нетакой') === null, pickRoom(L, 'нетакой'));
ok('без раскладки не падает', pickRoom(null, 'security') === null, null);

// The key beats the title: if someone names a project «security», the address
// must still lead to the control room — there is one of those and many projects.
ok('ключ выигрывает у заголовка', pickRoom(L, 'security')?.service === true, pickRoom(L, 'security')?.key);

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
