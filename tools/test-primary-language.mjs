// node tools/test-primary-language.mjs — English is the distribution default.
//
// Russian remains a supported locale, so a repository-wide Cyrillic grep would
// reject the feature it is meant to protect. This stand guards the seams where
// locale data used to leak into defaults, fallbacks, logs, and utility pages.
import fs from 'node:fs';
import { effectivePack, namePool } from '../server/agents.js';
import { geocode } from '../server/weather.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, got === undefined ? '' : '→ ' + JSON.stringify(got)); }
};

globalThis.document = { documentElement: {}, title: '' };
const i18n = await import('../web/i18n.js');
ok('Node-side imports start in English', i18n.lang() === 'en', i18n.lang());
ok('the default document title is English', i18n.t('doc.title') === 'Valey — the office', i18n.t('doc.title'));
ok('the default name pack is English', effectivePack({}) === 'en', effectivePack({}));
ok('the default name pool uses Latin script', namePool().every((n) => /^\p{Script=Latin}/u.test(n)));

const fetched = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  return { ok: true, json: async () => ({ results: [] }) };
};
try {
  await geocode('Yerevan');
  await geocode('Ереван', 'ru');
} finally {
  globalThis.fetch = realFetch;
}
ok('geocoding defaults to English', fetched[0]?.includes('language=en'), fetched[0]);
ok('Russian geocoding remains available explicitly', fetched[1]?.includes('language=ru'), fetched[1]);

const read = (file) => fs.readFileSync(file, 'utf8');
ok('translation fallback no longer points to Russian', !read('web/i18n.js').includes('(DICT.ru && DICT.ru[key])'));
ok('the character switcher fallback is English', !read('web/office.js').includes('|| SWITCHER.ru'));
ok('bilingual labels fall back to English', !read('web/ui.js').includes('|| v.ru'));
ok('geocoding has no hard-coded Russian query', !read('server/weather.js').includes('language=ru'));
ok('service-room titles are English', !/(?:ПЕРЕГОВОРКА|ОРАНЖЕРЕЯ)/.test(read('web/layout.js')));
ok('weather source identifiers are language-neutral', !/source: ['"](?:выдумана|настоящая)['"]/.test(read('web/weather.js')));
ok('drink completion messages use the translation dictionary', !/(?:Стакан воды|Кофе налит)/.test(read('web/main.js')));

const operatorFiles = [
  'server/index.js', 'server/modules.js', 'server/settings.js', 'server/weather.js',
  'tools/gh-release.mjs', 'tools/land.mjs', 'tools/lib/dom.mjs', 'tools/lib/office.mjs',
  'tools/make-favicon.py', 'tools/permit-demo.mjs', 'tools/permit.mjs',
  'tools/release-kind.mjs', 'tools/release.mjs', 'tools/run-tests.mjs',
  'tools/script.mjs', 'tools/shot.mjs', 'web/sheet.html',
];
const cyrillic = /[А-Яа-яЁё]/;
const untranslated = operatorFiles.filter((file) => cyrillic.test(read(file)));
ok('operator surfaces and the state sheet are English', untranslated.length === 0, untranslated);
const browserOperatorFiles = ['web/keymap.js', 'web/modules.js', 'web/places.js', 'web/stand.js'];
const untranslatedBrowserMessages = browserOperatorFiles.flatMap((file) => read(file).split('\n')
  .map((line, index) => ({ file, line, index: index + 1 }))
  .filter(({ line }) => cyrillic.test(line) && /(?:console\.|throw new Error|\bline\(|textContent|\.title\s*=)/.test(line))
  .map(({ file, index }) => `${file}:${index}`));
ok('browser diagnostics and stand controls are English', untranslatedBrowserMessages.length === 0, untranslatedBrowserMessages);

// Russian fixtures prove that the optional locale still works; reporter labels
// are contributor-facing UI and must not silently drift back to Russian. This
// intentionally inspects only the first literal argument of the shared test
// helpers, leaving fixture strings and expected localized output untouched.
const testFiles = [
  ...fs.readdirSync('tools').filter((name) => /^test-.*\.mjs$/.test(name)).map((name) => `tools/${name}`),
  ...['modules/plan', 'modules/radio'].flatMap((dir) =>
    fs.readdirSync(dir).filter((name) => /^test-.*\.mjs$/.test(name)).map((name) => `${dir}/${name}`)),
];
const untranslatedLabels = [];
for (const file of testFiles) {
  for (const [index, line] of read(file).split('\n').entries()) {
    const label = line.match(/\b(?:ok|check|bad|say|survives)\(\s*([`'"])(.*?)\1/);
    if (label && cyrillic.test(label[2])) untranslatedLabels.push(`${file}:${index + 1}`);
  }
}
ok('test reporter labels are English', untranslatedLabels.length === 0, untranslatedLabels);

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
