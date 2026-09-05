import { t as tr } from '../../web/i18n.js';
// The full player: PKCE authorisation and the Web Playback SDK.
// It differs from the built-in player in one thing, but a decisive one: this one
// presents a token rather than third-party cookies, so neither Safari's protection
// nor Chromium builds without a Spotify session of their own break it. There is no
// application secret here and there cannot be — PKCE was invented precisely so that
// a public client gets by with a client id alone.
const TOKENS = 'valey-spotify-tokens';
const VERIFIER = 'valey-spotify-verifier';
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function randomVerifier() {
  const raw = crypto.getRandomValues(new Uint8Array(48));
  return b64url(raw);
}

async function challenge(verifier) {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

export const auth = {
  clientId: '',
  tokens: null,

  // Spotify accepts as a redirect only https or the loopback at 127.0.0.1 — on
  // localhost it will refuse, so for music the office is opened at 127.0.0.1.
  redirectUri() { return `${location.origin}/callback`; },
  loopbackOk() { return location.hostname === '127.0.0.1' || location.protocol === 'https:'; },

  load(clientId) {
    this.clientId = clientId || '';
    try { this.tokens = JSON.parse(localStorage.getItem(TOKENS) || 'null'); } catch { this.tokens = null; }
    return this;
  },

  forget() {
    this.tokens = null;
    localStorage.removeItem(TOKENS);
  },

  store(data) {
    this.tokens = {
      access: data.access_token,
      refresh: data.refresh_token || (this.tokens && this.tokens.refresh) || '',
      exp: Date.now() + (data.expires_in || 3600) * 1000 - 60_000,
    };
    localStorage.setItem(TOKENS, JSON.stringify(this.tokens));
  },

  async begin() {
    const verifier = randomVerifier();
    sessionStorage.setItem(VERIFIER, verifier);
    const q = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: await challenge(verifier),
      scope: SCOPES,
    });
    location.href = 'https://accounts.spotify.com/authorize?' + q;
  },

  // The return from Spotify: the code in the address is exchanged for a token and removed from the bar at once.
  async finish() {
    const q = new URLSearchParams(location.search);
    const code = q.get('code');
    if (!code && !q.get('error')) return false;
    history.replaceState(null, '', '/');
    if (!code) throw new Error(q.get('error'));

    const verifier = sessionStorage.getItem(VERIFIER) || '';
    sessionStorage.removeItem(VERIFIER);
    const data = await post({
      grant_type: 'authorization_code', code, redirect_uri: this.redirectUri(),
      client_id: this.clientId, code_verifier: verifier,
    });
    this.store(data);
    return true;
  },

  async token() {
    if (!this.tokens) return null;
    if (Date.now() < this.tokens.exp) return this.tokens.access;
    if (!this.tokens.refresh) { this.forget(); return null; }
    try {
      this.store(await post({
        grant_type: 'refresh_token', refresh_token: this.tokens.refresh, client_id: this.clientId,
      }));
      return this.tokens.access;
    } catch {
      this.forget();
      return null;
    }
  },
};

async function post(body) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.error || tr('sp.noToken'));
  return data;
}

// ------------------------------------------------------------------- the player
export const player = {
  sdk: null, deviceId: '', state: 'off', error: '',
  track: null, playing: false, volume: 0.6, onChange: null,
  // where it was playing at the moment of the last event and when that was: between
  // events the position is counted by time, or the strip would jerk once every few seconds
  position: 0, duration: 0, at: 0,
  // volume is the knob, damp is the damping by distance. They are kept apart: the knob
  // is saved and stays what the person set, while damp lives with the course of the game
  damp: 1, applied: -1,

  async start() {
    if (this.sdk || this.state === 'starting') return;
    const token = await auth.token();
    if (!token) return;
    this.state = 'starting';
    this.tell();

    await loadSdk();
    const p = new Spotify.Player({
      name: tr('sp.deviceName'),
      volume: this.volume * this.damp,
      getOAuthToken: (cb) => auth.token().then((t) => t && cb(t)),
    });
    this.sdk = p;

    p.addListener('ready', ({ device_id }) => {
      this.deviceId = device_id; this.state = 'ready'; this.error = ''; this.tell();
    });
    p.addListener('not_ready', () => { this.deviceId = ''; this.state = 'idle'; this.tell(); });
    p.addListener('player_state_changed', (s) => {
      if (!s) return;
      this.playing = !s.paused;
      this.track = s.track_window && s.track_window.current_track;
      this.position = s.position || 0;
      this.duration = s.duration || 0;
      this.at = Date.now();
      this.tell();
    });
    // There is no premium — the SDK says so honestly, and there is no need to guess
    p.addListener('account_error', () => { this.fail(tr('sp.needPremium')); });
    p.addListener('authentication_error', () => { auth.forget(); this.fail(tr('sp.badToken')); });
    p.addListener('initialization_error', ({ message }) => this.fail(message));
    p.addListener('playback_error', ({ message }) => { this.error = message; this.tell(); });

    if (!(await p.connect())) this.fail(tr('sp.noConnect'));
  },

  fail(msg) { this.error = msg; this.state = 'failed'; this.tell(); },
  tell() { if (this.onChange) this.onChange(); },

  async api(path, init = {}) {
    const token = await auth.token();
    if (!token) return null;
    const r = await fetch('https://api.spotify.com/v1' + path, {
      ...init,
      headers: { ...(init.headers || {}), authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    });
    if (r.status === 204 || r.status === 202) return {};
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data.error && data.error.message) || tr('sp.declined'));
    return data;
  },

  async playUri(uri) {
    if (!this.deviceId) return;
    const track = uri.startsWith('spotify:track:');
    await this.api(`/me/player/play?device_id=${this.deviceId}`, {
      method: 'PUT',
      body: JSON.stringify(track ? { uris: [uri] } : { context_uri: uri }),
    });
  },

  toggle() { if (this.sdk) this.sdk.togglePlay(); },
  next() { if (this.sdk) this.sdk.nextTrack(); },
  prev() { if (this.sdk) this.sdk.previousTrack(); },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    localStorage.setItem('valey-spotify-volume', String(this.volume));
    this.apply();
    this.tell();
  },

  // The damping by distance changes every frame, and only a noticeable shift reaches the
  // SDK: there is no point sending setVolume sixty times a second.
  setDamp(d) {
    const next = Math.max(0, Math.min(1, d));
    if (Math.abs(next - this.damp) < 0.01) return;
    this.damp = next;
    this.apply();
  },

  apply() {
    if (!this.sdk) return;
    const v = this.volume * this.damp;
    if (Math.abs(v - this.applied) < 0.01) return;
    this.applied = v;
    this.sdk.setVolume(v).catch(() => {});
  },

  // The fraction played, 0..1. Between SDK events we count it ourselves by the clock.
  progress() {
    if (!this.duration) return 0;
    const at = this.position + (this.playing ? Date.now() - this.at : 0);
    return Math.max(0, Math.min(1, at / this.duration));
  },

    // the smallest cover: it has to be squeezed down to thirteen pixels anyway
  coverUrl() {
    const imgs = (this.track && this.track.album && this.track.album.images) || [];
    if (!imgs.length) return '';
    return imgs.reduce((a, b) => ((a.width || 999) < (b.width || 999) ? a : b)).url;
  },
};

let sdkPromise = null;
function loadSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.onerror = () => reject(new Error(tr('sp.noSdk')));
    document.head.appendChild(s);
  });
  return sdkPromise;
}
