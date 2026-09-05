// node tools/test-signal.mjs — the hub that introduces two browsers to each other.
//
// The voice in the meeting room is a WebRTC mesh: the audio goes straight
// between the tabs and never reaches the office. The one thing the server does
// is carry the introductions — an offer, an answer, a candidate — up by
// POST /api/signal and back down through the SSE stream that is already open.
// That much has no browser in it and can be checked here; the microphone and the
// peer connection cannot, and are checked by two tabs and a pair of ears.
//
// The guard worth a stand of its own: signals only travel between people
// standing in the meeting room. Without it the office is a general message bus
// that any tab can use to reach any other, and the room stops being the
// permission it was designed to be.
import { startOffice } from './lib/office.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};

const { base, stop } = await startOffice({
  settings: { access: { mode: 'private', token: 'signal-owner-0001', invites: [] } },
  claudeDir: '/nonexistent-claude-dir',
});
process.on('SIGINT', () => { stop(); process.exit(130); });

const post = (p, body) => fetch(base + p, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then((r) => r.json().then((j) => ({ status: r.status, j })));

// One open stream, named — that name is the address a signal is sent to.
function listen(me) {
  const ctl = new AbortController();
  const events = [];
  const started = fetch(base + '/api/stream?me=' + encodeURIComponent(me), { signal: ctl.signal })
    .then(async (res) => {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop();
          for (const b of parts) {
            if (!b.startsWith('event: signal')) continue;
            const line = b.split('\n').find((l) => l.startsWith('data: '));
            if (line) { try { events.push(JSON.parse(line.slice(6))); } catch { /* half a frame */ } }
          }
        }
      } catch { /* aborted at the end of the stand */ }
    });
  return { events, close: () => ctl.abort(), started };
}

const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

const MEETING = '__meeting';
let anya, mark;

try {
  anya = listen('anya');
  mark = listen('mark');
  await settle();

  // ------------------------------------------------- nobody is in the room yet
  const early = await post('/api/signal', { from: 'anya', to: 'mark', kind: 'offer', data: { sdp: 'v=0' } });
  ok('без комнаты сигнал не проходит', early.status === 409, early);
  ok('и объясняет, почему', /переговорк/i.test(early.j.error || ''), early.j);

  // ------------------------------------------------------- both walk in
  await post('/api/here', { id: 'anya', name: 'Аня', look: {}, x: 10, y: 20, room: MEETING });
  await post('/api/here', { id: 'mark', name: 'Марк', look: {}, x: 40, y: 20, room: MEETING });

  const offer = await post('/api/signal', { from: 'anya', to: 'mark', kind: 'offer', data: { sdp: 'v=0 fake' } });
  ok('в переговорке сигнал проходит', offer.status === 200 && offer.j.ok === true, offer);
  ok('и доставлен ровно одному', offer.j.delivered === 1, offer.j);

  await settle();
  ok('Марк получил offer', mark.events.length === 1 && mark.events[0].kind === 'offer', mark.events);
  ok('и знает, от кого', mark.events[0] && mark.events[0].from === 'anya', mark.events[0]);
  ok('и данные доехали целыми',
    mark.events[0] && mark.events[0].data && mark.events[0].data.sdp === 'v=0 fake', mark.events[0]);
  ok('Аня своего же сигнала не получила', anya.events.length === 0, anya.events);

  // ---------------------------------------------- one of them steps out
  await post('/api/here', { id: 'mark', name: 'Марк', look: {}, x: 400, y: 20, room: null });
  const gone = await post('/api/signal', { from: 'anya', to: 'mark', kind: 'ice', data: { c: 'candidate:1' } });
  ok('вышедшему из комнаты не сигналят', gone.status === 409, gone);

  // -------------------------------------------------------- what is refused
  await post('/api/here', { id: 'mark', name: 'Марк', look: {}, x: 40, y: 20, room: MEETING });
  const junk = await post('/api/signal', { from: 'anya', to: 'mark', kind: 'ping', data: {} });
  ok('чужой вид сигнала — отказ', junk.status === 400, junk);
  const noTo = await post('/api/signal', { from: 'anya', kind: 'offer', data: {} });
  ok('без адресата — отказ', noTo.status === 400, noTo);

  // A stranger who never said they were here cannot reach anybody.
  const ghost = await post('/api/signal', { from: 'ghost', to: 'mark', kind: 'offer', data: {} });
  ok('незнакомец в комнате не числится и не сигналит', ghost.status === 409, ghost);

  // ------------------------------------------------- nobody at that address
  const nowhere = await post('/api/here', { id: 'dasha', name: 'Даша', look: {}, x: 50, y: 20, room: MEETING });
  ok('третий человек встал в комнату', nowhere.status === 200, nowhere);
  const quiet = await post('/api/signal', { from: 'anya', to: 'dasha', kind: 'offer', data: {} });
  // Her tab is not listening to the stream: there is nobody to deliver to, and
  // that is not an error — the other side may have closed it a moment ago.
  ok('в комнате есть, потока нет — доставлено ноль, но не ошибка',
    quiet.status === 200 && quiet.j.delivered === 0, quiet);
} finally {
  if (anya) anya.close();
  if (mark) mark.close();
  stop();
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
