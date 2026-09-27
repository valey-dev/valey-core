// The notes on the desks, kept on disk so a restart does not sweep them off.
//
// They lived only in memory until 13 September 2026: an update handed them to
// the next office (exportState in index.js), a restart forgot them. A note is
// something a person wrote for somebody who was not there to read it, so the
// restart threw away exactly the thing nobody had seen yet. What was actually
// sent into a chat survived anyway — it is in the session's transcript — but
// the desk showed it no more.
//
// The file sits next to the settings, named after them, so a stand with its own
// settings keeps its own desk; an office on another port keeps its own as well,
// the way the feed's journal does.
import fsp from 'node:fs/promises';
import path from 'node:path';

// The desk shows the last five notes of an agent (rebuild in index.js); older
// ones are never seen again, so they are not worth a line on disk either.
export const PER_AGENT = 5;
// A session that has been gone this long is not coming back to read its desk.
export const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
// Anyone may leave a note, a guest too, and for any agent id: the ceiling is
// what keeps a stream of them from growing the file without end.
export const MAX_NOTES = 300;

export function deskFile({ settingsFile, port = 5177 }) {
  const base = path.basename(settingsFile || 'settings.json').replace(/\.json$/i, '');
  const name = (base === 'settings' ? 'desk' : base + '.desk') + (Number(port) === 5177 ? '' : '-' + port);
  return path.join(path.dirname(settingsFile || 'settings.json'), name + '.json');
}

// What of the outbox is worth keeping, oldest first as the outbox itself is.
export function keepable(outbox, now = Date.now()) {
  const fresh = outbox.filter((t) => t && t.agentId && typeof t.text === 'string' && now - (Number(t.at) || 0) < MAX_AGE_MS);
  const perAgent = new Map();
  for (let i = fresh.length - 1; i >= 0; i -= 1) {
    const t = fresh[i];
    const n = perAgent.get(t.agentId) || 0;
    if (n >= PER_AGENT) { fresh[i] = null; continue; }
    perAgent.set(t.agentId, n + 1);
  }
  return fresh.filter(Boolean).slice(-MAX_NOTES);
}

// A missing or broken file is an empty desk, never a failed start: the notes
// are worth keeping, not worth an office that will not come up.
export async function loadDesk(file, now = Date.now()) {
  let raw;
  try { raw = await fsp.readFile(file, 'utf8'); } catch { return { outbox: [], taskSeq: 0 }; }
  try {
    const j = JSON.parse(raw);
    const outbox = keepable(Array.isArray(j.outbox) ? j.outbox : [], now);
    const top = outbox.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0);
    return { outbox, taskSeq: Math.max(top, Number(j.taskSeq) || 0) };
  } catch (e) {
    console.error(`[desk] ${file} is not readable, starting with an empty desk: ${e.message}`);
    return { outbox: [], taskSeq: 0 };
  }
}

// One writer at a time, through a temp file and a rename, and only when the
// desk has changed: the office asks on every tick, and the answer is nearly
// always "no". The mode is 0600 — a note is somebody's words to an agent.
export function deskWriter(file) {
  let written = null;
  let chain = Promise.resolve();
  return (outbox, taskSeq) => {
    const text = JSON.stringify({ v: 1, taskSeq, outbox: keepable(outbox) }, null, 1);
    if (text === written) return chain;
    written = text;
    chain = chain.then(async () => {
      const tmp = `${file}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, text, { mode: 0o600 });
      await fsp.rename(tmp, file);
    }).catch((e) => {
      written = null;   // try again on the next tick
      console.error(`[desk] could not keep the notes in ${file}: ${e.message}`);
    });
    return chain;
  };
}
