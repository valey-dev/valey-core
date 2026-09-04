// Чем отвечать, когда офис отдаёт файл: тип по расширению и заголовки, с
// которыми написанное агентом можно показать, но нельзя исполнить.
import path from 'node:path';

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

export const fileType = (p) => MIME[path.extname(p).toLowerCase()] || 'text/plain; charset=utf-8';

// Страница и SVG исполняют скрипты, если открыть их адресом. /api/file живёт на
// том же origin, что и офис, а в localStorage офиса лежит токен хозяина — то
// есть html, который агент написал (или которому его подсказали), запущенный
// переходом по ссылке, читает токен. Просмотрщик в самой странице этого не
// делает: он берёт текст через fetch и кладёт в srcdoc песочницы, а fetch на
// attachment не смотрит. Заголовок отрезает только прямой переход по адресу
// и ничего больше. nosniff — на всё: браузер не должен угадывать тип у файла,
// расширение которого он не знает.
const ACTIVE = new Set(['.html', '.htm', '.xhtml', '.svg']);

export function fileHeaders(p) {
  const h = { 'x-content-type-options': 'nosniff' };
  if (ACTIVE.has(path.extname(p).toLowerCase())) h['content-disposition'] = 'attachment';
  return h;
}
