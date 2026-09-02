// Офисное радио: пиксельный приёмник в коридоре, внутри которого крутится Spotify.
// Плеер живёт в одном-единственном iframe и не пересоздаётся: панель прячется
// сдвигом за экран, а не display:none, иначе музыка обрывается на полуслове.
import { auth, player } from './spotify.js';
import { t as tr } from '../../web/i18n.js';

// Волны из коробки хранят ключ словаря, свои — готовое имя, введённое человеком.
// Переводить чужое имя нечем и незачем, поэтому одно поле не годится.
export const stationName = (s) => (s ? (s.name || (s.key ? tr(s.key) : '')) : '');

const KEY = 'valey-radio';

// Стартовые станции — обычные ссылки Spotify. Любую можно убрать, любую добавить.
const PRESETS = [
  { key: 'sp.lofi', uri: 'spotify:playlist:37i9dQZF1DWWQRwui0ExPn' },
  { key: 'sp.piano', uri: 'spotify:playlist:37i9dQZF1DX4sWSpwq3LiO' },
];

// Слышимость: вплотную к приёмнику громко, дальше по коридору тише, но не в ноль —
// радио должно оставаться фоном офиса, а не выключаться за углом.
const NEAR = 70, FAR = 430, FLOOR = 0.12;

const COVER = 13;   // сторона обложки на корпусе, в пикселях игры
const COVER_BIG = 40;   // и в открытой панели, где места больше и деталей видно больше

export const radio = {
  stations: [], current: 0, playing: false, ready: false, error: '',
  position: 0, duration: 0, controller: null, host: null, onChange: null,
  // coverKey — чью обложку запросили, coverFor — чья лежит в canvas'ах. Разводить их
  // обязательно: пока картинка едет, нарисованной остаётся предыдущая, и панель должна
  // понимать это по тому, что нарисовано, а не по тому, что заказано.
  cover: null, coverBig: null, coverKey: '', coverFor: '', drm: 'unknown',
  sdk: false,          // играет полноценный плеер, а не встроенный
  needsLoopback: false, // офис открыт на localhost, а Spotify пустит только 127.0.0.1

  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* испорчено — заведём заново */ }
    this.stations = (saved && Array.isArray(saved.stations) && saved.stations.length)
      ? saved.stations : structuredClone(PRESETS);
    this.current = Math.min(this.stations.length - 1, Math.max(0, (saved && saved.current) | 0));
    this.loadCover();   // корпус знает свою обложку ещё до того, как к нему подошли
    return this;
  },

  save() {
    localStorage.setItem(KEY, JSON.stringify({ stations: this.stations, current: this.current }));
  },

  station() { return this.stations[this.current] || null; },

  // Насколько громко радио слышно с того места, где стоит игрок. Управлять
  // громкостью умеет только свой плеер: у встроенного такого API нет.
  listenFrom(dist) {
    if (!this.sdk) return;
    const t = Math.max(0, Math.min(1, (dist - NEAR) / (FAR - NEAR)));
    const near = 1 - t;
    player.setDamp(FLOOR + (1 - FLOOR) * near * near);
  },

  // Сколько трека отыграно, 0..1 — для полоски на корпусе. У своего плеера время
  // досчитывается по часам, встроенный присылает его сам в playback_update.
  progress() {
    if (this.sdk) return player.progress();
    return this.duration ? Math.max(0, Math.min(1, this.position / this.duration)) : 0;
  },

  // Есть ли в этом браузере расшифровка защищённого контента. Без неё Spotify
  // отдаёт только превью, и разбираться в этом лучше сразу, а не гадать над
  // обрывающимися треками: сборки Chromium без Widevine выглядят снаружи как
  // обычный Chrome, но полную музыку никогда не получат.
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

  // Обложку сервер приносит своим адресом, поэтому её можно честно разобрать на
  // пиксели: ужимаем до 13x13 и загрубляем цвет, чтобы она села рядом со шкалой,
  // а не выглядела фотографией, приклеенной к деревянному корпусу.
  async loadCover(src = null) {
    // у полноценного плеера обложка своя, у трека; у встроенного — только у волны
    const st = this.station();
    const key = src || (st ? st.uri : '');
    if (!key || this.coverKey === key) return;
    this.coverKey = key;
    // старую обложку убираем сразу: лучше пустое окошко на пару мгновений, чем
    // чужая картинка под уже играющий трек
    this.cover = null; this.coverBig = null; this.coverFor = '';
    if (this.onChange) this.onChange();

    const where = src ? '/api/cover?img=' : '/api/cover?uri=';
    try {
      const r = await fetch(where + encodeURIComponent(key));
      if (!r.ok || this.coverKey !== key) return;
      const bmp = await createImageBitmap(await r.blob());
      if (this.coverKey !== key) return;      // картинку успели сменить

      this.cover = pixelate(bmp, COVER);
      this.coverBig = pixelate(bmp, COVER_BIG);
      this.coverFor = key;
      bmp.close();
      if (this.onChange) this.onChange();
    } catch { /* нет обложки — корпус просто останется деревянным */ }
  },

  // Подключение к своему приложению Spotify. Пока его нет, радио работает как
  // работало — через встроенный плеер с его превью.
  async connect(clientId) {
    auth.load(clientId);
    this.needsLoopback = !!clientId && !auth.loopbackOk();
    player.onChange = () => this.syncPlayer();
    player.volume = Number(localStorage.getItem('valey-spotify-volume') || 0.6);
    if (!clientId) return;
    try {
      if (await auth.finish()) { /* только что вернулись из Spotify */ }
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

  // Полноценный плеер стал главным: с этого момента громкость, трек и обложка
  // берутся у него, а встроенный молчит.
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

  // Скрипт Spotify тянется один раз и только когда игрок впервые подошёл к радио.
  // Плеер подменяет собой переданный элемент, поэтому ему дают отдельную мишень
  // внутри рамы — сама рама должна пережить эту подмену.
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
        this.error = '';   // достучались — прошлая жалоба на сеть больше не про нас
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
      // loadUri останавливает воспроизведение — если радио играло, продолжаем на новой волне
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

// Ужать до нужной стороны и загрубить цвет: сглаживание при уменьшении работает как
// усреднение и даёт честные пиксели, а шесть ступеней на канал не дают обложке
// выглядеть фотографией, приклеенной к деревянному корпусу.
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

// Ссылка из «поделиться» в Spotify -> uri, который понимает встроенный плеер.
export function toUri(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  if (/^spotify:(playlist|album|track|artist|show|episode):[A-Za-z0-9]+$/.test(s)) return s;
  const m = s.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}
