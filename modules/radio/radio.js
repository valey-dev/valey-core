// The office radio: a pixel receiver in the corridor with Spotify spinning inside it.
// The player lives in one single iframe and is never recreated: the panel hides by
// being shifted off screen rather than by display:none, or the music breaks off
// mid-word.
import { auth, player } from './spotify.js';
import { t as tr } from '../../web/i18n.js';

// The waves that come in the box hold a dictionary key, one's own hold a ready name
// entered by the person. There is nothing to translate somebody else's name with and no
// reason to, so one field will not do.
export const stationName = (s) => (s ? (s.name || (s.key ? tr(s.key) : '')) : '');

const KEY = 'valey-radio';

// The starting stations are ordinary Spotify links. Any can be removed, any added.
const PRESETS = [
  { key: 'sp.lofi', uri: 'spotify:playlist:37i9dQZF1DWWQRwui0ExPn' },
  { key: 'sp.piano', uri: 'spotify:playlist:37i9dQZF1DX4sWSpwq3LiO' },
];

// Audibility: right by the receiver it is loud, further along the corridor quieter, but
// not down to zero — the radio has to stay the background of the office rather than
// switch off around the corner.
const NEAR = 70, FAR = 430, FLOOR = 0.12;

const COVER = 13;   // the side of the cover on the body, in game pixels
const COVER_BIG = 40;   // and in the open panel, where there is more room and more detail is visible

