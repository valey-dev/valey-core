// The office radio: a pixel receiver in the corridor with Spotify spinning inside it —
// or an internet radio station, played by the page's own <audio>.
// The Spotify player lives in one single iframe and is never recreated: the panel
// hides by being shifted off screen rather than by display:none, or the music breaks
// off mid-word.
//
// Streams arrived on 12 September 2026, from the frames on WIP «Радио: интернет-станции
// по потоку» (2045:565 on air, 2046:631 adding, 2046:4010 silent). YouTube was the first
// idea and was turned down: its API policy forbids a player that is not on the page
// (III.F.3) and separating the sound from the picture (III.I.7), which is exactly
// what a radio in the corridor is. A stream is honest radio — NTS, Dublab, SomaFM —
// and it asks for no account at all.
import { auth, player } from './spotify.js';
import { t as tr } from '../../web/i18n.js';

// The waves that come in the box hold a dictionary key, one's own hold a ready name
// entered by the person. There is nothing to translate somebody else's name with and no
// reason to, so one field will not do.
export const stationName = (s) => (s ? (s.name || (s.key ? tr(s.key) : '')) : '');

// Where a wave's sound comes from. A Spotify uri is Spotify's; anything else a station
// holds is the address of a stream.
export const kindOf = (s) => (s && /^spotify:/.test(s.uri || '') ? 'spotify' : 'stream');

// Four live stations one press away. Each was played by hand on 12 September 2026; the
// SomaFM address is the first server of its own .pls, and Radio Paradise is its mp3
// stream rather than aac, because every browser plays mp3.
export const PICKS = [
  { name: 'NTS 2', uri: 'https://stream-relay-geo.ntslive.net/stream2' },
  { name: 'Dublab', uri: 'https://dublab.out.airtime.pro/dublab_a' },
  { name: 'SomaFM · Groove Salad', uri: 'https://ice6.somafm.com/groovesalad-128-mp3' },
  { name: 'Radio Paradise', uri: 'https://stream.radioparadise.com/mp3-128' },
];

// How long a stream may take to start before the receiver says it is silent, and how
// often a playing receiver asks what the station is playing.
export const STREAM_WAIT = 10_000;
const NOW_EVERY = 20_000;

// An http stream on an https page is blocked by the browser as mixed content, and it
// says so only in the console. The office is http on localhost, but a guest comes in
// through a tunnel on https — so the receiver says it itself, before trying.
export const mixedContent = (uri, page = globalThis.location) =>
  !!page && page.protocol === 'https:' && /^http:/i.test(uri || '');

