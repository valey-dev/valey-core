// node tools/test-stack.mjs — the version and the stack on the sign above the
// door.
//
// What is checked is not "does reading a file work" but the two things that
// break quietly: the order the stack is decided in (a Next project has a
// package.json too) and honest degradation (no version means no line, not an
// invented v0.0.0).
import { readManifest, pickManifest, MANIFESTS } from '../server/stack.js';
import { buildLayout, planSignature } from '../web/layout.js';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('УПАЛ  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

// ---------------------------------------------------------------- manifests

const pkg = (o) => JSON.stringify(o);

const nextApp = readManifest('package.json', pkg({
  version: '3.5.6', dependencies: { next: '^16.1.2', react: '19.0.0' },
}));
ok('next бьёт react и package.json', nextApp.stack === 'Next 16', nextApp);
ok('версия из package.json', nextApp.version === 'v3.5.6', nextApp);

const plain = readManifest('package.json', pkg({ version: '0.1.0', dependencies: { chalk: '5' } }));
ok('package.json без фреймворка — Node', plain.stack === 'Node', plain);

const nuxt = readManifest('package.json', pkg({ dependencies: { nuxt: '4.0.0', vue: '3.4.0' } }));
ok('nuxt бьёт vue', nuxt.stack === 'Nuxt 4', nuxt);

const rn = readManifest('package.json', pkg({ dependencies: { react: '19', 'react-native': '0.76.1' } }));
ok('react-native бьёт react', rn.stack === 'React Native 0', rn);

const noMajor = readManifest('package.json', pkg({ dependencies: { next: 'workspace:*' } }));
ok('версия фреймворка без числа — голое имя', noMajor.stack === 'Next', noMajor);

const flutter = readManifest('pubspec.yaml', 'name: budget\nversion: 1.2.3+45\ndependencies:\n  flutter:\n    sdk: flutter\n');
ok('pubspec с flutter — Flutter', flutter.stack === 'Flutter', flutter);
ok('номер сборки после + отброшен', flutter.version === 'v1.2.3', flutter);

const dart = readManifest('pubspec.yaml', 'name: cli\nversion: 0.4.0\ndependencies:\n  args: ^2.0.0\n');
ok('pubspec без flutter — Dart', dart.stack === 'Dart', dart);

const rust = readManifest('Cargo.toml', '[package]\nname = "grip"\nversion = "0.9.1"\n');
ok('Cargo.toml — Rust', rust.stack === 'Rust' && rust.version === 'v0.9.1', rust);

const tauri = readManifest('Cargo.toml', '[package]\nversion = "1.0.0"\n[dependencies]\ntauri = "2"\n');
ok('tauri в зависимостях — Tauri', tauri.stack === 'Tauri', tauri);

const django = readManifest('pyproject.toml', '[project]\nname = "shop"\nversion = "2.1.0"\ndependencies = ["django>=5.0", "requests"]\n');
ok('pyproject с django — Django', django.stack === 'Django' && django.version === 'v2.1.0', django);

const py = readManifest('pyproject.toml', '[project]\nname = "tool"\nversion = "1.0"\ndependencies = ["click"]\n');
ok('pyproject без фреймворка — Python', py.stack === 'Python', py);

const go = readManifest('go.mod', 'module example.com/thing\n\ngo 1.23\n');
ok('go.mod — стек есть, версии нет', go.stack === 'Go' && go.version === null, go);

const zero = readManifest('package.json', pkg({ version: '0.0.0', dependencies: {} }));
ok('версия 0.0.0 не считается версией', zero.version === null, zero);

const empty = readManifest('package.json', pkg({ dependencies: {} }));
ok('версии нет — null, а не пустая строка', empty.version === null, empty);

ok('битый json не роняет разбор', readManifest('package.json', '{ не json') === null);

// A tag like ios/1.0.0-build21 comes from git describe — no "v" is prepended to it
const tagged = readManifest('Cargo.toml', '[package]\nversion = "ios/1.0.0-build21"\n');
ok('нечисловая версия остаётся как есть', tagged.version === 'ios/1.0.0-build21', tagged);
const vTag = readManifest('Cargo.toml', '[package]\nversion = "v2.0.0"\n');
ok('v перед числом не удваивается', vTag.version === 'v2.0.0', vTag);

// ---- priority: the first manifest in the list answers for both fields
const both = pickManifest({
  'pyproject.toml': '[project]\nversion = "9.9.9"\ndependencies = ["django"]\n',
  'package.json': pkg({ version: '1.0.0', dependencies: { next: '15' } }),
});
ok('package.json выигрывает у pyproject.toml', both.stack === 'Next 15' && both.version === 'v1.0.0', both);
ok('порядок MANIFESTS начинается с package.json', MANIFESTS[0] === 'package.json');
ok('манифестов нет — pickManifest молчит', pickManifest({}) === null);

// ---------------------------------------------------------------- the room

const agents = [
  { id: 'a1', project: 'budget-app', startedAt: 1, version: 'v3.5.6', stack: 'Next 16' },
  { id: 'a2', project: 'budget-app', startedAt: 2, version: '', stack: '' },
  { id: 'b1', project: 'grip', startedAt: 3, version: '', stack: 'Rust' },
  { id: 'c1', project: 'nowhere', startedAt: 4, version: '', stack: '' },
  { id: 'd1', project: 'tagged', startedAt: 5, version: 'v0.4.0', stack: '' },
];
const L = buildLayout(agents);
const room = (key) => L.rooms.find((r) => r.key === key);
ok('версия и стек в одной строке', room('budget-app').sub === 'v3.5.6 · Next 16', room('budget-app').sub);
ok('данные берутся у того агента, у кого они есть', room('budget-app').sub !== '');
ok('только стек', room('grip').sub === 'Rust', room('grip').sub);
ok('только версия', room('tagged').sub === 'v0.4.0', room('tagged').sub);
ok('ничего не нашлось — второй строки нет', room('nowhere').sub === '', room('nowhere').sub);

const sig = planSignature(agents);
const bumped = planSignature(agents.map((a) => (a.id === 'a1' ? { ...a, version: 'v3.6.0' } : a)));
ok('поднятая версия пересобирает план', sig !== bumped);
ok('та же версия план не трогает', sig === planSignature([...agents].reverse()));

// The geometry of the sign and the pixel font live in tools/test-pixfont.mjs:
// here only the fact that the room gets a second line is checked, and how that
// line is drawn is a separate question that breaks separately.

console.log(bad ? `\nпровалено: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
