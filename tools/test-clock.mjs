// node tools/test-clock.mjs — the stamps follow the office's language.
//
// toLocaleString([]) means "the browser's locale", and on an en-US machine every
// stamp below reads «09/10, 02:08 PM» — month first and AM/PM, which the office
// has nowhere else. The date is built in local time so the hour is 14 wherever
// the stand runs; only the shape of the string is judged.
globalThis.document = { documentElement: {}, title: '' };
const { setLang, locale, fmtStamp, fmtClock } = await import('../web/i18n.js');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    | ' + name);
  else { bad++; console.log('FAIL  | ' + name + (got === undefined ? '' : ' → ' + JSON.stringify(got))); }
};

const d = new Date(2026, 8, 10, 14, 8).getTime();

setLang('ru');
ok('ru: day.month and a 24-hour clock', fmtStamp(d) === '10.09, 14:08', fmtStamp(d));
ok('ru: the clock alone', fmtClock(d) === '14:08', fmtClock(d));

setLang('en');
ok('en: day/month and a 24-hour clock', fmtStamp(d) === '10/09, 14:08', fmtStamp(d));
ok('en: no AM/PM', fmtClock(d) === '14:08', fmtClock(d));
ok('en is British for the numbers', locale() === 'en-GB', locale());

// The stamp is the office's, not the machine's: the same date gives the same
// string whatever the process locale (this stand runs under en-US in CI and on
// this laptop).
const machine = new Date(d).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
ok('the machine locale is not consulted (its stamp differs or agrees, but never decides)',
  fmtStamp(d) === '10/09, 14:08', machine);

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
