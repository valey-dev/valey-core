// Plural forms. They break quietly: "5 экрана" in the card goes unnoticed until
// somebody starts reading, and a stand catches it in a second.
//
// setLang touches document — the office needs it, the stand does not, so it is a
// stand-in.
globalThis.document = { documentElement: {}, title: '' };

// The dictionary self-check prints a warning on import. We catch it here:
// "en:title.day.few" was noise on every load, and English has no such form.
const warned = [];
const warn = console.warn;
console.warn = (...a) => { warned.push(a.join(' ')); warn(...a); };
const { t, setLang, addDict, pickLang, deviceLang } = await import('../web/i18n.js');
console.warn = warn;

// Since 6 September 2026 the office starts in the language of the device, so a
// stand that wants Russian says so. Node reports `en-US`, and without this line
// every Russian check below would be reading the English dictionary.
setLang('ru');

// The fixture is its own rather than a key borrowed from the office. There used
// to be a line here about the easel's screens; the easel left for a module and
// the test went red on a feature moving, while what it checks is not the feature
// but the plural machine. The test's key lives in the test — then it survives
// any move.
addDict({
  ru: { 'test.screens': 'one:{n} экран|few:{n} экрана|many:{n} экранов' },
  en: { 'test.screens': 'one:{n} screen|other:{n} screens' },
});

let bad = 0;
const ok = (what, cond, got) => {
  if (cond) { console.log('  ок  ', what); return; }
  bad++; console.log('  ПЛОХО', what, got !== undefined ? `— получено: ${JSON.stringify(got)}` : '');
};

// ------------------------------------------------------------------ Russian
const ru = (n) => t('test.screens', { n });
ok('1 — единственное', ru(1) === '1 экран', ru(1));
ok('2 — как в макете', ru(2) === '2 экрана', ru(2));
ok('4 — ещё «экрана»', ru(4) === '4 экрана', ru(4));
ok('5 — «экранов»', ru(5) === '5 экранов', ru(5));
ok('7 — «экранов»', ru(7) === '7 экранов', ru(7));
ok('0 — «экранов», а не «экран»', ru(0) === '0 экранов', ru(0));
// 11 and 21 are the whole reason Intl is here rather than n % 10
ok('11 — «экранов», хотя кончается на 1', ru(11) === '11 экранов', ru(11));
ok('21 — «экран», хотя больше десяти', ru(21) === '21 экран', ru(21));
ok('111 — «экранов»', ru(111) === '111 экранов', ru(111));

// ------------------------------------------------------------------ English
setLang('en');
const en = (n) => t('test.screens', { n });
ok('en: 1 — screen', en(1) === '1 screen', en(1));
ok('en: 2 — screens', en(2) === '2 screens', en(2));
ok('en: 0 — screens', en(0) === '0 screens', en(0));
setLang('ru');

// --------------------------------------------------- which language a device gets
// Russian only for a Russian device, English for everything else. The office was
// hard-coded to Russian until 6 September 2026, which read as a bug to everybody
// who did not speak it — and it is the first thing a stranger sees.
ok('русское устройство — русский офис', pickLang(['ru-RU', 'en-US']) === 'ru');
ok('регион не решает: ru-KZ — тоже русский', pickLang(['ru-KZ']) === 'ru');
ok('РЕГИСТР тега не решает', pickLang(['RU']) === 'ru');
ok('английское устройство — английский офис', pickLang(['en-GB']) === 'en');
// A third language the office does not speak must land on English, not on the
// author's own language, and not on a key instead of text.
ok('язык, которого офис не знает, — английский', pickLang(['de-DE', 'fr']) === 'en', pickLang(['de-DE', 'fr']));
ok('порядок списка уважается: первым идёт то, что человек поставил первым',
  pickLang(['en-US', 'ru-RU']) === 'en');
ok('русский вторым в списке всё же выбирается, если первого офис не знает',
  pickLang(['de', 'ru']) === 'ru');
ok('устройства нет вовсе — английский', pickLang([]) === 'en' && pickLang(undefined) === 'en');
ok('deviceLang отвечает одним из двух языков офиса', ['ru', 'en'].includes(deviceLang()), deviceLang());

// 'auto' is what a fresh settings file says, and it must never reach the screen
// as a language of its own: it resolves to the device, like anything unknown.
setLang('auto');
const selfOf = { ru: 'русский', en: 'English' };
ok('«auto» — это язык устройства, а не третий язык', t('lang.self') === selfOf[deviceLang()], t('lang.self'));
ok('«auto» ставит язык в документ', globalThis.document.documentElement.lang === deviceLang(),
  globalThis.document.documentElement.lang);
// index.html carries no title of its own since 6 September 2026, so the very
// first setLang has to write one even when it changed nothing.
globalThis.document.title = '';
setLang('auto');
ok('заголовок вкладки пишется и когда язык не менялся', globalThis.document.title === t('doc.title'),
  globalThis.document.title);
// Garbage in the settings file lands where 'auto' does, not on a blank office.
setLang('клингонский');
ok('неизвестный язык в настройках — тоже язык устройства', t('lang.self') === selfOf[deviceLang()], t('lang.self'));
setLang('ru');

// ------------------------------------------------ strings without forms are left alone
ok('строка без | остаётся собой', t('cam.corridor', { n: 2 }) === 'коридор 2', t('cam.corridor', { n: 2 }));
ok('подстановка без n работает', t('board.title', { room: 'AI valey' }) === 'Доска · AI valey');
ok('словарь полон, и формы, которых у языка нет, не считаются пропуском', !warned.some((w) => w.includes('нет перевода')), warned);
ok('нет ключа — виден ключ', t('нетТакого') === 'нетТакого');

// The form separator must never reach the screen for any n — that is what the
// breakage would look like in the office: "one:1 экран|few:1 экрана|…" right
// there in the card.
ok('разделитель форм не протекает наружу', [0, 1, 2, 5, 21, 100].every((n) => !ru(n).includes('|')));

console.log(bad ? `\nупало проверок: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
