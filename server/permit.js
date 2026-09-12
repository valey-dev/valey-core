// The waiting room for permission requests from Claude Code.
//
// The `PermissionRequest` hook fires exactly when the "Allow Claude to run …?"
// dialog should appear in the terminal, and waits for an answer on stdout.
// While it waits there is NO dialog in the terminal: we are holding the
// question. Everything else in this file is about not holding it forever.
//
// Three ways to let it go:
//  - the owner answered in the office: allow, deny or always;
//  - the owner said "in the terminal" — we answer with nothing, and Claude Code
//    asks for itself;
//  - nobody answered within WAIT_MS — the same, without a person.
//
// An empty answer is not a refusal. A hook that returns `{}` lets the question
// continue down the normal path, and the person sees the native dialog. That is
// why "defer" and "timed out" are made the same way: the office steps aside
// rather than deciding for the owner.
//
// A question the agent asks (`AskUserQuestion`) comes in through a different
// door: the `PreToolUse` hook, not `PermissionRequest`. Measured on
// 7–11 September 2026 in the desktop app: it draws its own question picker
// without waiting for `PermissionRequest`, drops whatever that hook answers
// later, and let the office's card die ~45 seconds in — every press on it
// ended in «this question is already closed». On paper `PermissionRequest`
// could carry an answer too — the reference lists `updatedInput` under its
// allow — but an answer to a hook the client has stopped waiting for lands
// nowhere. `PreToolUse` runs before the picker is drawn and may hand back
// `updatedInput` with `answers` filled in — the shape the hooks reference
// gives for exactly this — and a live probe on 11 September 2026 got the
// chosen option to the agent with no picker shown at all. So questions
// are held only when they arrive through `PreToolUse`, and ordinary tools never
// are: holding those there would skip the permission flow entirely.
// Frames: [19 · a permission request from Claude Code](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=1033-2)
import crypto from 'node:crypto';

// The hook waits 600 seconds (the Claude Code default). We answer noticeably
// earlier so the question returns to the terminal by our decision rather than
// by someone else's timeout: otherwise the moment the card in the office stops
// meaning anything arrives in silence.
export const WAIT_MS = 9 * 60 * 1000;

// id -> { ...public fields, resolve, timer }
const waiting = new Map();

// What of tool_input to show on the pager and in the card. Bash is the main
// case and the reason for all of this: there the decision is made on the text
// of the command. The other tools show whatever they have that answers "what
// exactly are you touching".
// A question the agent asks the person, rather than a command it wants to run.
// Claude Code sends it as a nested structure, and until 6 September 2026 the
// office fell through to JSON.stringify and dropped the whole thing onto the
// pager as one line of braces: the owner could see that something was being
// asked and not what. Both shapes are read — a single question and the list —
// because the office does not get to choose which one arrives.
export function questionOf(input) {
  if (!input || typeof input !== 'object') return null;
  const one = Array.isArray(input.questions) ? input.questions[0] : input;
  if (!one || typeof one !== 'object') return null;
  const text = typeof one.question === 'string' ? one.question : '';
  if (!text) return null;
  // An option is a label and the sentence under it. That sentence is what the
  // choice is actually made on: a bare label says «later» and nothing about what
  // later costs. Until 6 September 2026 this mapper threw it away and kept the
  // label alone.
  //
  // `description` is the field Claude Code sends; the other two names are read
  // because the office does not get to pick what arrives, and a comment shown
  // under the wrong key is the same as no comment.
  const options = (Array.isArray(one.options) ? one.options : [])
    .map((o) => {
      if (typeof o === 'string') return { label: o, note: '' };
      if (!o || typeof o !== 'object') return null;
      const label = typeof o.label === 'string' ? o.label : '';
      if (!label) return null;
      const note = ['description', 'detail', 'hint']
        .map((k) => (typeof o[k] === 'string' ? o[k].trim() : ''))
        .find(Boolean) || '';
      return { label, note };
    })
    .filter(Boolean)
    .slice(0, 8);
  return { text, header: typeof one.header === 'string' ? one.header : '', options };
}

