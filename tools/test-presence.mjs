// node tools/test-presence.mjs — the people present in the office.
//
// It raises a real server and talks to it over HTTP: there is nothing to check
// in pure functions here, all the logic is in the registry and in what it serves
// outward. The port is asked of the system, the settings are its own and the
// sessions directory is empty: until 4 September 2026 the stand started on the
// user's REAL settings — in shared mode it got a cascade of 403s, and with the
// weather on it went to open-meteo. Its own child is killed; other offices are
// left alone.
import { startOffice } from './lib/office.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The sessions directory is its own and empty: this stand needs no agents at all, it is about people.
const { base, stop } = await startOffice({
  settings: { access: { mode: 'private', token: 'presence-owner-0001', invites: [] } },
  claudeDir: '/nonexistent-claude-dir',
});
process.on('SIGINT', () => { stop(); process.exit(130); });

const post = (p, body) => fetch(base + p, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then((r) => r.json().then((j) => ({ status: r.status, j })));
const state = () => fetch(base + '/api/state').then((r) => r.json());

try {
  // ------------------------------------------------------------- arrived
  await post('/api/here', { id: 'aaa', name: 'Сергей', look: { shirt: '#4fa89a' }, x: 100.6, y: 200.4, dir: -1, moving: true, room: 'ai-valey' });
  await post('/api/here', { id: 'bbb', name: 'Костя', look: {}, x: 300, y: 400, dir: 1, moving: false, room: null });
  let s = await state();
  ok('оба человека в снимке', (s.people || []).length === 2, (s.people || []).map((p) => p.id));
  const a = (s.people || []).find((p) => p.id === 'aaa');
  ok('имя и комната доехали', a && a.name === 'Сергей' && a.room === 'ai-valey', a);
  ok('координаты округлены', a && a.x === 101 && a.y === 200, a && [a.x, a.y]);
  ok('направление и движение сохранены', a && a.dir === -1 && a.moving === true, a);

  // ------------------------------------------------------- the people stream
  const ctl = new AbortController();
  const res = await fetch(base + '/api/stream', { signal: ctl.signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', got = null;
  const until = Date.now() + 4000;
  while (Date.now() < until && !got) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    // take the last fully arrived people event block
    const blocks = buf.split('\n\n');
    for (const b of blocks) {
      if (!b.startsWith('event: people')) continue;
      const line = b.split('\n').find((l) => l.startsWith('data: '));
      if (line) { try { got = JSON.parse(line.slice(6)); } catch { /* half a frame */ } }
    }
    if (!got) await wait(50);
  }
  ctl.abort();
  ok('поток присылает событие people', Array.isArray(got) && got.length === 2, got && got.length);

  // ------------------------------------------------------- rubbish going out
  const bigName = await post('/api/here', { id: 'ccc', name: 'я'.repeat(200), x: 1, y: 1 });
  ok('длинное имя обрезано', bigName.status === 200, bigName.status);
  s = await state();
  const c = (s.people || []).find((p) => p.id === 'ccc');
  ok('имя не длиннее 24 символов', c && c.name.length === 24, c && c.name.length);
  ok('нечисловые координаты становятся нулём',
    (await post('/api/here', { id: 'ddd', x: 'нет', y: null })).status === 200
      && (await state()).people.find((p) => p.id === 'ddd').x === 0, null);

  // ------------------------------------------------- the look is sieved
  await post('/api/here', {
    id: 'eee', name: 'мусорный',
    look: {
      skin: 'javascript:alert(1)', shirt: '#zzzzzz', hair: 123, boots: '#2a2118',
      glasses: 'да', style: 99, tall: -7, head: 'cap', face: 'x'.repeat(50),
      evil: 'ничего тут не делает', pants: '#3f4a63',
    },
    x: 5, y: 5,
  });
  const e = (await state()).people.find((p) => p.id === 'eee');
  ok('годные цвета проходят', e.look.boots === '#2a2118' && e.look.pants === '#3f4a63', e.look);
  ok('негодные цвета отброшены', !('skin' in e.look) && !('shirt' in e.look) && !('hair' in e.look), e.look);
  ok('не-булево у очков отброшено', !('glasses' in e.look), e.look);
  ok('числа зажаты в границы', e.look.style === 4 && e.look.tall === 0, [e.look.style, e.look.tall]);
  ok('слишком длинное слово отброшено', !('face' in e.look) && e.look.head === 'cap', e.look);
  ok('незнакомый ключ не проходит вовсе', !('evil' in e.look), Object.keys(e.look));

  const noId = await post('/api/here', { name: 'без id' });
  ok('без id не пускает', noId.status === 400, noId.status);
  const junk = await fetch(base + '/api/here', { method: 'POST', body: 'не json' }).then((r) => r.status);
  ok('мусор вместо json не роняет сервер', junk === 400, junk);

  // ------------------------------------------------------------- left
  await post('/api/gone', { id: 'bbb' });
  s = await state();
  ok('ушедший исчезает сразу', !(s.people || []).some((p) => p.id === 'bbb'), (s.people || []).map((p) => p.id));
  ok('остальные на месте', (s.people || []).some((p) => p.id === 'aaa'), null);

  // ------------------------------------------------- nothing extra goes out
  const fields = Object.keys((await state()).people[0]).sort().join(',');
  ok('в проекции человека только присутствие',
    fields === 'at,dir,id,look,moving,name,room,x,y', fields);
} catch (e) {
  bad += 1;
  console.log('УПАЛ  | стенд не доехал →', e.message);
} finally {
  stop();
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
