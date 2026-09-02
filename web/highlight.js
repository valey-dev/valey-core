// Pixel-office syntax highlighting: no dependencies, no innerHTML surprises.
// Every chunk is escaped as it is emitted, so a file from disk cannot inject tags.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ESC[c]);
const span = (cls, text) => `<span class="t-${cls}">${esc(text)}</span>`;

const JS_KEYWORDS = 'const|let|var|function|return|if|else|for|while|do|of|in|new|class|extends|super'
  + '|import|export|from|as|default|async|await|try|catch|finally|throw|switch|case|break|continue'
  + '|typeof|instanceof|delete|void|yield|static|get|set';

// order matters: comments and strings must win over everything else
const RULES = {
  js: [
    ['comment', /\/\*[\s\S]*?\*\/|\/\/[^\n]*/y],
    ['string', /`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y],
    ['number', /\b0[xXbo][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y],
    ['keyword', new RegExp(`\\b(?:${JS_KEYWORDS})\\b`, 'y')],
    ['literal', /\b(?:true|false|null|undefined|NaN|this)\b/y],
    ['fn', /[A-Za-z_$][\w$]*(?=\s*\()/y],
    ['prop', /\.[A-Za-z_$][\w$]*/y],
    ['punct', /[{}()[\];,]+/y],
    [null, /[A-Za-z_$][\w$]*|\s+|[\s\S]/y],
  ],
  css: [
    ['comment', /\/\*[\s\S]*?\*\//y],
    ['string', /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y],
    ['atrule', /@[\w-]+/y],
    ['important', /!important\b/y],
    ['color', /#[0-9a-fA-F]{3,8}\b/y],
    ['number', /-?\d*\.?\d+(?:px|rem|em|%|vh|vw|vmin|vmax|fr|ch|deg|ms|s)?\b/y],
    ['cssprop', /[-a-zA-Z]+(?=\s*:)/y],
    ['selector', /\.[-\w]+|#[-\w]+|::?[-\w]+/y],
    ['fn', /[a-zA-Z-]+(?=\()/y],
    ['punct', /[{};,()]+/y],
    [null, /[\s\S]/y],
  ],
  json: [
    ['comment', /\/\/[^\n]*/y],
    ['cssprop', /"(?:\\.|[^"\\\n])*"(?=\s*:)/y],
    ['string', /"(?:\\.|[^"\\\n])*"/y],
    ['number', /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y],
    ['literal', /\b(?:true|false|null)\b/y],
    ['punct', /[{}[\],:]+/y],
    [null, /[\s\S]/y],
  ],
};

const BY_EXT = {
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js',
  css: 'css', scss: 'css', less: 'css',
  json: 'json',
  html: 'html', htm: 'html', svg: 'html', xml: 'html',
};

// Inside a tag: name, then attributes, then the closing bracket.
const TAG_RULES = [
  ['punct', /<\/?/y],
  ['tag', /[A-Za-z][\w:-]*/y],
  ['string', /"[^"]*"|'[^']*'/y],
  ['punct', /\/?>|=/y],
  ['attr', /[A-Za-z_:@#$][-\w:.]*/y],
  [null, /\s+|[\s\S]/y],
];

function formatTag(tag) {
  let out = '', i = 0, named = false;   // the first identifier is the tag, the rest are attributes
  while (i < tag.length) {
    let matched = false;
    for (const [cls, re] of TAG_RULES) {
      re.lastIndex = i;
      const m = re.exec(tag);
      if (!m || !m[0]) continue;
      const kind = cls === 'tag' ? (named ? 'attr' : 'tag') : cls;
      if (cls === 'tag') named = true;
      out += kind ? span(kind, m[0]) : esc(m[0]);
      i += m[0].length;
      matched = true;
      break;
    }
    if (!matched) { out += esc(tag[i]); i += 1; }
  }
  return out;
}

// HTML needs its own pass: text stays plain, and <style>/<script> bodies are
// handed to the css/js rules so a one-file page is coloured all the way through.
export function highlightHtml(src) {
  const TAG = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?[a-zA-Z][^>]*>/gi;
  let out = '', i = 0, m;
  while ((m = TAG.exec(src))) {
    out += esc(src.slice(i, m.index));
    const tag = m[0];
    if (tag.startsWith('<!--')) out += span('comment', tag);
    else if (/^<!doctype/i.test(tag)) out += span('atrule', tag);
    else out += formatTag(tag);
    i = m.index + tag.length;

    const opened = /^<(script|style)\b/i.exec(tag);
    if (opened && !/\/>$/.test(tag)) {
      const closer = new RegExp(`</${opened[1]}\\s*>`, 'i');
      const rest = src.slice(i);
      const end = closer.exec(rest);
      const body = end ? rest.slice(0, end.index) : rest;
      if (body) out += highlight(body, opened[1].toLowerCase() === 'style' ? 'css' : 'js');
      i += body.length;
      TAG.lastIndex = i;
    }
  }
  return out + esc(src.slice(i));
}

export function langOf(path = '') {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return BY_EXT[ext] || null;
}

// markdown fences say things like ```javascript or ```CSS
export function normaliseLang(tag = '') {
  const t = String(tag).toLowerCase();
  if (/^(js|javascript|jsx|ts|typescript|tsx|node)$/.test(t)) return 'js';
  if (/^(css|scss|less)$/.test(t)) return 'css';
  if (/^(html|htm|xml|svg|vue)$/.test(t)) return 'html';
  if (t === 'json') return 'json';
  return null;
}

// CSS needs one bit of memory: a colon right after a property opens a value, and
// inside a value `:red` must not be read as the pseudo-class `:red`.
export function highlightCss(src) {
  const rules = RULES.css;
  let out = '', i = 0, afterProp = false;
  while (i < src.length) {
    if (afterProp) {
      const colon = /\s*:/y;
      colon.lastIndex = i;
      const m = colon.exec(src);
      if (m) {
        out += esc(m[0].slice(0, -1)) + span('punct', ':');
        i += m[0].length;
      }
      afterProp = false;
      continue;
    }
    let matched = false;
    for (const [cls, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m || !m[0]) continue;
      out += cls ? span(cls, m[0]) : esc(m[0]);
      i += m[0].length;
      afterProp = cls === 'cssprop';
      matched = true;
      break;
    }
    if (!matched) { out += esc(src[i]); i += 1; }
  }
  return out;
}

export function highlight(src, lang) {
  if (lang === 'html') return highlightHtml(src);
  if (lang === 'css') return highlightCss(src);
  const rules = RULES[lang];
  if (!rules) return esc(src);
  let out = '', i = 0;
  while (i < src.length) {
    let matched = false;
    for (const [cls, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m || !m[0]) continue;
      out += cls ? span(cls, m[0]) : esc(m[0]);
      i += m[0].length;
      matched = true;
      break;
    }
    if (!matched) { out += esc(src[i]); i += 1; }
  }
  return out;
}
