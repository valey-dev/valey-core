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
  bad++; console.log('FAIL  | ' + what + (got === undefined ? '' : ' → ' + JSON.stringify(got)));
};

const seen = [];
const off = onUiScale((v) => seen.push(v));

applyUiScale(1.75);
ok('subscriber is called when changing size', seen.length === 1, seen);
ok('and convey a new scale', seen[0] === 1.75, seen[0]);
ok('the scale itself is also applied', ui.scale === 1.75, ui.scale);

applyUiScale(1);
ok('and on return to 100% they call again', seen.length === 2 && seen[1] === 1, seen);

// A value outside the steps does not become the scale, but the listener still hears
// about it: it has to lay the office out for what actually got applied.
applyUiScale(3.3);
ok('bad value drops to 100%', ui.scale === 1, ui.scale);
ok('and the subscriber is told applied, not requested', seen[seen.length - 1] === 1, seen);

const before = seen.length;
off();
applyUiScale(1.5);
ok('unsubscribe works', seen.length === before, seen);

let a = 0, b = 0;
onUiScale(() => a++);
onUiScale(() => b++);
applyUiScale(1.3);
ok('There can be several subscribers, and everyone is called', a === 1 && b === 1, [a, b]);

ok('size steps remain the same', UI_STEPS.join() === '1,1.15,1.3,1.5,1.75', UI_STEPS);

console.log(bad ? `\n${bad} упало` : '\nall intact');
process.exit(bad ? 1 : 0);
