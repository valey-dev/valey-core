// The environment a session started by the office gets: the office's own,
// minus what configures the office itself.
//
// Delivery (`claude --resume`) and hiring (`claude -p`) start a real session of
// the owner's, and that session runs whatever it runs — stands, `npm start`,
// its own hooks. Until 15 September 2026 both handed it process.env whole, so
// the session lived in the office's configuration. On 13 September 2026 a stand
// of another branch delivered a task: an `npm start` in that session would have
// read the stand's settings file and hung the stand's plaque on its own office.
//
// Taken out: every VALEY_* and AI_VALEY_* the office was started with, and PORT
// and HOST, which tell a server where to listen. With VALEY_SETTINGS gone the
// permission hook (tools/permit.mjs) reads the owner's settings, which is what
// it reads in a session started from the terminal.
//
// Kept: VALEY_URL. The office never reads it; it is how a person points that
// hook at an office on purpose, so if the office has it, it came from their
// shell. Everything else — HOME, PATH, the CLI's own variables — is what a
// session started from the terminal would have had too.
//
// The swap's variables (server/swap.js) are taken out of process.env itself at
// start-up; they match the pattern here as well, so a leak of them is caught
// twice rather than once.
const KEEP = new Set(['VALEY_URL']);
const OFFICE = /^(AI_)?VALEY_/;
const LISTEN = new Set(['PORT', 'HOST']);

export function agentEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (KEEP.has(k) || !(OFFICE.test(k) || LISTEN.has(k))) out[k] = v;
  }
  return out;
}