export const radio = {
  stations: [], current: 0, playing: false, ready: false, error: '',
  position: 0, duration: 0, controller: null, host: null, onChange: null,
  // coverKey is whose cover was requested, coverFor whose lies in the canvases. Keeping
  // them apart is essential: while the picture is on its way the previous one stays drawn,
  // and the panel has to understand that by what is drawn rather than by what was ordered.
  cover: null, coverBig: null, coverKey: '', coverFor: '', drm: 'unknown',
  sdk: false,          // the full player is playing, not the built-in one
  needsLoopback: false, // the office is open at localhost, and Spotify will only allow 127.0.0.1

  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* spoiled — we will start it again */ }
    this.stations = (saved && Array.isArray(saved.stations) && saved.stations.length)
      ? saved.stations : structuredClone(PRESETS);
    this.current = Math.min(this.stations.length - 1, Math.max(0, (saved && saved.current) | 0));
    this.loadCover();   // the body knows its cover before anyone walks up to it
    return this;
  },

  save() {
    localStorage.setItem(KEY, JSON.stringify({ stations: this.stations, current: this.current }));
  },

  station() { return this.stations[this.current] || null; },

  // How loudly the radio is heard from where the player stands. Only our own player can
  // control the volume: the built-in one has no such API.
  listenFrom(dist) {
    if (!this.sdk) return;
    const t = Math.max(0, Math.min(1, (dist - NEAR) / (FAR - NEAR)));
    const near = 1 - t;
    player.setDamp(FLOOR + (1 - FLOOR) * near * near);
  },

  // How much of the track has played, 0..1 — for the strip on the body. With our own
  // player the time is counted by the clock, the built-in one sends it itself in
  // playback_update.
  progress() {
    if (this.sdk) return player.progress();
    return this.duration ? Math.max(0, Math.min(1, this.position / this.duration)) : 0;
  },

  // Whether this browser has decryption of protected content. Without it Spotify gives
  // out previews only, and it is better to find that out at once than to puzzle over
  // tracks breaking off: Chromium builds without Widevine look like ordinary Chrome from
  // outside, but will never get the full music.
  async probeDrm() {
    if (this.drm !== 'unknown') return this.drm;
    this.drm = 'checking';
    const config = [{
      initDataTypes: ['cenc'],
      audioCapabilities: [{ contentType: 'audio/mp4;codecs="mp4a.40.2"' }],
    }];
    const works = async (system) => {
      try { await navigator.requestMediaKeySystemAccess(system, config); return true; }
      catch { return false; }
    };
    const ok = !!navigator.requestMediaKeySystemAccess
      && (await works('com.widevine.alpha')
        || await works('com.apple.fps')          // Safari, FairPlay
        || await works('com.microsoft.playready'));
    this.drm = ok ? 'ok' : 'none';
    if (this.onChange) this.onChange();
    return this.drm;
  },

  // The cover is brought by the server at an address of its own, so it can honestly be
  // taken apart into pixels: we squeeze it to 13x13 and coarsen the colour, so that it sits
  // next to the scale rather than looking like a photograph glued to a wooden body.
  async loadCover(src = null) {
    // the full player has a cover of its own, of the track; the built-in one only of the wave
    const st = this.station();
    const key = src || (st ? st.uri : '');
    if (!key || this.coverKey === key) return;
    this.coverKey = key;
    // we remove the old cover at once: an empty little window for a couple of moments is
    // better than somebody else's picture under an already playing track
    this.cover = null; this.coverBig = null; this.coverFor = '';
    if (this.onChange) this.onChange();

    const where = src ? '/api/cover?img=' : '/api/cover?uri=';
    try {
      const r = await fetch(where + encodeURIComponent(key));
      if (!r.ok || this.coverKey !== key) return;
      const bmp = await createImageBitmap(await r.blob());
      if (this.coverKey !== key) return;      // the picture was changed meanwhile

      this.cover = pixelate(bmp, COVER);
      this.coverBig = pixelate(bmp, COVER_BIG);
      this.coverFor = key;
      bmp.close();
      if (this.onChange) this.onChange();
    } catch { /* no cover — the body simply stays wooden */ }
  },

  // Connecting to your own Spotify application. Until there is one, the radio works as it
  // worked — through the built-in player with its previews.
  async connect(clientId) {
    auth.load(clientId);
    this.needsLoopback = !!clientId && !auth.loopbackOk();
    player.onChange = () => this.syncPlayer();
    player.volume = Number(localStorage.getItem('valey-spotify-volume') || 0.6);
    if (!clientId) return;
    try {
      if (await auth.finish()) { /* we have just come back from Spotify */ }
    } catch (e) {
      this.error = tr('sp.refused', { err: e.message });
    }
    if (auth.tokens) player.start();
    if (this.onChange) this.onChange();
  },

  async signIn() {
    if (!auth.clientId) return;
    await auth.begin();
  },

  signOut() {
    auth.forget();
    this.sdk = false;
    if (this.onChange) this.onChange();
  },

  // The full player has become the main one: from this moment the volume, the track and
  // the cover are taken from it, and the built-in one keeps quiet.
  syncPlayer() {
    const live = player.state === 'ready';
    if (live && !this.sdk && this.controller) this.controller.pause();
    this.sdk = live;
    if (live) {
      this.playing = player.playing;
      const url = player.coverUrl();
      if (url) this.loadCover(url);
    }
    if (this.onChange) this.onChange();
  },

  // The Spotify script is pulled once and only when the player first walked up to the
  // radio. The player substitutes itself for the element it is given, so it gets a target
  // of its own inside the frame — the frame itself has to outlive that substitution.
  attach(host) {
    this.host = host;
    if (this.sdk || this.controller || this.pending) return;
    const st = this.station();
    if (!st) return;
    this.pending = true;

    const build = (IFrameAPI) => {
      IFrameAPI.createController(host, { uri: st.uri, width: '100%', height: 152 }, (c) => {
        this.controller = c;
        this.ready = true;
        this.pending = false;
        this.error = '';   // we got through — the previous complaint about the network is no longer ours
        c.addListener('playback_update', (e) => {
          const d = e.data || {};
          this.playing = !d.isPaused;
          this.position = d.position || 0;
          this.duration = d.duration || 0;
          if (this.onChange) this.onChange();
        });
        if (this.onChange) this.onChange();
      });
    };

    this.loadCover();

    if (window.__spotifyIframeApi) return build(window.__spotifyIframeApi);
    window.onSpotifyIframeApiReady = (api) => { window.__spotifyIframeApi = api; build(api); };
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.onerror = () => {
      this.pending = false;
      this.error = tr('sp.silent');
      if (this.onChange) this.onChange();
    };
    document.head.appendChild(s);
  },

  toggle() {
    if (this.sdk) { player.toggle(); return true; }
    if (!this.controller) return false;
    this.controller.togglePlay();
    return true;
  },

  play() { if (this.controller) this.controller.play(); },
  pause() { if (this.controller) { this.controller.pause(); this.playing = false; } },

  tune(i) {
    if (!this.stations.length) return;
    this.current = (i + this.stations.length) % this.stations.length;
    this.save();
    const st = this.station();
    if (this.sdk && st) {
      player.playUri(st.uri).catch((e) => { this.error = e.message; });
      this.loadCover(player.coverUrl() || null);
      if (this.onChange) this.onChange();
      return;
    }
    if (this.controller && st) {
      this.controller.loadUri(st.uri);
      // loadUri stops the playback — if the radio was playing, we carry on on the new wave
      if (this.playing) setTimeout(() => this.controller && this.controller.play(), 400);
    }
    this.loadCover();
    if (this.onChange) this.onChange();
  },

  add(name, uri) {
    this.stations.push({ name, uri });
    this.save();
    this.tune(this.stations.length - 1);
  },

  remove(i) {
    if (this.stations.length <= 1) return;
    this.stations.splice(i, 1);
    if (this.current >= this.stations.length) this.current = this.stations.length - 1;
    this.save();
    this.tune(this.current);
  },
};

// Squeeze to the required side and coarsen the colour: smoothing on a reduction works as
// averaging and gives honest pixels, while six steps per channel keep the cover from
// looking like a photograph glued to a wooden body.
function pixelate(bmp, side) {
  const c = document.createElement('canvas');
  c.width = c.height = side;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0, side, side);
  const img = x.getImageData(0, 0, side, side);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] / 51) * 51;
  }
  x.putImageData(img, 0, 0);
  return c;
}

// A link from "share" in Spotify -> the uri the built-in player understands.
export function toUri(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  if (/^spotify:(playlist|album|track|artist|show|episode):[A-Za-z0-9]+$/.test(s)) return s;
  const m = s.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}
