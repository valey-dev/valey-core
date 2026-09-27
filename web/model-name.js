// The model an agent answers with, as a person reads it: claude-opus-5 is
// «Opus 5», claude-sonnet-4-5-20250929 is «Sonnet 4.5». Only the families the
// office knows are renamed; any other id is shown as it came, because a new
// model will ship before the office hears of it, and «unknown» would hide the
// one thing worth reading. Frame: #model-card on WIP, v3.
const FAMILIES = new Set(['opus', 'sonnet', 'haiku', 'fable']);
const VERSION = '(\\d{1,2}(?:-\\d{1,2})*)';
const DATE = '(?:-\\d{8})?';
const NEW_STYLE = new RegExp(`^claude-([a-z]+)-${VERSION}${DATE}$`);   // claude-opus-4-1
const OLD_STYLE = new RegExp(`^claude-${VERSION}-([a-z]+)${DATE}$`);   // claude-3-5-sonnet

// The context window of a model, for the card's «310k / 1M» and the bubble's
// meter. Claude 5 and newer hold 1M: auto-compaction in this machine's
// transcripts fired at 967k (27 September 2026). The older families the office
// knows, Haiku 4.5 included, hold 200k. Anything else is null — a percentage of
// an invented window is worse than the bare number.
// Frames: [Agent context size](https://www.figma.com/design/izt4d17qotvyIv7r6BJdSY/AI-Valey?node-id=2469-9436)
export function contextWindow(id) {
  const s = String(id || '');
  const m = NEW_STYLE.exec(s) || OLD_STYLE.exec(s);
  if (!m) return null;
  const [family, version] = NEW_STYLE.test(s) ? [m[1], m[2]] : [m[2], m[1]];
  if (!FAMILIES.has(family)) return null;
  return parseInt(version, 10) >= 5 ? 1_000_000 : 200_000;
}

// From here on the card's tail turns yellow and the bubble grows a meter:
// auto-compaction comes at about 97%, so the warning arrives well before it.
export const CTX_WARN = 0.8;
export function ctxShare(a) {
  const w = contextWindow(a && a.model);
  return w && a.ctx ? a.ctx / w : null;
}
const kilo = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${Math.max(1, Math.round(n / 1000))}k`);
// «310k / 1M», or «62k» when the window is unknown; nothing before a reply.
export function ctxText(ctx, id) {
  if (!ctx) return '';
  const w = contextWindow(id);
  return w ? `${kilo(ctx)} / ${kilo(w)}` : kilo(ctx);
}

export function modelName(id) {
  const s = String(id || '');
  let family = '';
  let version = '';
  let m = NEW_STYLE.exec(s);
  if (m) [, family, version] = m;
  else if ((m = OLD_STYLE.exec(s))) [, version, family] = m;
  if (!family || !FAMILIES.has(family)) return s;
  return `${family[0].toUpperCase()}${family.slice(1)} ${version.replace(/-/g, '.')}`;
}

// The line beside the trade: the model and, in parentheses, the reasoning level
// in Claude Code's own words (low … max), untranslated like the model's name.
// No level, no parentheses — an empty «()» would read as a fault. The spaces are
// non-breaking: when the name row wraps, «Opus 5 (high)» goes down whole.
export function modelLabel(id, effort) {
  if (!id) return '';
  return `${modelName(id)}${effort ? ` (${effort})` : ''}`.replace(/ /g, '\u00a0');
}
