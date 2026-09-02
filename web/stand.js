// Табличка тестового стенда.
//
// Офис на 5177 и офис на 5188 выглядят одинаково, и это уже стоило времени:
// кадр из чужой ветки читался как «фича не работает», а пустой этаж в режиме
// shared — как поломка сборки. Табличка отвечает на три вопроса сразу: это
// стенд, чей он и что на нём проверяют.
//
// Показывается только когда сервер запущен с VALEY_STAND — в обычном офисе
// её нет вовсе, и снимать её перед показом не нужно.
import { moduleFailures } from './modules.js';

export async function initStand() {
  let s = null;
  try {
    s = await (await fetch('/api/stand')).json();
  } catch {
    return null;
  }
  // Ответ может прийти отказом, а не объектом с текстом: гейт отдаёт {error}.
  if (!s || typeof s !== 'object' || !s.text) return null;

  const box = document.createElement('div');
  box.id = 'stand';
  const line = (cls, text) => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    box.appendChild(d);
  };
  line('stand-tag', 'ТЕСТОВЫЙ СТЕНД');
  line('stand-what', s.text);
  const where = [s.branch && `ветка ${s.branch}`, s.port && `порт ${s.port}`].filter(Boolean).join(' · ');
  if (where) line('stand-where', where);
  // Список модулей — переключателями. Клик гасит модуль на сервере и
  // перезагружает страницу: половина работы модуля живёт в клиенте, и без
  // перезагрузки офис остался бы с уже нарисованными предметами.
  const all = s.all || [];
  if (!all.length) {
    line('stand-where', 'модулей нет — бесплатная сборка');
  } else {
    // Состояние словом, а не галочкой. Первая версия показывала ☑/☐, кнопки
    // стояли вплотную, и уже на второй проверке выключенным оказался не тот
    // модуль, о котором думали: разница между двумя значками в мелком шрифте
    // не читается, а цена ошибки — «фича не работает» на пустом месте.
    const rows = document.createElement('div');
    rows.className = 'stand-mods';
    for (const m of all) {
      const b = document.createElement('button');
      b.className = 'stand-mod' + (m.off ? ' off' : '') + (m.broken ? ' broken' : '');
      b.innerHTML = '';
      const name = document.createElement('b');
      name.textContent = m.id;
      const state = document.createElement('i');
      state.textContent = m.broken ? 'СЛОМАН' : m.off ? 'ВЫКЛ' : 'вкл';
      b.append(name, state);
      b.title = m.off ? `включить ${m.id}` : `выключить ${m.id}`;
      b.onclick = async () => {
        if (b.disabled) return;
        b.disabled = true;
        state.textContent = '…';        // клик, который не дошёл, должен быть виден
        try {
          await fetch('/api/stand/toggle', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: m.id, off: !m.off }),
          });
        } finally {
          location.reload();
        }
      };
      rows.appendChild(b);
    }
    box.appendChild(rows);
    // То же самое ещё раз словами: состояние, названное дважды, не читается
    // задом наперёд.
    const dead = all.filter((m) => m.off).map((m) => m.id);
    line('stand-where', dead.length ? `выключены: ${dead.join(', ')}` : 'все модули включены');
    // Без этой строки панель врёт: выключенный здесь модуль остался на диске,
    // и это проверка поведения офиса, а не бесплатной сборки.
    line('stand-fine', 'выключение — имитация: файлы на диске остаются');
  }
  document.body.appendChild(box);
  return s;
}
