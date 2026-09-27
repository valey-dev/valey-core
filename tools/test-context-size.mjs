// node tools/test-context-size.mjs — how full an agent's context is: the number
// off the transcript, the window off the model, and the tail on the card.
//
// What breaks without a sound here is arithmetic that still looks plausible: a
// subagent's usage counted as the session's, output added to input, a window
// guessed for a model nobody measured, the number standing still after /compact
// until the next reply. Frames: WIP «Agent context size» #context-size,
// approved 27 September 2026.
globalThis.document = { documentElement: {}, title: '' };
import { contextWindow, ctxText, ctxShare, CTX_WARN } from '../web/model-name.js';
import { applyLine, emptyState } from '../server/agents.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

// ------------------------------------------------------------------ the window
ok('Claude 5 and newer hold 1M', contextWindow('claude-opus-5') === 1e6 && contextWindow('claude-fable-5-1') === 1e6 && contextWindow('claude-opus-5-5') === 1e6);
ok('older families hold 200k, Haiku 4.5 among them',
  contextWindow('claude-haiku-4-5-20251001') === 2e5 && contextWindow('claude-sonnet-4-5-20250929') === 2e5 && contextWindow('claude-3-5-sonnet-20241022') === 2e5);
ok('a model nobody measured has no window', contextWindow('claude-nova-1') === null && contextWindow('gpt-5-codex') === null && contextWindow('') === null);

// ------------------------------------------------------------------ the text
ok('310k / 1M', ctxText(310_000, 'claude-opus-5') === '310k / 1M', ctxText(310_000, 'claude-opus-5'));
ok('an unknown window leaves the bare number', ctxText(62_000, 'claude-nova-1') === '62k', ctxText(62_000, 'claude-nova-1'));
ok('a Haiku reads out of 200k', ctxText(150_400, 'claude-haiku-4-5-20251001') === '150k / 200k');
ok('nothing before the first reply', ctxText(0, 'claude-opus-5') === '');
ok('a few hundred tokens still read as 1k, not 0k', ctxText(300, 'claude-opus-5') === '1k / 1M');

// ------------------------------------------------------------------ the threshold
ok('yellow from 80%', CTX_WARN === 0.8
  && ctxShare({ model: 'claude-opus-5', ctx: 860_000 }) >= CTX_WARN
  && ctxShare({ model: 'claude-opus-5', ctx: 310_000 }) < CTX_WARN);
ok('no share without a window — the floor stays quiet', ctxShare({ model: 'claude-nova-1', ctx: 990_000 }) === null);

// ------------------------------------------------------------------ the transcript
const reply = (usage, extra = {}) => JSON.stringify({
  type: 'assistant', timestamp: '2026-09-27T10:00:00Z', ...extra,
  message: { role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'ok' }] },
});
const feed = (...lines) => { const st = emptyState(); for (const l of lines) applyLine(st, l); return st; };
const U = (input, read, write, out = 900) => ({ input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: out });

ok('the context is what the last reply was fed: input + cache read + cache write',
  feed(reply(U(2, 631_371, 1_617))).ctx === 633_000 - 10, feed(reply(U(2, 631_371, 1_617))).ctx);
ok('output is not counted', feed(reply(U(10, 100_000, 0, 50_000))).ctx === 100_010);
ok('the last reply wins', feed(reply(U(0, 500_000, 0)), reply(U(0, 520_000, 0))).ctx === 520_000);
ok('a subagent reply is its own context, not the session\'s',
  feed(reply(U(0, 400_000, 0)), reply(U(0, 30_000, 0), { isSidechain: true })).ctx === 400_000);
ok('/compact drops the number at once, before the next reply',
  feed(reply(U(0, 846_819, 0)), JSON.stringify({ type: 'system', subtype: 'compact_boundary', timestamp: '2026-09-27T10:01:00Z',
    compactMetadata: { trigger: 'manual', preTokens: 846_819, postTokens: 7_789 } })).ctx === 7_789);

if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall passed');
