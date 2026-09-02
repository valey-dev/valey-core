// node tools/test-tunnel.mjs — офис в режиме private за посредником.
//
// Туннель соединяется с офисом с петли, а сокращение «пришло с этой машины»
// смотрит на адрес. Без проверки заголовков посредника гость из туннеля в
// режиме private оказывался бы хозяином: адрес совпал бы. Проверяется именно
// это — не переключатель в shared, а страховка от того, что о нём забудут.
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.TUNNEL_PORT || 5394);
const base = `http://127.0.0.1:${PORT}`;

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('УПАЛ  |', name, '→', JSON.stringify(got)); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'valey-tunnel-'));
const settingsFile = path.join(dir, 'settings.json');
await fsp.writeFile(settingsFile, JSON.stringify({
  // именно private: это тот режим, в котором ловушка и живёт
  access: { mode: 'private', token: 'tunnel-owner-0001', invites: [] },
  weather: { enabled: false },
}, null, 2));

const srv = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), VALEY_SETTINGS: settingsFile },
  stdio: 'ignore',
});
const stop = () => { try { srv.kill(); } catch { /* уже мёртв */ } };
process.on('exit', stop);

const whoami = (headers = {}) => fetch(base + '/api/whoami', { headers }).then((r) => r.json());

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { await fetch(base + '/api/whoami'); up = true; } catch { await wait(150); }
  }
  if (!up) throw new Error(`сервер не поднялся на ${PORT} — занят?`);

  const direct = await whoami();
  ok('своя машина — хозяин, как и была', direct.owner === true, direct);

  for (const h of ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded']) {
    const via = await whoami({ [h]: '203.0.113.7' });
    ok(`через посредника (${h}) — не хозяин`, via.owner === false, via);
  }

  const withToken = await whoami({ 'x-forwarded-for': '203.0.113.7', 'x-valey-owner': 'tunnel-owner-0001' });
  ok('но токен работает и через туннель — иначе хозяин не попадёт в свой офис снаружи',
    withToken.owner === true, withToken);

  // Смотреть в private можно всем — это то самое свойство одной Wi-Fi, которое
  // мы бережём; проверка выше про права, а не про порог.
  const look = await fetch(base + '/api/state', { headers: { 'x-forwarded-for': '203.0.113.7' } })
    .then((r) => r.status);
  ok('и смотреть офис в private по-прежнему можно без всего', look === 200, look);
} catch (e) {
  bad += 1;
  console.log('УПАЛ  | стенд не доехал →', e.message);
} finally {
  stop();
  await fsp.rm(dir, { recursive: true, force: true });
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё хорошо');
process.exit(bad ? 1 : 0);
