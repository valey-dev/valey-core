// node tools/test-model-card.mjs — the agent card's name row: the trade's pixel
// icon, the model beside it and the reasoning level in parentheses.
//
// What is checked is what a person reads, and what breaks without a sound: a
// model id turned into a name nobody asked for, an icon that floats a pixel
// above the letters, a level left over from a one-turn boost. Frame: #model-card
// on WIP, v3, approved 15 September 2026.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
globalThis.document = { documentElement: {}, title: '' };
import { modelName, modelLabel } from '../web/model-name.js';
import { ROLE_ICONS, roleIcon } from '../web/roleicon.js';
import { applyLine, emptyState } from '../server/agents.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

// ---------------------------------------------------------------- the name
ok('claude-opus-5 → Opus 5', modelName('claude-opus-5') === 'Opus 5', modelName('claude-opus-5'));
ok('claude-fable-5-1 → Fable 5.1', modelName('claude-fable-5-1') === 'Fable 5.1', modelName('claude-fable-5-1'));
ok('the date goes: claude-sonnet-4-5-20250929 → Sonnet 4.5', modelName('claude-sonnet-4-5-20250929') === 'Sonnet 4.5');
ok('claude-haiku-4-5-20251001 → Haiku 4.5', modelName('claude-haiku-4-5-20251001') === 'Haiku 4.5');
ok('the old order too: claude-3-5-sonnet-20241022 → Sonnet 3.5', modelName('claude-3-5-sonnet-20241022') === 'Sonnet 3.5');
ok('a family the office does not know stays as it came', modelName('claude-mythos-6') === 'claude-mythos-6');
ok('so does anything that is not claude-…', modelName('gpt-5-codex') === 'gpt-5-codex');
ok('no model, no label', modelLabel('', 'high') === '');

const NB = '\u00a0';
ok('the level in parentheses, spaces unbreakable', modelLabel('claude-opus-5', 'high') === `Opus${NB}5${NB}(high)`, modelLabel('claude-opus-5', 'high'));
ok('no level, no parentheses', modelLabel('claude-mythos-6', '') === 'claude-mythos-6');
ok('no ordinary space survives in the label', !/ /.test(modelLabel('claude-sonnet-4-5-20250929', 'xhigh')));

// ---------------------------------------------------------------- the icons
// Every trade the server can name has an icon, read off the server's own table
// rather than a copy of it here.
const shorts = [...fs.readFileSync(path.join(ROOT, 'server/agents.js'), 'utf8').matchAll(/short: '([a-z]+)'/g)].map((m) => m[1]);
ok('the server names six trades', shorts.length === 6, shorts);
ok('every one of them has an icon', shorts.every((k) => ROLE_ICONS[k]), shorts.filter((k) => !ROLE_ICONS[k]));
for (const [k, rows] of Object.entries(ROLE_ICONS)) {
  ok(`${k}: 7×7`, rows.length === 7 && rows.every((r) => r.length === 7 && /^[.#]+$/.test(r)), rows);
  // The SVG stands on the baseline: an empty last row lifts the drawing off it.
  ok(`${k}: the drawing ends on the bottom row`, rows[6].includes('#'), rows[6]);
}
ok('the icon is inline SVG in the text colour', /^<svg class="ricon" viewBox="0 0 7 7"[^>]*><path d="M/.test(roleIcon('code')));
ok('an unknown trade gets no icon rather than a broken one', roleIcon('juggler') === '');

// ------------------------------------------------- the level, off the transcript
const T0 = Date.parse('2026-09-15T10:00:00Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const reply = (s, extra, model = 'claude-opus-5') => JSON.stringify({
  type: 'assistant', timestamp: at(s), ...extra,
  message: { role: 'assistant', model, stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] },
});
const feed = (...lines) => { const st = emptyState(); for (const l of lines) applyLine(st, l); return st; };

const plain = feed(reply(1, { effort: 'high' }));
ok('the level is read off the reply', plain.effort === 'high' && plain.model === 'claude-opus-5', { effort: plain.effort, model: plain.model });
const changed = feed(reply(1, { effort: 'high' }), reply(2, { effort: 'low' }, 'claude-sonnet-5'));
ok('/effort mid-session: the last reply wins', changed.effort === 'low' && changed.model === 'claude-sonnet-5');
const boosted = feed(reply(1, { effort: 'high', perTurnEffort: 'xhigh' }));
ok('a one-turn boost is kept apart from the session level', boosted.effort === 'high' && boosted.turnEffort === 'xhigh', { effort: boosted.effort, turn: boosted.turnEffort });
const after = feed(reply(1, { effort: 'high', perTurnEffort: 'xhigh' }), reply(2, { effort: 'high' }));
ok('…and gone with the next reply', after.turnEffort === '', after.turnEffort);
const synthetic = feed(reply(1, { effort: 'high' }), reply(2, {}, '<synthetic>'));
ok('the app\'s own «<synthetic>» line leaves model and level alone', synthetic.model === 'claude-opus-5' && synthetic.effort === 'high');
const older = feed(reply(1, {}));
ok('a reply without the field: no level', older.effort === '', older.effort);

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
