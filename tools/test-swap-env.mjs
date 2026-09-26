// node tools/test-swap-env.mjs — what the supervisor tells a worker stays in it.
//
// On 13 September 2026 a stand started from an agent session came up on port
// 5177, the office's own, and died on EADDRINUSE. The session had been started
// by the office — a message sent into a live chat runs `claude -p` with the
// office's environment — and the office was a worker after an update, so the
// session carried VALEY_PORT_FIXED=5177 and VALEY_HANDOFF_WAIT=1. Everything
// it started read them as its own. Here a process is started with exactly that
// environment and must neither take the port nor pass the variables on.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', JSON.stringify(got)); }
};

const swap = new URL('../server/swap.js', import.meta.url).href;
const leaked = { VALEY_WORKER: '1', VALEY_PORT_FIXED: '5177', VALEY_HOST_FIXED: '0.0.0.0', VALEY_HANDOFF_WAIT: '1' };
const probe = `
const s = await import(${JSON.stringify(swap)});
const { execFileSync } = await import('node:child_process');
const child = execFileSync(process.execPath, ['-e', 'console.log(JSON.stringify(Object.keys(process.env).filter((k) => k in ${JSON.stringify(leaked)})))'], { encoding: 'utf8' }).trim();
console.log(JSON.stringify({ worker: s.isWorker, fixed: s.fixedAddress(), own: s.SWAP_ENV.filter((k) => k in process.env), child: JSON.parse(child) }));`;
const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', probe], {
  encoding: 'utf8', env: { ...process.env, ...leaked }, cwd: fileURLToPath(new URL('..', import.meta.url)),
}));

ok('a process that is not a cluster worker is not a worker, whatever it was told', out.worker === false, out);
ok('and does not take the port a supervisor would have held for it', out.fixed === null, out);
ok('the variables are gone from its environment once read', out.own.length === 0, out);
ok('so nothing it starts — a `claude -p` run — inherits them', out.child.length === 0, out);

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
