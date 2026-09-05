// The plaque of a test stand.
//
// An office on 5177 and an office on 5188 look the same, and that has cost time
// already: a frame from another branch read as "the feature does not work", and
// an empty floor in shared mode as a broken build. The plaque answers three
// questions at once: this is a stand, whose it is and what is being checked on it.
//
// It is shown only when the server was started with VALEY_STAND — in an ordinary
// office it is not there at all, and there is no need to take it down before a
// showing.
import { moduleFailures } from './modules.js';

export async function initStand() {
  let s = null;
  try {
    s = await (await fetch('/api/stand')).json();
  } catch {
    return null;
  }
  // The answer can come as a refusal rather than an object with text: the gate gives out {error}.
  if (!s || typeof s !== 'object' || !s.text) return null;

  const box = document.createElement('div');
  box.id = 'stand';
  const line = (cls, text) => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    box.appendChild(d);
  };
  line('stand-tag', 'ТЕСТОВЫЙ СТЕНД');
  line('stand-what', s.text);
  const where = [s.branch && `ветка ${s.branch}`, s.port && `порт ${s.port}`].filter(Boolean).join(' · ');
  if (where) line('stand-where', where);
  // The list of modules, as switches. A click puts a module out on the server and
  // reloads the page: half of a module's work lives in the client, and without the
  // reload the office would be left with the things it has already drawn.
  const all = s.all || [];
  if (!all.length) {
    line('stand-where', 'модулей нет — бесплатная сборка');
  } else {
    // The state in a word, not a tick. The first version showed ☑/☐, the buttons
    // stood shoulder to shoulder, and by the second check the module switched off
    // was not the one that had been meant: the difference between two glyphs in a
    // small font cannot be read, and the price of the mistake is "the feature does
    // not work" over nothing.
    const rows = document.createElement('div');
    rows.className = 'stand-mods';
    for (const m of all) {
      const b = document.createElement('button');
      b.className = 'stand-mod' + (m.off ? ' off' : '') + (m.broken ? ' broken' : '');
      b.innerHTML = '';
      const name = document.createElement('b');
      name.textContent = m.id;
      const state = document.createElement('i');
      state.textContent = m.broken ? 'СЛОМАН' : m.off ? 'ВЫКЛ' : 'вкл';
      b.append(name, state);
      b.title = m.off ? `включить ${m.id}` : `выключить ${m.id}`;
      b.onclick = async () => {
        if (b.disabled) return;
        b.disabled = true;
        state.textContent = '…';        // a click that did not arrive has to be visible
        try {
          await fetch('/api/stand/toggle', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: m.id, off: !m.off }),
          });
        } finally {
          location.reload();
        }
      };
      rows.appendChild(b);
    }
    box.appendChild(rows);
    // The same thing once more in words: a state named twice cannot be read backwards.
    const dead = all.filter((m) => m.off).map((m) => m.id);
    line('stand-where', dead.length ? `выключены: ${dead.join(', ')}` : 'все модули включены');
    // Without this line the panel lies: a module switched off here is still on
    // disk, and this is a check of how the office behaves, not of a build without it.
    line('stand-fine', 'выключение — имитация: файлы на диске остаются');
  }
  document.body.appendChild(box);
  return s;
}
