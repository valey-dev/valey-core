// The client half of the loader.
//
// The core declares the points, the modules step into them. When there are no
// modules every list is empty and the office works exactly as it did — which is
// checked by the fact that no point knows the name of a module.
//
// Two calling semantics, and confusing them is expensive:
//   collect — we ask everyone and put together what came back (drawing, hints);
//   first   — we give the event to the first one who took it (a key, SPACE, ESC).
import { addDict } from './i18n.js';
import { define as defineKeys } from './keymap.js';
import { define as definePlaces } from './places.js';

// `action` and `note` are both new seams, and both sit beside `key` rather
// than replacing it. A module that declared its keys through api.keys() gets an
// action id here and knows no letters at all; one that stayed on `key` works as
// it always did. That is not politeness: paid modules reach a buyer as an
// archive, and an office update must not break one.
//
// `note` — the ninth seam, from 5 September 2026. A note used to hang on a
// reply in a conversation and nothing else; now it hangs on an address, and a
// module can name addresses of its own. The list of notes stays in the core,
// and opening one belongs to whoever owns the address: the core shows it to
// everyone and takes the first module that answers. It never reads such an
// address itself. Nobody answered — the row says so out loud, and the note is
// still readable from the line of context stored with it.
// `place` is how a module says the screen is its own: it answers with one of the
// place ids it declared, and the keys panel draws that board instead of the floor.
// Without it the office would have to know which module owns what, which is the
// one thing the module system exists to avoid.
// 'keys' — a card on the inventory's key shelf. A module hands in its own: the
// key belongs to whoever uses it, and in a free build the Figma card must not
// sit on the shelf on behalf of an easel that is not there.
const HOOKS = ['sig', 'room', 'layout', 'near', 'draw', 'act', 'hint', 'key', 'action', 'esc', 'tick', 'hud', 'lang', 'busy', 'note', 'place', 'keys'];
const hooks = Object.fromEntries(HOOKS.map(h => [h, []]));
const dicts = [];
let ids = [];
// The modules that did not come up. An empty list is not the same as "all is
// well": while it was not shown, the easel was silently missing from the office,
// because register threw on an unknown point, and that was visible only in the
// browser console. The stand now asks for this list.
import { owned } from './owned.js';

let failed = [];

export async function loadModules() {
  let list = [];
  try {
    list = await (await fetch('/api/modules', { headers: owned() })).json();
  } catch {
    return [];                       // a server with no modules is the ordinary case
  }
  // The answer can come as a refusal rather than a list: a guest without an
  // invitation gets {error}. There used to be a for..of over an object starting
  // here; it threw, and it threw on a top-level await in main.js — that is, it
  // carried the whole office away with it. An empty floor and "an invitation is
  // needed" instead of the rooms: found on 1 September 2026 by the very first
  // frame in shared mode.
  if (!Array.isArray(list)) return [];
  // The styles go before the clients, and with a wait. A link added to head holds
  // nothing up: the page lives on, and the style arrives when it arrives. While it
  // is on its way, a module's markup can already be on the screen and can already
  // be measured — and it is capable of measuring anything at all. On 3 September
  // 2026 the book in the reading room came out exactly that way: a panel without
  // its styles stretched across the whole window, the column width was counted
  // over 1372 pixels instead of 886, and the chapter lay in one column across the
  // spread. The timeout is for a style that never arrives: the office matters more
  // than one module.
  const styles = list.filter((m) => m.style).map((m) => new Promise((done) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `/modules/${m.id}/${m.style}`;
    link.onload = link.onerror = done;
    document.head.appendChild(link);
    setTimeout(done, 3000);
  }));
  if (styles.length) await Promise.all(styles);

  for (const m of list) {
    if (!m.client) continue;
    try {
      const mod = await import(`/modules/${m.id}/${m.client}`);
      await mod.register?.(apiFor(m.id));
      ids.push(m.id);
    } catch (err) {
      // Failing silently is not allowed: "the easel is gone" would otherwise be investigated by eye.
      console.warn('модуль не встал:', m.id, err);
      failed.push({ id: m.id, error: String((err && err.message) || err) });
    }
  }
  return ids;
}

function apiFor(id) {
  return {
    id,
    on(name, fn) {
      if (!hooks[name]) throw new Error(`нет такой точки: ${name}`);
      hooks[name].push({ id, fn });
    },
    // A module's dictionary is poured into the common one at once: the keys are
    // named with its id in front, or two modules will one day fight over one name.
    i18n(dict) { dicts.push(dict); addDict(dict); },
    // A module's keys are declared, not tested letter by letter in a handler.
    // That way the core knows what is taken and can say so — until 5 September
    // 2026 a fight between two modules over one letter was settled by load
    // order, which is alphabetical by folder name, and settled in silence.
    keys(list) {
      const own = [].concat(list || []).map((a) => ({ ...a, id: a.id.startsWith(id + '.') ? a.id : `${id}.${a.id}` }));
      defineKeys(own);
      return own.map((a) => a.id);
    },
    // A module's places, named the same way as its keys. The ids come back so the
    // module can answer the `place` hook with one of them rather than repeating
    // its own prefix by hand and getting it wrong.
    places(list) {
      const own = [].concat(list || []).map((p) => ({ ...p, id: p.id.startsWith(id + '.') ? p.id : `${id}.${p.id}` }));
      definePlaces(own);
      return own.map((p) => p.id);
    }
  };
}

export function moduleDicts() { return dicts; }
export function moduleIds() { return ids.slice(); }
export function moduleFailures() { return failed.slice(); }

export function collect(name, ...args) {
  const out = [];
  for (const h of hooks[name] || []) {
    let v;
    try { v = h.fn(...args); } catch (err) { console.warn(`точка ${name} упала в ${h.id}:`, err); continue; }
    if (Array.isArray(v)) out.push(...v);
    else if (v != null && v !== false) out.push(v);
  }
  return out;
}

export function first(name, ...args) {
  for (const h of hooks[name] || []) {
    let v;
    try { v = h.fn(...args); } catch (err) { console.warn(`точка ${name} упала в ${h.id}:`, err); continue; }
    if (v) return v;
  }
  return null;
}