function commandOf(tool, input) {
  if (!input || typeof input !== 'object') return '';
  const first = (...keys) => {
    for (const k of keys) if (typeof input[k] === 'string' && input[k]) return input[k];
    return '';
  };
  if (tool === 'Bash') return first('command');
  const named = first('file_path', 'path', 'url', 'pattern', 'query', 'notebook_path');
  if (named) return named;
  // A question reads as a question: its own text, not the envelope it came in.
  const q = questionOf(input);
  if (q) return q.text;
  // An unknown tool — show its input as it is, not as "…". Trimming happens in
  // one place, below, and the same way for everyone.
  try { return JSON.stringify(input); } catch { return ''; }
}

// A ceiling on what goes to the browser. A command that cannot be read in full
// is an owner being misled, so the limit is generous; but `tool_input` for
// Write is the whole file, and putting that into the snapshot every 2.5 seconds
// serves nothing.
const CUT = 4000;
const cut = (s) => (String(s || '').length > CUT ? String(s).slice(0, CUT) + ' …' : String(s || ''));

// The public part of an entry: what goes to the owner in the snapshot and in the event.
const shown = (e) => ({
  id: e.id, agentId: e.agentId, tool: e.tool, command: e.command,
  description: e.description, question: e.question || null, at: e.at, until: e.until,
  // The rule that "always allow" would write into the settings. Shown in words
  // before the press: a rule written silently is a permission the owner never
  // gave.
  rule: e.rule,
});

// The rule for "always". Claude Code sends its own proposals in
// permission_suggestions — we take those rather than inventing ours: the
// "Always allow" button in the terminal writes exactly this, and the office
// must not disagree with it.
function ruleOf(suggestions) {
  const list = Array.isArray(suggestions) ? suggestions : [];
  for (const s of list) {
    const rules = (s && Array.isArray(s.rules)) ? s.rules : [];
    for (const r of rules) {
      if (!r || !r.toolName) continue;
      return r.ruleContent ? `${r.toolName}(${r.ruleContent})` : String(r.toolName);
    }
  }
  return '';
}

// Which door a request may be held at. A payload without `hook_event_name` is
// read as `PermissionRequest`: that is the only event this office listened to
// before, and older hooks and the stands send nothing else.
//
// A batch of several questions is let through to the client. The card shows
// one question and one row of options, and `answers` needs an entry for each —
// a card that answered the first and dropped the rest would be the same lie
// this door was opened to end. BACKLOG holds the frame it needs.
export function holdable(payload, input) {
  const event = String((payload && payload.hook_event_name) || 'PermissionRequest');
  const tool = String((payload && payload.tool_name) || '');
  if (tool !== 'AskUserQuestion') return event === 'PermissionRequest';
  if (event !== 'PreToolUse') return false;
  const list = input && Array.isArray(input.questions) ? input.questions : null;
  if (list && list.length !== 1) return false;
  const q = questionOf(input);
  return !!(q && q.options.length);
}

// A request arrived. Returns a promise with the verdict for the hook; `null`
// means "the office steps aside" — the hook answers with nothing and the
// terminal asks.
export function ask(payload, { audience }) {
  const agentId = String((payload && payload.session_id) || '');
  const tool = String((payload && payload.tool_name) || '');
  const input = (payload && payload.tool_input) || {};
  // Nobody watching means nobody to answer. Holding a question in an office
  // nobody opened steals nine minutes from the person at the terminal.
  if (!audience) return { held: false, verdict: null };
  if (!holdable(payload, input)) return { held: false, verdict: null };

  const e = {
    id: crypto.randomUUID().slice(0, 8),
    agentId,
    tool,
    command: cut(commandOf(tool, input)),
    description: cut((input && input.description) || ''),
    // The options of a question travel with it: «allow or deny» says nothing
    // about a question whose answer is one of four. Only a real question gets
    // them: an MCP tool with a `question` field is still a tool asking to run,
    // and the card must offer it allow and deny, not options.
    question: tool === 'AskUserQuestion' ? questionOf(input) : null,
    rule: ruleOf(payload && payload.permission_suggestions),
    suggestions: (payload && payload.permission_suggestions) || [],
    at: Date.now(),
    until: Date.now() + WAIT_MS,
  };
  const verdict = new Promise((resolve) => { e.resolve = resolve; });
  e.timer = setTimeout(() => finish(e.id, null), WAIT_MS);
  // The timer must not keep the process alive by itself: nine minutes of
  // waiting is no reason to stop the server from closing.
  if (e.timer.unref) e.timer.unref();
  waiting.set(e.id, e);
  return { held: true, verdict, entry: shown(e) };
}

