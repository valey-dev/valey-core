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
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const agents = [
  { id: 'a', name: 'Тоня', project: 'marmalade-kitchen', seat: 0, roleKey: 'code', status: 'working' },
  { id: 'b', name: 'Пётр', project: 'storefront', seat: 0, roleKey: 'qa', status: 'idle' },
];
const L = buildLayout(agents);

// ------------------------------------------------------------- service rooms
ok('control room - with full key', pickRoom(L, '__security')?.security === true, pickRoom(L, '__security')?.key);
ok('and without underlining, as a person would type', pickRoom(L, 'security')?.security === true, pickRoom(L, 'security')?.key);
ok('negotiation', pickRoom(L, 'meeting')?.meeting === true, pickRoom(L, 'meeting')?.key);
ok('greenhouse', pickRoom(L, 'greenhouse')?.greenhouse === true, pickRoom(L, 'greenhouse')?.key);

// ------------------------------------------------------------ project rooms
const proj = pickRoom(L, 'marmalade');
ok('old links at the beginning of the title are still alive', !!proj && proj.title.startsWith('marmalade'), proj && proj.title);
ok('and by the project key too', pickRoom(L, L.projectRooms[0].key)?.key === L.projectRooms[0].key, L.projectRooms[0].key);

// ------------------------------------------------------------------ nothing
ok('didn\'t ask for anything - didn\'t find anything', pickRoom(L, '') === null && pickRoom(L, null) === null, null);
ok('there is no such room - null, not the first one available', pickRoom(L, 'нетакой') === null, pickRoom(L, 'нетакой'));
ok('does not fall without layout', pickRoom(null, 'security') === null, null);

// The key beats the title: if someone names a project «security», the address
// must still lead to the control room — there is one of those and many projects.
ok('the key beats the title', pickRoom(L, 'security')?.service === true, pickRoom(L, 'security')?.key);

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
