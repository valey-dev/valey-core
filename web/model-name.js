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