// Let a question go. Once: a second answer to the same request is a race
// between the office and the timer, and the first one must win it.
function finish(id, verdict) {
  const e = waiting.get(id);
  if (!e) return false;
  waiting.delete(id);
  clearTimeout(e.timer);
  e.resolve(verdict);
  return true;
}

// The owner's answer. `always` is allow plus a rule in the project settings;
// `terminal` is the office stepping aside, as on a timeout.
//
// A question takes `answer` with the label of the option pressed, and nothing
// that allows: letting `AskUserQuestion` run without answers only draws the
// client's own picker, which is `terminal` by a longer road. The label must be
// one of the options — the key the hook sends back is the question's own
// text, and a value the agent was never offered is not an answer to it.
export function answer(id, { decision, message, label } = {}) {
  const e = waiting.get(id);
  if (!e) return null;
  if (decision === 'terminal') return finish(id, null) ? { ok: true, decision } : null;
  if (e.question) {
    if (decision === 'answer') {
      const o = e.question.options.find((x) => x.label === String(label || ''));
      if (!o) return null;
      return finish(id, { decision: 'answer', answers: { [e.question.text]: o.label } })
        ? { ok: true, decision } : null;
    }
    if (decision !== 'deny') return null;
  }
  if (decision === 'allow' || decision === 'always') {
    return finish(id, {
      decision: 'allow',
      // The rules go back to the hook as the very objects Claude Code sent.
      updatedPermissions: decision === 'always' ? e.suggestions : [],
    }) ? { ok: true, decision } : null;
  }
  if (decision === 'deny') {
    return finish(id, { decision: 'deny', message: String(message || '').slice(0, 2000) })
      ? { ok: true, decision } : null;
  }
  return null;
}

// What to show the owner. Ordered by arrival: the pager calls them in turn, and
// "first" has to mean "asked first".
export function permits() {
  return [...waiting.values()].sort((a, b) => a.at - b.at).map(shown);
}

// How long to wait before believing a session is gone. The snapshot is built
// every 2.5 seconds and the list of transcripts on disk is cached for ten: a
// session that has just started does not reach the office instantly. Without
// this grace the very first tick released a new agent's question as "no such
// session" — that is, the office quietly refused to work with exactly those
// who had just sat down at a desk.
export const GRACE_MS = 30_000;

// The session vanished from the office — there is no point holding its
// question: nobody to answer, and nothing to answer about. Called from the
// snapshot tick.
//
// `now` is a parameter rather than Date.now() inside: otherwise the rule could
// only be checked by really waiting half a minute, and a stand that sleeps is a
// stand people switch off.
export function forgetGone(aliveIds, now = Date.now()) {
  const alive = new Set(aliveIds || []);
  // An empty office is no proof that a session is gone: a snapshot that has not
  // been built yet looks exactly the same.
  if (!alive.size) return;
  for (const e of [...waiting.values()]) {
    if (e.agentId && !alive.has(e.agentId) && now - e.at > GRACE_MS) finish(e.id, null);
  }
}

// For the stands and for shutting the server down: release everything waiting.
export function releaseAll() {
  for (const id of [...waiting.keys()]) finish(id, null);
}
