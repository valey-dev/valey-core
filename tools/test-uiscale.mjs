// node tools/test-uiscale.mjs — the interface size tells whoever depends on it.
//
// The office canvas is laid out around the HUD, and the HUD grows with the interface
// size. Nothing in the browser fires an event for that, so the setter has to say so
// itself — and when it stopped saying so the office kept the old gap above it until
// the page was reloaded, which reads as "the zoom is broken" rather than "a listener
// is missing". Cheap to check here, invisible everywhere else.

// theme.js paints :root on import and reads localStorage, and wants neither in node.
globalThis.document = {
  documentElement: { style: { setProperty() {}, removeProperty() {} } },
  title: '',
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const { applyUiScale, onUiScale, ui, UI_STEPS } = await import('../web/theme.js');

let bad = 0;
const ok = (what, cond, got) => {
  if (cond) { console.log('ok    | ' + what); return; }
  bad++; console.log('УПАЛ  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
};

const seen = [];
const off = onUiScale((v) => seen.push(v));

applyUiScale(1.75);
ok('подписчика зовут при смене размера', seen.length === 1, seen);
ok('и передают новый масштаб', seen[0] === 1.75, seen[0]);
ok('сам масштаб тоже применён', ui.scale === 1.75, ui.scale);

applyUiScale(1);
ok('и на возврате к 100% зовут снова', seen.length === 2 && seen[1] === 1, seen);

// A value outside the steps does not become the scale, but the listener still hears
// about it: it has to lay the office out for what actually got applied.
applyUiScale(3.3);
ok('негодное значение падает в 100%', ui.scale === 1, ui.scale);
ok('и подписчику говорят применённое, а не запрошенное', seen[seen.length - 1] === 1, seen);

const before = seen.length;
off();
applyUiScale(1.5);
ok('отписка работает', seen.length === before, seen);

let a = 0, b = 0;
onUiScale(() => a++);
onUiScale(() => b++);
applyUiScale(1.3);
ok('подписчиков может быть несколько, и зовут всех', a === 1 && b === 1, [a, b]);

ok('шаги размера остались теми же', UI_STEPS.join() === '1,1.15,1.3,1.5,1.75', UI_STEPS);

console.log(bad ? `\n${bad} упало` : '\nвсё цело');
process.exit(bad ? 1 : 0);
