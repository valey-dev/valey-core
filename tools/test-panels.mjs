// node tools/test-panels.mjs — каждая панель где-то расставлена.
//
// Панели центрируются одним правилом в style.css, где они перечислены
// поимённо. Забытая в этом списке панель не ломается заметно: она просто
// ложится обычным блоком в конец страницы и уезжает под нижний край экрана.
// 30 августа 2026 так приехало приглашение, и увидел это человек, а не стенд —
// ни один тест здесь не смотрит на вёрстку.
//
// Поэтому проверяется не картинка, а решение: у каждой панели в разметке
// должно быть сказано, центрируется она общим правилом или ставит себя сама.
// Третьего — «никто про неё не подумал» — быть не должно.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};

// Панели, которые ставят себя сами и в общий список не входят по замыслу.
// Список короткий и осознанный: если панель попала сюда, значит у неё есть
// своё правило в style.css — это и проверяется ниже.
const OWN = ['dialog', 'viewer', 'title'];

const hidden = [...html.matchAll(/<div id="([\w-]+)" hidden><\/div>/g)].map((m) => m[1]);
ok('панели в разметке нашлись', hidden.length >= 8, hidden);

// строка правила, где перечислены центрируемые
const rule = (css.match(/^#[^{]*\{position:fixed; inset:0; z-index:28;[^}]*\}/m) || [''])[0];
const centred = [...rule.matchAll(/#([\w-]+)/g)].map((m) => m[1]);
ok('правило центрирования найдено', centred.length >= 7, centred);

const forgotten = hidden.filter((id) => !centred.includes(id) && !OWN.includes(id));
ok('ни одна панель не забыта: либо в общем правиле, либо ставит себя сама',
  forgotten.length === 0, forgotten);

// Скрытие идёт тем же списком: без [hidden] правило display:flex перебивает
// атрибут, и спрятанная панель остаётся на экране. Правил с [hidden] в файле
// несколько — у панелей со своим расположением они свои, — поэтому собираем
// все, а не первое попавшееся: на этом стенд сам и споткнулся, когда поймал
// правило #dialog вместо длинного списка.
const hiddenListed = [...css.matchAll(/#([\w-]+)\[hidden\]/g)].map((m) => m[1]);
const notHidden = centred.filter((id) => !hiddenListed.includes(id));
ok('и каждая центрируемая умеет прятаться', notHidden.length === 0, notHidden);

// Обратная сторона: в правиле не должно быть имён, которых в разметке нет —
// такое имя означает переименованную или удалённую панель.
const ghosts = centred.filter((id) => !hidden.includes(id));
ok('в правиле нет призраков — все имена есть в разметке', ghosts.length === 0, ghosts);

for (const id of OWN) {
  ok(`${id} ставит себя сам — у него своё правило`, new RegExp('#' + id + '\\b').test(css), id);
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
