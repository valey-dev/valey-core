#!/usr/bin/env node
// Снимок офиса из терминала, без рук. Нужен затем, что судить о мелком тексте
// по макету нельзя: холст 400×225 растягивается целыми пикселями, и настоящую
// букву видно только на настоящем кадре.
//
//   node tools/shot.mjs                        # кадр целиком, в .shots/shot.png
//   node tools/shot.mjs --port 5179            # офис на другом порту
//   node tools/shot.mjs --keys Enter,hold-w:1500,shift-F9
//   node tools/shot.mjs --out /tmp/office.png --wait 6000
//   node tools/shot.mjs --eval "document.title"   # заглянуть в живую страницу
//   node tools/shot.mjs --video .shots/v0.2.0.mp4 --keys Enter,hold-w:4000
//
// --keys ведёт офис по шагам через CDP, чтобы дойти до нужного места:
//   Enter        нажать и отпустить
//   Space        пробел; можно и буквальным пробелом между запятыми
//   ArrowUp      стрелки; Up/Down/Left/Right — синонимы
//   hold-w:1500  держать W полторы секунды (ходьба)
//   wait:800     просто подождать
//   F9           служебный снимок холста 1:1 в .shots (пишет сам офис)
//   shift-F9     то же самое, но ×4 без сглаживания
// Обычный --out снимает страницу целиком вместе с панелями; F9 внутри офиса —
// только холст, зато пиксель в пиксель.
//
// --video пишет тот же проход целиком, а не одним кадром: это исходник для
// релизного ролика. Смысл в том, что проход задан строкой --keys, поэтому
// после правки он переснимается той же командой, а не руками заново.
//
// ------------------------------------------------------------------ ловушки
//
// Две штуки, на которые 29 августа 2026 ушло два часа, обе молчаливые:
//
// 1. Без своего --user-data-dir Chrome натыкается на уже запущенный у человека
//    браузер, пишет «Failed to create a ProcessSingleton for your profile
//    directory» и выходит, ничего не сняв. Тот же отказ — если переиспользовать
//    каталог, в котором остался живой процесс. Поэтому здесь каждый раз свежий
//    временный профиль.
//
// 2. `chrome --headless --screenshot` на этой странице не срабатывает НИКОГДА:
//    офис держит открытым /api/stream, событие load не наступает, и Chrome
//    ждёт вечно. Единственный рабочий путь — поднять --remote-debugging-port и
//    позвать Page.captureScreenshot по таймеру, что и делается ниже. Зависимо-
//    стей не нужно: в Node 22 есть глобальный WebSocket.
// 3. Кадры экранной трансляции приходят неравномерно: Chrome шлёт их на
//    изменение картинки, а не по таймеру, и каждый надо подтвердить —
//    screencastFrameAck. Без подтверждения поток встаёт после первого же кадра,
//    и на диск ложится ровно одна картинка вместо ролика. Поэтому длительность
//    каждого кадра берётся из его метки времени, а не считается как 1/30: иначе
//    ходьба по коридору едет то быстрее, то медленнее записанного.
// 4. Убитый прогон оставляет за собой живой Chrome, и он держит порт 9222.
//    Следующий запуск после этого висит молча — сколько ни жди, кадра не будет,
//    и выглядит это как «сломался офис», а не «сломался снимок». 2 сентября
//    2026 на это ушло два запуска подряд. Лечится до запуска:
//        pgrep -f 'user-data-dir=/var/folders/.*/T/valey-shot-' | xargs kill
//    Шаблон обязателен целиком: `pkill -f chrome` уносит браузер пользователя.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT_CDP = 9222;

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const port = arg('port', '5179');
const url = arg('url', `http://localhost:${port}/`);
const evalJs = arg('eval', '');
const out = arg('out', path.join(process.cwd(), '.shots', 'shot.png'));
const settle = Number(arg('wait', 5000));
const video = arg('video', '');
// Окно шире обычного только под видео: у ролика 1920×1080 целевые, а у кадра
// свой устоявшийся размер, и менять его задним числом значит переснять всё.
const size = arg('size', video ? '1920,1080' : '1400,820');
const steps = arg('keys', '').split(',').filter(Boolean);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Коды нужны Chrome: без windowsVirtualKeyCode страница получает событие, у
// которого key есть, а keyCode нет, и офис его не узнаёт.
// Стрелки нужны, чтобы дойти клавиатурой до того, что клавиатурой и проверяется:
// фокус в карточке агента без них не сдвинуть, а мышью тут ходить нечем.
// Буквы офиса, а не только ходьба: B — скейт, N — заметки, C — переодеться,
// P — окно в мир, U — цвет офиса, R — радио, M — звук, T — автообход камер,
// Z — лупа в просмотрщике. Без них строгая проверка ниже отвергает половину
// того, ради чего стенд и заводился.
const VK = { Enter: 13, ' ': 32, Escape: 27, Tab: 9, F9: 120,
  w: 87, a: 65, s: 83, d: 68, e: 69, b: 66, c: 67, i: 73, m: 77, n: 78, o: 79, p: 80, r: 82, t: 84, u: 85, z: 90,
  ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
// Цифры: с 31 августа 2026 они выбирают пункт в открытой панели — вкладку
// инвентаря и карточки, этаж в лифте, волну в радио. Без них снять эти экраны
// нельзя вообще: до панели можно дойти, а переключить в ней нечем.
for (let d = 0; d <= 9; d++) VK[String(d)] = 48 + d;
const CODE = { Enter: 'Enter', ' ': 'Space', Escape: 'Escape', Tab: 'Tab', F9: 'F9',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
for (const ch of 'wasdebcmnoprtuz') CODE[ch] = 'Key' + ch.toUpperCase();
for (let d = 0; d <= 9; d++) CODE[String(d)] = 'Digit' + d;

// Пробел пишется в --keys буквальным пробелом между запятыми, и это неудобно
// ровно настолько, чтобы вместо него написали Space. Раньше такой токен молча
// проваливался: VK/CODE его не знали, Chrome слал событие без keyCode, офис
// такое не узнавал. 30 августа 2026 на этом ушло четыре кадра и неверный вывод
// «нажатие включило и выключило камеры» — не сработало ни одно. Синонимы
// нужны затем, чтобы промах по названию был опечаткой, а не тишиной.
const ALIAS = { Space: ' ', Spacebar: ' ', Esc: 'Escape', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight' };
const alias = (k) => (Object.prototype.hasOwnProperty.call(ALIAS, k) ? ALIAS[k] : k);

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'valey-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
  '--hide-scrollbars', `--remote-debugging-port=${PORT_CDP}`,
  `--window-size=${size}`, 'about:blank',
], { stdio: 'ignore', detached: true });

let ws;
const bye = async (code) => {
  try { ws?.close(); } catch { /* уже закрыт */ }
  try { process.kill(-chrome.pid); } catch { try { chrome.kill(); } catch { /* уже умер */ } }
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  process.exit(code);
};

try {
  // порт открывается не мгновенно, а спрашивать раньше времени — ECONNREFUSED
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try { await fetch(`http://127.0.0.1:${PORT_CDP}/json/version`); ready = true; } catch { await wait(250); }
  }
  if (!ready) throw new Error('Chrome не поднял отладочный порт — проверь CHROME_PATH');

  const target = await (await fetch(
    `http://127.0.0.1:${PORT_CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' },
  )).json();

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  let id = 0;
  const pending = new Map();
  const onEvent = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method && onEvent.has(m.method)) onEvent.get(m.method)(m.params);
  });
  const send = (method, params = {}) => new Promise((res) => {
    const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
  });

  // вкладка переиспользуется между запусками, и без этого можно получить кадр
  // по старому коду — с виду свежий, а на деле прошлый
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.enable');
  // Размер окна и размер страницы — не одно и то же: у окна 1920×1080 область
  // страницы вышла 1920×993, а h264 не кодирует нечётную высоту и падает уже на
  // сборке, когда все кадры сняты. Вычитать высоту хрома на глаз бессмысленно,
  // она своя у каждой версии, — поэтому вьюпорт задаётся явно.
  if (video) {
    const [w, h] = size.split(',').map(Number);
    await send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 1, mobile: false,
    });
  }
  await send('Page.reload', { ignoreCache: true });
  await wait(settle);

  // Запись начинается до клавиш: первый кадр ролика — офис в покое, а не
  // человек, уже шагнувший в дверь.
  let frames = [];
  let framesDir = '';
  if (video) {
    framesDir = path.join(path.dirname(video), '.frames');
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(framesDir, { recursive: true });
    const writes = [];
    onEvent.set('Page.screencastFrame', (p) => {
      const file = path.join(framesDir, `f${String(frames.length).padStart(5, '0')}.jpg`);
      frames.push({ file, at: p.metadata.timestamp });
      writes.push(fs.writeFile(file, Buffer.from(p.data, 'base64')));
      send('Page.screencastFrameAck', { sessionId: p.sessionId });
    });
    frames.writes = writes;
    const [w, h] = size.split(',').map(Number);
    await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: w, maxHeight: h });
  }

  const key = (type, k, modifiers = 0) => send('Input.dispatchKeyEvent', {
    type, key: k, code: CODE[k] || k, windowsVirtualKeyCode: VK[k], nativeVirtualKeyCode: VK[k],
    modifiers, text: type === 'keyDown' && k.length === 1 ? k : undefined,
  });

  for (const step of steps) {
    const [what, ms] = step.split(':');
    if (what === 'wait') { await wait(Number(ms) || 500); continue; }
    if (what === 'shift-F9') { await key('keyDown', 'F9', 8); await key('keyUp', 'F9', 8); await wait(600); continue; }
    if (what.startsWith('hold-')) {
      const k = alias(what.slice(5));
      if (!VK[k]) throw new Error(`--keys: не знаю клавишу «${what.slice(5)}» в hold-`);
      await key('keyDown', k); await wait(Number(ms) || 800); await key('keyUp', k); continue;
    }
    const k = alias(what);
    // Молча отправить событие без keyCode — значит соврать: офис его не увидит,
    // а кадр выйдет такой, будто клавиша нажалась и ничего не изменила.
    if (!VK[k]) throw new Error(`--keys: не знаю клавишу «${what}». Известны: ${Object.keys(VK).map((x) => (x === ' ' ? 'Space' : x)).join(', ')}`);
    await key('keyDown', k); await key('keyUp', k);
    await wait(Number(ms) || 400);
  }
  await wait(600);

  // --eval — заглянуть внутрь живой страницы, когда офис на вид работает, а
  // предмета нет. Без этого остаётся гадать: модуль не встал, точка не
  // сработала или рисуется мимо. Печатается до кадра, чтобы вывод шёл в том
  // порядке, в каком проверяют.
  if (evalJs) {
    const r = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) console.log('--eval упал:', r.exceptionDetails.text || r.exceptionDetails.exception?.description);
    else console.log('--eval:', JSON.stringify(r.result?.value ?? r.result?.description ?? null));
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, Buffer.from(shot.data, 'base64'));
  console.log('снято:', out);

  if (video) {
    await send('Page.stopScreencast');
    await Promise.all(frames.writes);
    if (frames.length < 2) throw new Error('трансляция дала ' + frames.length + ' кадр(ов) — записывать нечего');

    // Список для concat-демуксера: у каждого кадра своя длительность, взятая из
    // метки времени. Последний кадр метки «до следующего» не имеет, поэтому ему
    // даётся минимум, и он же повторяется строкой ниже — без повтора ffmpeg
    // обрезает хвост ролика.
    const lines = [];
    for (let i = 0; i < frames.length; i++) {
      const dur = i + 1 < frames.length ? frames[i + 1].at - frames[i].at : 1 / 30;
      lines.push(`file '${path.basename(frames[i].file)}'`, `duration ${Math.max(dur, 1 / 120).toFixed(4)}`);
    }
    lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`);
    const list = path.join(framesDir, 'frames.txt');
    await fs.writeFile(list, lines.join('\n') + '\n');

    const secs = (frames[frames.length - 1].at - frames[0].at).toFixed(1);
    const ff = ['-y', '-f', 'concat', '-safe', '0', '-i', 'frames.txt',
      // crop до чётного — страховка на случай своего --size: без неё падение
      // приходит после съёмки, когда переснимать дорого
      '-vf', 'fps=30,crop=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
      '-pix_fmt', 'yuv420p', path.resolve(video)];
    const ok = await new Promise((res) => {
      const p = spawn('ffmpeg', ff, { cwd: framesDir, stdio: 'ignore' });
      p.on('error', () => res(false));
      p.on('exit', (c) => res(c === 0));
    });
    if (ok) {
      await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
      console.log(`записано: ${video} — ${frames.length} кадров, ${secs} с`);
    } else {
      // ffmpeg тут не зависимость проекта, а удобство: без него остаются кадры
      // и строчка, которой их собрать где угодно.
      console.log(`кадры: ${framesDir} — ${frames.length} шт, ${secs} с`);
      console.log(`собрать:\n  cd ${framesDir} && ffmpeg -f concat -safe 0 -i frames.txt \\\n    -vf 'fps=30,crop=trunc(iw/2)*2:trunc(ih/2)*2' -c:v libx264 -crf 18 -pix_fmt yuv420p ${path.resolve(video)}`);
    }
  }
  await bye(0);
} catch (err) {
  console.error('не снялось:', err.message);
  await bye(1);
}
