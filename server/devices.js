// Owner devices: a phone, a tablet or an Xbox that became the owner because the
// owner said yes on this machine.
//
// Until 13 September 2026 there were two owners and no third: this machine in
// private mode, and whoever held the owner token. A phone that walked in with
// the network code could watch everything and answer nothing — the feed's
// «Ответить в офисе» led to the office's title screen. The owner's word the
// same day: «с любого гаджета, хоть с иксбокса, следить и корректировать в пару
// кликов» — with his knowledge. So it works like pairing a Bluetooth device:
// the device asks, this machine shows the same four digits the device shows,
// and the owner says yes or no.
//
// Frames: WIP «Owner devices: pair a phone or an Xbox with a code» (#devices).
//
// Four rules, each a line below:
//   - asked only from our own network: never through a tunnel or a proxy;
//   - answered only by this machine or the owner token, never by a paired
//     device — otherwise one device lets in the next and the chain leaves the
//     owner's sight;
//   - the device's token is kept as a hash, and it lapses after 30 days unused;
//   - a request lives two minutes.
import crypto from 'node:crypto';
import { proxied } from './network.js';

export const PAIR_TTL = 2 * 60 * 1000;
export const DEVICE_TTL = 30 * 24 * 60 * 60 * 1000;
// lastSeen is written to the settings file, which every office on this machine
// shares; once in ten minutes per device is enough to say «был 5 мин назад»
// honestly and not enough to make the file a hot spot.
export const SEEN_EVERY = 10 * 60 * 1000;

// Our own network, by the address the socket saw. A request that came through a
// middleman is not ours whatever the address says: a tunnel connects over
// loopback, and without this its guest would pair from the internet.
export function isLan(req) {
  if (proxied(req)) return false;
  const raw = (req.socket && req.socket.remoteAddress) || '';
  const a = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (a === '127.0.0.1' || a === '::1') return true;
  const m = a.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (m) {
    const [x, y] = [Number(m[1]), Number(m[2])];
    return x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254);
  }
  const low = a.toLowerCase();
  return low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd');
}

export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// Four digits, as on a Bluetooth screen: enough to tell two requests apart and
// short enough to compare at a glance. It is not a secret — the yes is.
export const newCode = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

// A name the owner recognises in the list, from the device's own user agent.
// The page may send a better one; this is the fallback and the default.
export function deviceName(ua = '') {
  const s = String(ua);
  const kind = /Xbox/i.test(s) ? 'Xbox'
    : /iPhone/i.test(s) ? 'iPhone'
    : /iPad/i.test(s) ? 'iPad'
    : /Android/i.test(s) ? (/Mobile/i.test(s) ? 'Android' : 'Android tablet')
    : /Macintosh/i.test(s) ? 'Mac'
    : /Windows/i.test(s) ? 'Windows'
    : /Linux/i.test(s) ? 'Linux'
    : 'device';
  const browser = /Edg\//.test(s) ? 'Edge'
    : /Firefox\//.test(s) ? 'Firefox'
    : /Chrome\//.test(s) ? 'Chrome'
    : /Safari\//.test(s) ? 'Safari'
    : '';
  return browser ? `${kind} · ${browser}` : kind;
}

/**
 * The paired device a token belongs to, or null. A lapsed device is null too:
 * thirty days unused is the same as never paired, and the list says so.
 */
export function deviceOf(devices, token, now = Date.now()) {
  if (!token) return null;
  const h = Buffer.from(hashToken(token));
  for (const d of devices || []) {
    const mine = Buffer.from(String(d.hash || ''));
    if (mine.length !== h.length || !crypto.timingSafeEqual(mine, h)) continue;
    return now - (d.lastSeen || d.pairedAt || 0) > DEVICE_TTL ? null : d;
  }
  return null;
}

// What the owner's page sees of a device: never the hash.
export const shownDevice = (d, now = Date.now()) => ({
  id: d.id, name: d.name, pairedAt: d.pairedAt, lastSeen: d.lastSeen || d.pairedAt,
  lapsed: now - (d.lastSeen || d.pairedAt || 0) > DEVICE_TTL,
});

/**
 * Requests in flight. In memory and only there: a request that survived a
 * restart would ask a yes the owner gave to a different moment.
 */
export class Pairings {
  constructor() { this.map = new Map(); }

  sweep(now = Date.now()) {
    for (const [id, p] of this.map) {
      if (p.state === 'pending' && now - p.at > PAIR_TTL) p.state = 'expired';
      // Anything answered is kept long enough for the device to read the
      // answer on its next poll, and not a minute more.
      if (now - p.at > PAIR_TTL + 60 * 1000) this.map.delete(id);
    }
  }

  // One request per address: asking again replaces the first, so pressing the
  // button twice does not put two cards in front of the owner.
  ask({ ip, name }, now = Date.now()) {
    this.sweep(now);
    for (const [id, p] of this.map) if (p.ip === ip && p.state === 'pending') this.map.delete(id);
    const p = { id: crypto.randomUUID().slice(0, 8), code: newCode(), ip, name, at: now, state: 'pending', token: null };
    this.map.set(p.id, p);
    return p;
  }

  get(id, now = Date.now()) { this.sweep(now); return this.map.get(id) || null; }

  // The yes makes the token; the device collects it once and it is gone from
  // here. Returns the record to store, or null for a no or a stale request.
  answer(id, yes, now = Date.now()) {
    const p = this.get(id, now);
    if (!p || p.state !== 'pending') return null;
    if (!yes) { p.state = 'refused'; return null; }
    p.state = 'granted';
    p.token = crypto.randomBytes(32).toString('base64url');
    return { id: crypto.randomUUID().slice(0, 8), name: p.name, hash: hashToken(p.token), pairedAt: now, lastSeen: now };
  }

  // What the device reads while it waits. The token leaves exactly once.
  collect(id, now = Date.now()) {
    const p = this.get(id, now);
    if (!p) return { state: 'expired' };
    if (p.state === 'granted' && p.token) {
      const token = p.token;
      p.token = null;
      p.state = 'collected';
      return { state: 'granted', token };
    }
    return { state: p.state === 'collected' ? 'granted' : p.state };
  }

  pending(now = Date.now()) {
    this.sweep(now);
    return [...this.map.values()].filter((p) => p.state === 'pending')
      .map((p) => ({ id: p.id, code: p.code, ip: p.ip, name: p.name, at: p.at }));
  }
}