// The stream player. One <audio> for the whole office, made on first use. The knob and
// the damping by distance are kept apart, as in the Spotify player: the knob is the
// person's, the damping is the corridor's.
const saved = (k, d) => { try { return Number(localStorage.getItem(k) || d); } catch { return d; } };
export const stream = {
  audio: null, volume: saved('valey-stream-volume', 0.7), damp: 1,
  el() {
    if (!this.audio) { this.audio = new Audio(); this.audio.preload = 'none'; }
    return this.audio;
  },
  apply() { if (this.audio) this.audio.volume = Math.max(0, Math.min(1, this.volume * this.damp)); },
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('valey-stream-volume', String(this.volume)); } catch { /* private mode */ }
    this.apply();
  },
  // A live stream keeps buffering after pause; a station left behind is let go whole.
  stop() {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  },
};

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
  // A stream on the air: what the station says is playing, its format, and since when.
  // streamError is why a stream is silent — a reason key, said on the receiver's display.
  // onAir is { title, format, bitrate } — the title from the station's metadata, the rest
  // from the server's check. A guest, whom the server does not check for, sees the name.
  onAir: null, streamError: '', streamSince: 0,
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
  isStream() { return kindOf(this.station()) === 'stream'; },

  // How loudly the radio is heard from where the player stands. Only our own player can
  // control the volume: the built-in one has no such API.
  listenFrom(dist) {
    const t = Math.max(0, Math.min(1, (dist - NEAR) / (FAR - NEAR)));
    const near = 1 - t;
    const damp = FLOOR + (1 - FLOOR) * near * near;
    // A stream is our own <audio>, so the corridor quiets it too — without any account.
    if (this.isStream()) { stream.damp = damp; stream.apply(); return; }
    if (!this.sdk) return;
    player.setDamp(damp);
  },

  // How much of the track has played, 0..1 — for the strip on the body. With our own
  // player the time is counted by the clock, the built-in one sends it itself in
  // playback_update.
  progress() {
    if (this.isStream()) return 0;   // a live stream has no length to be through
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
    // A stream has no cover to fetch: the little window stays wooden glass.
    if (!src && kindOf(st) === 'stream') {
      this.coverKey = key; this.cover = null; this.coverBig = null; this.coverFor = '';
      if (this.onChange) this.onChange();
      return;
    }
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
    // A stream on the air is not the Spotify player's to describe: its events would
    // switch the receiver's lamp off under music that is still playing.
    if (live && !this.isStream()) {
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
    // A stream plays without Spotify; its iframe waits until a Spotify wave is tuned.
    if (this.isStream()) return;
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
    if (this.isStream()) { this.playing ? this.streamPause() : this.streamPlay(); return true; }
    if (this.sdk) { player.toggle(); return true; }
    if (!this.controller) return false;
    this.controller.togglePlay();
    return true;
  },

  play() { if (this.controller) this.controller.play(); },
  pause() { if (this.controller) { this.controller.pause(); this.playing = false; } },

  // A stream is started on a gesture and watched: if it has not begun playing within
  // STREAM_WAIT it is called silent with a reason rather than left spinning.
  streamPlay() {
    const st = this.station();
    if (!st) return;
    if (mixedContent(st.uri)) { this.streamFail('mixed'); return; }
    const a = stream.el();
    if (!a.dataset.bound) {
      a.dataset.bound = '1';
      a.addEventListener('playing', () => {
        clearTimeout(this.streamTimer);
        this.playing = true; this.streamError = '';
        if (!this.streamSince) this.streamSince = Date.now();
        if (this.onChange) this.onChange();
      });
      a.addEventListener('pause', () => { this.playing = false; this.nowStop(); if (this.onChange) this.onChange(); });
      // A live stream does not end; one that did was closed by the station.
      a.addEventListener('ended', () => this.streamFail('silent'));
      a.addEventListener('error', () => {
        if (!a.getAttribute('src')) return;   // our own stop(), not the station's
        clearTimeout(this.streamTimer);
        const code = a.error ? a.error.code : 0;
        // MEDIA_ERR_SRC_NOT_SUPPORTED is a format the browser does not play — HLS above all.
        this.streamFail(code === 4 ? (/\.m3u8(\?|$)/i.test(a.src) ? 'hls' : 'format') : 'silent');
      });
    }
    if (a.getAttribute('src') !== st.uri) { a.src = st.uri; this.streamSince = 0; }
    stream.apply();
    this.streamError = '';
    clearTimeout(this.streamTimer);
    this.streamTimer = setTimeout(() => { if (!this.playing) this.streamFail('timeout'); }, STREAM_WAIT);
    a.play().catch((e) => { if (e && e.name === 'NotAllowedError') this.streamFail('gesture'); });
    this.checkStream(st.uri);
    this.nowStart(st.uri);
    if (this.onChange) this.onChange();
  },

  streamPause() { clearTimeout(this.streamTimer); this.nowStop(); if (stream.audio) stream.audio.pause(); },

  streamFail(reason, status = 0) {
    clearTimeout(this.streamTimer);
    this.nowStop();
    stream.stop();
    this.playing = false; this.streamError = reason; this.streamStatus = status; this.streamSince = 0;
    if (this.onChange) this.onChange();
  },

  // The server's check on switching on: it names the reason a stream will not play —
  // HLS, a closed stream, a page instead of sound — before the ten seconds run out, and
  // it brings the format and bitrate for the display. A guest gets 403 and simply
  // listens: <audio> will say soon enough whether there is anything to hear.
  async checkStream(uri) {
    try {
      const r = await fetch('/api/radio/probe?url=' + encodeURIComponent(uri));
      if (!r.ok) return;
      const out = await r.json();
      if (!this.station() || this.station().uri !== uri) return;   // tuned away meanwhile
      if (!out.ok) {
        // Timeout and unreachable are left to the player: the server's network is not
        // the listener's, and a station that is slow for one may be quick for the other.
        if (out.reason !== 'timeout' && out.reason !== 'unreachable') this.streamFail(out.reason, out.status || 0);
        return;
      }
      this.onAir = { ...(this.onAir || {}), format: out.format, bitrate: out.bitrate };
      if (this.onChange) this.onChange();
    } catch { /* no answer is not a verdict */ }
  },

  // What is playing, asked of the server every twenty seconds while the stream plays.
  nowStart(uri) {
    this.nowStop();
    const ask = async () => {
      try {
        const r = await fetch('/api/radio/now?url=' + encodeURIComponent(uri));
        if (!r.ok) { if (r.status === 403) this.nowStop(); return; }
        const { title } = await r.json();
        if (!this.station() || this.station().uri !== uri) return;
        this.onAir = { ...(this.onAir || {}), title: title || '' };
        if (this.onChange) this.onChange();
      } catch { /* the next round will ask again */ }
    };
    ask();
    this.nowTimer = setInterval(ask, NOW_EVERY);
  },

  nowStop() { clearInterval(this.nowTimer); this.nowTimer = null; },

  // `was` is the wave being left. It is the current one, except when that wave has just
  // been taken out of the list — then remove() names it, since the list no longer can.
  tune(i, was = this.station()) {
    if (!this.stations.length) return;
    const wasPlaying = this.playing;
    this.current = (i + this.stations.length) % this.stations.length;
    this.save();
    const st = this.station();
    // Leaving a stream lets it go; the next wave starts from its own silence.
    if (kindOf(was) === 'stream') { clearTimeout(this.streamTimer); this.nowStop(); stream.stop(); }
    this.onAir = null; this.streamError = ''; this.streamSince = 0;
    if (kindOf(st) === 'stream') {
      // Spotify falls silent: two sources at once is noise, not radio.
      if (this.sdk && player.sdk && player.playing) player.sdk.pause();
      else if (this.controller) this.controller.pause();
      this.playing = false;
      if (wasPlaying) this.streamPlay();
      this.loadCover();
      if (this.onChange) this.onChange();
      return;
    }
    // A Spotify wave after a stream: the iframe may never have been built.
    if (!this.sdk && !this.controller && this.host) this.attach(this.host);
    if (this.sdk && st) {
      player.playUri(st.uri).catch((e) => { this.error = e.message; });
      this.loadCover(player.coverUrl() || null);
      if (this.onChange) this.onChange();
      return;
    }
    if (this.controller && st) {
      this.controller.loadUri(st.uri);
      // loadUri stops the playback — if the radio was playing, we carry on on the new wave
      if (wasPlaying) setTimeout(() => this.controller && this.controller.play(), 400);
    }
    this.loadCover();
    if (this.onChange) this.onChange();
  },

  // A stream caught by hand starts playing at once: it was just checked, and the press
  // that caught it is the gesture the browser wants before it lets sound out.
  add(name, uri) {
    const was = this.playing;   // then tune() has already carried the music over
    this.stations.push({ name, uri });
    this.save();
    this.tune(this.stations.length - 1);
    if (this.isStream() && !was) this.streamPlay();
  },

  // Taking a wave out of the list retunes only when it was the one playing. Until
  // 13 September 2026 every ✕ ended in tune(current): a stream broke off for a second,
  // and a Spotify playlist started again from its first track — for the removal of a
  // wave nobody was listening to.
  remove(i) {
    if (this.stations.length <= 1 || i < 0 || i >= this.stations.length) return;
    const gone = this.stations[i];
    const wasCurrent = i === this.current;
    this.stations.splice(i, 1);
    if (i < this.current) this.current -= 1;   // the same wave, one row higher
    else if (this.current >= this.stations.length) this.current = this.stations.length - 1;
    this.save();
    if (wasCurrent) this.tune(this.current, gone);
    else if (this.onChange) this.onChange();
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

// What a pasted line is: a Spotify link, the address of a stream, or neither. A stream
// is any http(s) address — what it actually carries is for the server's check to say.
export function parseWave(raw) {
  const spotify = toUri(raw);
  if (spotify) return { kind: 'spotify', uri: spotify };
  const s = (raw || '').trim();
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return { kind: 'stream', uri: u.href };
}

// A link from "share" in Spotify -> the uri the built-in player understands.
export function toUri(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  if (/^spotify:(playlist|album|track|artist|show|episode):[A-Za-z0-9]+$/.test(s)) return s;
  const m = s.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}
