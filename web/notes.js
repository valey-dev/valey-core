// Notes on the lines of a conversation.
//
// They live in the browser only and never go outside: these are private
// thoughts, not part of the office. The key is the same as for the other user
// settings — valey-*.
//
// The anchor is the timestamp of a line (ts), not its number and not a hash of
// its text. A number will not do: /api/chat gives out the last sixteen messages,
// and the window moves as the conversation goes. A hash will not do either: the
// trailing line grows while the agent types, and the text changes under your
// hands. ts is set on the server once, when the transcript is parsed, and does
// not move afterwards.

const KEY = 'valey-chat-notes';

// Date.now() does not tell two records apart inside one millisecond, and the
// order in the common list becomes a matter of luck. We keep the mark strictly
// increasing: it stays the time of creation, but there are no equal ones any more.
let lastAt = 0;
const stampNow = () => (lastAt = Math.max(Date.now(), lastAt + 1));

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

function writeAll(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch { return false; }
}

// The address a note hangs on. It used to be the session id and nothing else;
// since 5 September 2026 a note can hang on anything a module can name, and
// they all share one store, one search and one list.
//
// The core does not read an address beyond its first segment. A key with no
// colon is a session — that is the address of an agent, so nothing written
// before this change moves or is rewritten. Everything else is somebody's:
// what the parts mean is known to whoever built the address, and the core only
// carries them. Every part is percent-encoded before being joined, because a
// part may contain a colon and splitting must not become a guess.
const enc = (v) => encodeURIComponent(String(v == null ? '' : v));
export const agentAddr = (id) => String(id || '');
export const addr = (kind, ...parts) => [String(kind), ...parts.map(enc)].join(':');

// { kind: 'agent', agent } for a session, { kind, parts } for anybody else.
// An address whose kind nobody claims is still a note: it stays in the list
// with its own line of context, and only the button is missing.
export function parseAddr(key) {
  const s = String(key || '');
  if (!s.includes(':')) return { kind: 'agent', agent: s };
  const [kind, ...rest] = s.split(':');
  if (!kind) return { kind: 'agent', agent: s };
  return { kind, parts: rest.map((v) => { try { return decodeURIComponent(v); } catch { return v; } }) };
}

// Everything below takes an address: for a conversation it is the session id
// (see agentAddr), for anybody else it is what `addr` built.
//
// The order is by creation time: a note on the same line lies under the previous
// one rather than in front of it.
export function notesOf(agentId) {
  return (readAll()[agentId] || []).slice().sort((a, b) => a.at - b.at);
}

export function noteCount(agentId) {
  return (readAll()[agentId] || []).length;
}

// ctx is a snapshot of where the note was born: the agent's name, the project,
// the title of the chat and the beginning of the anchor line. A snapshot
// precisely, not a reference. The office is built out of LIVE sessions: close the
// chat and the agent is gone, /api/chat on its id answers 404. So most notes will
// outlive their conversation, and without the snapshot a dangling identifier is
// what stays in the common list instead of the context.
export function addNote(agentId, ts, text, ctx) {
  const body = String(text || '').trim();
  if (!body) return null;
  const all = readAll();
  const note = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: ts || null, text: body, at: stampNow(), edited: null };
  if (ctx) {
    // The fields are named one by one rather than "keep whatever was handed
    // over": the snapshot lives in localStorage, and that space is shared with
    // the office's settings.
    //
    // `line` is the one field the core does not interpret — it is the line of
    // context written by whoever owns the address, in their own words. The core
    // has no business knowing what they anchor a note to; it only has to be
    // able to show the note when its owner is not installed at all.
    note.ctx = {
      agent: String(ctx.agent || '').slice(0, 60),
      project: String(ctx.project || '').slice(0, 80),
      title: String(ctx.title || '').slice(0, 120),
      quote: String(ctx.quote || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    };
    if (ctx.line) note.ctx.line = String(ctx.line).replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  (all[agentId] = all[agentId] || []).push(note);
  return writeAll(all) ? note : null;
}

// All the notes at once, the fresh ones on top. agentId comes back alongside: by
// it the panel decides whether the conversation is still alive and whether one
// can fall into it.
export function allNotes() {
  const all = readAll();
  const out = [];
  for (const key of Object.keys(all)) {
    const anchor = parseAddr(key);
    // agentId stays the field it has always been: for a note on a
    // conversation the address IS the session id, so every caller that relied
    // on it goes on working.
    for (const n of all[key] || []) out.push({ ...n, key, anchor, agentId: key });
  }
  return out.sort((a, b) => b.at - a.at);
}

export function editNote(agentId, id, text) {
  const body = String(text || '').trim();
  const all = readAll();
  const note = (all[agentId] || []).find((n) => n.id === id);
  if (!note) return null;
  // empty text is the same as deleting: otherwise an empty card stays behind
  if (!body) return removeNote(agentId, id) ? 'removed' : null;
  note.text = body;
  note.edited = Date.now();
  return writeAll(all) ? note : null;
}

export function removeNote(agentId, id) {
  const all = readAll();
  const list = all[agentId] || [];
  const i = list.findIndex((n) => n.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  if (!list.length) delete all[agentId];
  return writeAll(all);
}

// Sorts the notes into two heaps: those whose line is in the window right now,
// and those whose line has left. The second kind must not be quietly hidden —
// what has been written down must not disappear along with the message it is
// tied to.
export function splitNotes(agentId, msgs) {
  const known = new Set((msgs || []).map((m) => m.ts).filter((t) => t != null));
  const byTs = new Map();
  const orphans = [];
  for (const n of notesOf(agentId)) {
    if (n.ts != null && known.has(n.ts)) {
      if (!byTs.has(n.ts)) byTs.set(n.ts, []);
      byTs.get(n.ts).push(n);
    } else orphans.push(n);
  }
  return { byTs, orphans };
}
