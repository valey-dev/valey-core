// The radio with the receiver by the entrance is a module. A free one: the tier in
// module.json says "core", and it is the first module that is not about money. The seam
// is checked by exactly that: it is about structure, not about the till.
//
// What was needed from the core beyond the old points — four new ones, and all of them
// shared: `tick` (damp the office and lead the volume by distance), `hud` (the state
// strip in the header), `lang` (repaint its own panel on a change of language) and
// `help` (its own key in the hint line at the bottom). The first two had been declared
// in the loader and were never called once — that is, a module standing in them would
// silently do nothing.
import { pxText } from '../../web/office.js';
import { t as tr } from '../../web/i18n.js';
import { toast, renderHud, focusRing } from '../../web/ui.js';
import { sound } from '../../web/sound.js';
import { MARGIN } from '../../web/layout.js';
import { radio, toUri, stationName } from './radio.js';
import { auth, player } from './spotify.js';

const $ = (s) => document.querySelector(s);
import { esc } from '../../web/esc.js';
const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };

// A module's panel is an element of its own: there must be no hole for it in the core's markup.
const el = { radio: null };
function ensurePanel() {
  if (document.querySelector('#radio')) return;
  const d = document.createElement('div');
  d.id = 'radio';
  document.body.appendChild(d);
}

// The state of the office arrives at the points; we hold the reference so that the panel
// knows about the settings and the body about the volume.
let S = null;
let prop = null;

const nowPlaying = () => (radio.sdk && player.track ? player.track.name : stationName(radio.station()) || '');

const DICT = {
  ru: {
    // The caption on its cap in the keys panel: a module's key is the module's business
    'radio.hint': 'радио',
    'hud.radioTitle': 'радио — R',
    'hint.radioOn': '[ ПРОБЕЛ ] радио играет',
    'hint.radio': '[ ПРОБЕЛ ] включить радио',
    'sp.lofi': 'lofi для работы',
    'sp.piano': 'тихое пианино',
    'sp.refused': 'Spotify не пустил: {err}',
    'sp.silent': 'Spotify не отвечает — нет сети или его блокируют.',
    'sp.noToken': 'не удалось получить токен',
    'sp.deviceName': 'Valey — офис',
    'sp.needPremium': 'Для этого плеера нужен Spotify Premium.',
    'sp.badToken': 'Spotify не принял токен — нужно подключиться заново.',
    'sp.noConnect': 'Плеер не подключился.',
    'sp.declined': 'Spotify отказал',
    'sp.noSdk': 'не загрузился Web Playback SDK',
    'radio.title': 'Офисное радио',
    'radio.prevWave': 'предыдущая волна',
    'radio.nextWave': 'следующая волна',
    'radio.prevTrack': 'предыдущий трек',
    'radio.nextTrack': 'следующий трек',
    'radio.play': '▶ включить',
    'radio.pause': '❚❚ пауза',
    'radio.volume': 'громкость',
    'radio.ownWave': 'своя волна',
    'radio.uriHint': 'ссылка из Spotify: плейлист, альбом или трек',
    'radio.waking': 'Плеер ещё просыпается…',
    'radio.notSpotify': 'Не похоже на ссылку Spotify',
    'radio.caught': 'Волна поймана',
    'radio.silence': 'тишина',
    'radio.waiting': 'жду трек…',
    'radio.remove': 'убрать',
    'radio.loopback': 'Открой офис по адресу <a href="http://127.0.0.1:{port}/">127.0.0.1:{port}</a> — Spotify пускает обратно только на него, на localhost он откажет.',
    'radio.setup': 'Чтобы играли треки целиком, заведи приложение на <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com</a>, впиши в него Redirect URI <code>{uri}</code> и вставь сюда Client ID.',
    'radio.save': 'сохранить',
    'radio.yours': '● играет твой Spotify',
    'radio.signOut': 'отключить',
    'radio.connecting': 'подключаюсь…',
    'radio.connect': 'подключить Spotify',
    'radio.changeApp': 'сменить приложение',
    'radio.badId': 'Client ID выглядит не так',
    'radio.appSaved': 'Приложение записано — теперь «подключить Spotify»',
    'radio.noteOwn': 'Играет твой Spotify: треки целиком, громкость ручкой. Когда отходишь по коридору, радио затихает; пока оно играет, офис звучит тише.',
    'radio.noteDrm': 'В этом браузере нет расшифровки защищённого контента (Widevine), поэтому Spotify сможет отдавать только превью. Полные треки — в браузере с DRM: Chrome, Safari, Firefox.',
    'radio.notePreview': 'Встроенный плеер отдаёт превью — короткие отрывки, отсюда обрывы. Треки целиком играют, только если подключить свой Spotify кнопкой выше.',
    'radio.noteEmbed': 'Играет прямо в этой вкладке. Пока радио играет, офис звучит тише.',
  },
  en: {
    'radio.hint': 'radio',
    'hud.radioTitle': 'radio — R',
    'hint.radioOn': '[ SPACE ] radio is playing',
    'hint.radio': '[ SPACE ] switch the radio on',
    'sp.lofi': 'lofi for work',
    'sp.piano': 'quiet piano',
    'sp.refused': 'Spotify would not let us in: {err}',
    'sp.silent': 'Spotify is not answering — no network, or it is blocked.',
    'sp.noToken': 'could not get a token',
    'sp.deviceName': 'Valey — the office',
    'sp.needPremium': 'This player needs Spotify Premium.',
    'sp.badToken': 'Spotify refused the token — connect again.',
    'sp.noConnect': 'The player did not connect.',
    'sp.declined': 'Spotify declined',
    'sp.noSdk': 'the Web Playback SDK did not load',
    'radio.title': 'Office radio',
    'radio.prevWave': 'previous station',
    'radio.nextWave': 'next station',
    'radio.prevTrack': 'previous track',
    'radio.nextTrack': 'next track',
    'radio.play': '▶ play',
    'radio.pause': '❚❚ pause',
    'radio.volume': 'volume',
    'radio.ownWave': 'own station',
    'radio.uriHint': 'a Spotify link: playlist, album or track',
    'radio.waking': 'The player is still waking up…',
    'radio.notSpotify': 'That does not look like a Spotify link',
    'radio.caught': 'Station tuned in',
    'radio.silence': 'silence',
    'radio.waiting': 'waiting for a track…',
    'radio.remove': 'remove',
    'radio.loopback': 'Open the office at <a href="http://127.0.0.1:{port}/">127.0.0.1:{port}</a> — Spotify only lets you back in there, and refuses localhost.',
    'radio.setup': 'For whole tracks, register an app at <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com</a>, give it the Redirect URI <code>{uri}</code> and paste the Client ID here.',
    'radio.save': 'save',
    'radio.yours': '● your Spotify is playing',
    'radio.signOut': 'disconnect',
    'radio.connecting': 'connecting…',
    'radio.connect': 'connect Spotify',
    'radio.changeApp': 'change the app',
    'radio.badId': 'That Client ID does not look right',
    'radio.appSaved': 'App saved — now press “connect Spotify”',
    'radio.noteOwn': 'Your own Spotify is playing: whole tracks, volume on the knob. Walk off down the corridor and the radio fades; while it plays, the office itself goes quieter.',
    'radio.noteDrm': 'This browser has no protected-content decryption (Widevine), so Spotify can only hand over previews. Whole tracks need a browser with DRM: Chrome, Safari, Firefox.',
    'radio.notePreview': 'The embedded player serves previews — short excerpts, hence the cut-offs. Whole tracks play only if you connect your own Spotify with the button above.',
    'radio.noteEmbed': 'Playing right in this tab. While the radio plays, the office sounds quieter.',
  }
};

// -------------------------------------------------------------------- the radio
// The panel is built once: inside it lives the iframe of the built-in player, and
// rebuilding it means breaking the music off. Closing is a class that takes the panel off
// screen.

let radioBuilt = false;

function radioOpen() { return el.radio && el.radio.classList.contains('open'); }

function openRadio() {
  buildRadio();
  el.radio.classList.add('open');
  radio.probeDrm();
  if (!radio.sdk) radio.attach($('#radioslot'));
  paintRadio();
  // An open panel has to show where the focus is. Painting that only from the repaint of
  // the list of waves means depending on that happening at all.
  radioRing.paint();
}

// The radio opened on R and after that demanded a mouse for everything: switch on, seek,
// choose a wave, delete it, type in your own. The focus walks over everything in the panel
// that can be pressed, in the order of the markup — the cross does not count, Escape
// replaces it. The volume inside the ring is turned by the sideways arrows, as a slider
// should be.
// numbers: '.rst' — a digit chooses a wave rather than a knob. It arrived from main
// together with the shared support for digits in the focus ring.
const RING = '.radioknobs button, .rst, .rdel, #radiovol, #radiouri, .radioauth button';
const radioRing = focusRing(() => el.radio, RING, { numbers: '.rst' });

// Put the ring on a given wave, by its number in the list. Used after a wave is
// added: the one just caught is the one now playing, and it is what the hand
// should be on.
function ringToWave(n) {
  if (!el.radio) return;
  const all = [...el.radio.querySelectorAll(RING)];
  const wave = all.filter((b) => b.classList.contains('rst'))[n];
  const at = wave ? all.indexOf(wave) : -1;
  if (at >= 0) radioRing.at(at);
}
function closeRadio() { if (el.radio) el.radio.classList.remove('open'); radioRing.reset(); }
function radioKey(raw) { return radioRing.key(raw, radioOpen()); }

// The panel is repainted on every event of the player, and the list of waves is rebuilt
// whole while that happens — the focus class goes away with the old buttons.
function repaintRadioFocus() { if (radioOpen()) radioRing.paint(); }

// A change of language. The radio panel cannot be rebuilt — the live iframe of the player
// is inside, and new markup would break the music off — so its captions are changed in
// place. The other panels are cheaper to repaint whole, but only the ones that are open.

function buildRadio() {
  if (radioBuilt) return;
  radioBuilt = true;
  ensurePanel();
  el.radio = $('#radio');
  el.radio.innerHTML = `<div class="rwrap radiowrap">
    <div class="vhead">${tr('radio.title')}<button id="radiox">✕</button></div>
    <div class="radiobody">
      <div class="radiocab">
        <div class="radiodial"><span id="radioname">—</span></div>
        <div id="radioface" class="radioface" hidden>
          <canvas id="radioart" class="radioart" width="40" height="40"></canvas>
          <div class="facetext">
            <b id="facetrack">—</b>
            <span id="faceartist"></span>
            <span id="facealbum"></span>
          </div>
        </div>
        <div class="radioglass"><div id="radioslot"></div></div>
        <div class="radioknobs">
          <button id="radioprev" title="${tr('radio.prevWave')}">◀</button>
          <button id="radiotoggle" class="big">${tr('radio.play')}</button>
          <button id="radionext" title="${tr('radio.nextWave')}">▶</button>
        </div>
        <label id="radiovolrow" class="radiovol" hidden>${tr('radio.volume')}
          <input id="radiovol" type="range" min="0" max="100" step="1">
        </label>
      </div>
      <ul id="radiolist" class="radiolist"></ul>
      <label class="radioadd">${tr('radio.ownWave')}
        <input id="radiouri" placeholder="${tr('radio.uriHint')}">
      </label>
      <div id="radioauth" class="radioauth"></div>
      <p id="radiohint" class="hint"></p>
    </div></div>`;

  $('#radiox').onclick = closeRadio;
  $('#radiotoggle').onclick = () => { if (!radio.toggle()) toast(tr('radio.waking')); };
  $('#radioprev').onclick = () => radio.tune(radio.current - 1);
  $('#radionext').onclick = () => radio.tune(radio.current + 1);
  $('#radiovol').oninput = (e) => player.setVolume(Number(e.target.value) / 100);
  // The field holds the real focus of the browser while it is being typed into, and
  // web/main.js hands nothing from an INPUT to the office: neither the arrows nor
  // Escape. So the field has to let go itself, or the panel becomes a room without a
  // door — reported 6 September 2026: after Enter the arrows moved the caret, Escape
  // did nothing, and the only way out was the mouse.
  //
  // Enter lets go and puts the ring on the wave just caught; Escape lets go and leaves
  // the ring where it stood, so the next Escape closes the panel, as it does everywhere.
  $('#radiouri').onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); radioRing.paint(); return; }
    if (e.key !== 'Enter') return;
    const uri = toUri(e.target.value);
    if (!uri) return toast(tr('radio.notSpotify'));
    radio.add(e.target.value.trim().slice(0, 40).replace(/^https?:\/\/[^/]+\//, '') || tr('radio.ownWave'), uri);
    e.target.value = '';
    e.target.blur();
    ringToWave(radio.current);
    toast(tr('radio.caught'));
  };
  radio.onChange = paintRadio;
}

// What to show in the footer of the panel: an invitation to set up an application, the
// sign-in button, or a note that the full player is already playing.
function authBlock() {
  const cfg = (S.settings && S.settings.spotify) || {};
  if (radio.needsLoopback) {
    return `<p class="warn">${tr('radio.loopback', { port: location.port })}</p>`;
  }
  if (!cfg.clientId) {
    return `<p class="hint">${tr('radio.setup', { uri: esc(location.origin) + '/callback' })}</p>
      <div class="radiorow"><input id="radiocid" placeholder="Client ID">
      <button id="radiosave">${tr('radio.save')}</button></div>`;
  }
  if (player.state === 'ready') {
    return `<div class="radiorow"><span class="ok">${tr('radio.yours')}</span>
      <button id="radioout">${tr('radio.signOut')}</button></div>`;
  }
  const label = player.state === 'starting' ? tr('radio.connecting') : tr('radio.connect');
  return `<div class="radiorow"><button id="radioin">${label}</button>
    <button id="radioforget" class="thin">${tr('radio.changeApp')}</button></div>`;
}

// The cover is repainted only when it has really changed: the panel is repainted on every
// event of the player, and copying pixels has nothing to do there.
let artKey = '';

function paintCover() {
  const art = $('#radioart');
  const src = radio.coverBig;
  if (!art) return;
  if (!src) { artKey = ''; art.getContext('2d').clearRect(0, 0, art.width, art.height); return; }
  // we check against whose cover really lies in the canvas: while a new one is on its way
  // coverBig is empty, and there is nothing to draw
  if (artKey === radio.coverFor) return;
  artKey = radio.coverFor;
  const c = art.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, art.width, art.height);
  c.drawImage(src, 0, 0);
}

function paintRadio() {
  if (!radioBuilt) return;
  const st = radio.station();
  const live = radio.sdk;
  const track = player.track;

  $('#radioname').textContent = live && track
    ? `${track.name} · ${(track.artists || []).map((a) => a.name).join(', ')}`.slice(0, 46)
    : st ? stationName(st) : tr('radio.silence');
  $('#radiotoggle').textContent = radio.playing ? tr('radio.pause') : tr('radio.play');
  $('#radiotoggle').classList.toggle('on', radio.playing);
  $('#radioprev').title = live ? tr('radio.prevTrack') : tr('radio.prevWave');
  $('#radionext').title = live ? tr('radio.nextTrack') : tr('radio.nextWave');
  $('#radioprev').onclick = () => (live ? player.prev() : radio.tune(radio.current - 1));
  $('#radionext').onclick = () => (live ? player.next() : radio.tune(radio.current + 1));

  // the full player has a face of its own: the built-in one with its previews is not needed here
  el.radio.querySelector('.radioglass').hidden = live;
  const face = $('#radioface');
  face.hidden = !live;
  if (live) {
    $('#facetrack').textContent = track ? track.name : tr('radio.waiting');
    $('#faceartist').textContent = track ? (track.artists || []).map((a) => a.name).join(', ') : '';
    $('#facealbum').textContent = track && track.album ? track.album.name : '';
    paintCover();
  }
  $('#radiovolrow').hidden = !live;
  if (live) $('#radiovol').value = Math.round(player.volume * 100);

  $('#radiolist').innerHTML = radio.stations.map((s, i) => `<li class="${i === radio.current ? 'now' : ''}">
    <button class="rst" data-i="${i}">${i === radio.current ? '●' : '○'} ${esc(stationName(s))}${i < 9 ? ` <kbd>${i + 1}</kbd>` : ''}</button>
    ${radio.stations.length > 1 ? `<button class="rdel" data-del="${i}" title="${tr('radio.remove')}">✕</button>` : ''}</li>`).join('');
  el.radio.querySelectorAll('.rst').forEach((b) => b.onclick = () => radio.tune(Number(b.dataset.i)));
  el.radio.querySelectorAll('.rdel').forEach((b) => b.onclick = () => radio.remove(Number(b.dataset.del)));
  repaintRadioFocus();

  $('#radioauth').innerHTML = authBlock();
  const save = $('#radiosave');
  if (save) save.onclick = async () => {
    const id = $('#radiocid').value.trim();
    if (!/^[A-Za-z0-9]{16,64}$/.test(id)) return toast(tr('radio.badId'));
    await api.saveSettings({ spotify: { clientId: id } });
    await radio.connect(id);
    paintRadio();
    toast(tr('radio.appSaved'));
  };
  const signIn = $('#radioin');
  if (signIn) signIn.onclick = () => radio.signIn();
  const out = $('#radioout');
  if (out) out.onclick = () => { radio.signOut(); paintRadio(); };
  const forget = $('#radioforget');
  if (forget) forget.onclick = async () => {
    await api.saveSettings({ spotify: { clientId: '' } });
    radio.signOut();
    paintRadio();
  };

  // A track length of thirty seconds is a sure sign that the built-in player is giving out
  // a preview rather than music: otherwise the break-off looks like a broken radio.
  const preview = !live && radio.duration > 0 && radio.duration <= 35_000;
  $('#radiohint').textContent = player.error || radio.error
    || (live
      ? tr('radio.noteOwn')
      : radio.drm === 'none'
        ? tr('radio.noteDrm')
        : preview
          ? tr('radio.notePreview')
          : tr('radio.noteEmbed'));
  renderHud();
}

function drawRadio(ctx, x, y, t) {
  const on = radio.playing;

  // the cabinet
  px(ctx, x - 16, y - 12, 32, 12, '#5f4530');
  px(ctx, x - 16, y - 12, 32, 2, '#7a5a3e');
  px(ctx, x - 13, y - 2, 3, 2, '#3a2a1e');
  px(ctx, x + 10, y - 2, 3, 2, '#3a2a1e');

  // the body
  px(ctx, x - 17, y - 38, 34, 26, '#8a5f3a');
  px(ctx, x - 17, y - 38, 34, 2, '#a9784c');
  px(ctx, x - 17, y - 38, 2, 26, '#a9784c');
  px(ctx, x + 15, y - 38, 2, 26, '#5e3f27');
  px(ctx, x - 17, y - 14, 34, 2, '#5e3f27');

  // the little window with the cover of the wave; while there is none — dark glass
  px(ctx, x - 16, y - 36, 15, 15, '#241a13');
  if (radio.cover) {
    ctx.drawImage(radio.cover, (x - 15) | 0, (y - 35) | 0);
    // the glass on top: a glint above, a shadow below, or the cover falls out of the office
    ctx.globalAlpha = 0.16;
    px(ctx, x - 15, y - 35, 13, 4, '#ffffff');
    ctx.globalAlpha = 0.22;
    px(ctx, x - 15, y - 26, 13, 4, '#1a0f08');
    ctx.globalAlpha = 1;
  } else {
    px(ctx, x - 14, y - 34, 11, 11, '#1a120c');
    pxText(ctx, '♪', x - 12, y - 26, '#4a3626', 8);
  }
  px(ctx, x - 16, y - 36, 15, 1, '#c9a06a');   // the frame of the little window
  px(ctx, x - 16, y - 22, 15, 1, '#5e3f27');

  // the speaker grille under the cover, the cone pulsing a little in time
  const pulse = on ? Math.floor(t / 140) % 2 : 0;
  px(ctx, x - 16, y - 20, 15, 6, '#2e2119');
  for (let gy = 0; gy < 6; gy += 2) {
    for (let gx = 0; gx < 15; gx += 2) px(ctx, x - 16 + gx, y - 20 + gy, 1, 1, '#4a3626');
  }
  px(ctx, x - 11 - pulse, y - 19 - pulse, 4 + pulse * 2, 4 + pulse * 2, '#3f2d20');

  // the tuning scale with its needle
  px(ctx, x + 1, y - 36, 14, 7, '#241a13');
  px(ctx, x + 1, y - 36, 14, 1, '#c9a06a');
  for (let i = 0; i < 6; i++) px(ctx, x + 2 + i * 2, y - 34, 1, 2, '#6d5a3f');
  const needle = radio.stations.length > 1 ? radio.current / (radio.stations.length - 1) : 0.5;
  px(ctx, x + 2 + Math.round(needle * 10), y - 35, 1, 5, on ? '#ffd166' : '#8c7660');

  // the strip: how much of the track has played. The empty groove is visible in silence
  // too — then it is clear that this is a time scale rather than an indicator gone out
  const done = radio.progress();
  px(ctx, x + 1, y - 27, 14, 3, '#241a13');
  px(ctx, x + 1, y - 27, 14, 1, '#1a120c');
  if (done > 0) {
    const w = Math.max(1, Math.round(done * 12));
    px(ctx, x + 2, y - 26, w, 1, on ? '#9fe0a8' : '#6d5a3f');
    if (on && w < 12) px(ctx, x + 2 + w, y - 26, 1, 1, '#ffd166');   // the playhead
  }

  // the indicator: lit while playing, dimmed on pause
  px(ctx, x + 1, y - 22, 2, 2, on ? (Math.sin(t / 420) > 0 ? '#9fe0a8' : '#7cc78a') : '#5a4a3a');

  // the equaliser
  for (let i = 0; i < 4; i++) {
    const h = on ? 1 + Math.floor((Math.sin(t / (150 + i * 47) + i) * 0.5 + 0.5) * 6) : 1;
    px(ctx, x + 4 + i * 3, y - 15 - h, 2, h, on ? ['#9fe0a8', '#ffd166', '#8fc8ff', '#c39bff'][i] : '#4a3626');
  }

  // the notes flying out of the speaker
  if (on) {
    for (let i = 0; i < 3; i++) {
      const life = ((t / 900 + i / 3) % 1);
      const nx = x - 8 + Math.sin(life * 6 + i) * 4;
      const ny = y - 38 - life * 16;
      ctx.globalAlpha = 0.75 * (1 - life);
      px(ctx, nx, ny, 2, 2, '#f6e3c0');
      px(ctx, nx + 1, ny - 3, 1, 3, '#f6e3c0');
      ctx.globalAlpha = 1;
    }
  }
}

export function register(api) {
  api.i18n(DICT);

  // The receiver is right by the entrance, pressed to the outer wall: in the middle of the
  // corridor the cabinet would block the way. The thing names its own dimensions — the table
  // in blocked() knows nothing about foreign kinds.
  api.on('layout', (L) => {
    const b = (L.bands || [])[0];
    if (!b || !L.props || L.props.some((q) => q.kind === 'radio')) return;
    prop = { kind: 'radio', x: MARGIN + 62, y: b.y + 26, w: 34, h: 36 };
    L.props.push(prop);
  });

  api.on('near', (p, L) => {
    const q = (L.props || []).find((x) => x.kind === 'radio');
    if (!q) return null;
    return { kind: 'radio', prop: q, d: Math.hypot(q.x - p.x, q.y - 10 - p.y) };
  });

  api.on('act', (n) => {
    if (n.kind !== 'radio') return false;
    openRadio();
    return true;
  });

  api.on('hint', (near) => {
    if (!near || near.kind !== 'radio') return null;
    const r = near.prop;
    return { x: r.x, y: r.y - 40, text: radio.playing ? tr('hint.radioOn') : tr('hint.radio'), color: '#9fe0a8' };
  });

  api.on('draw', (L, t) => {
    const q = (L.props || []).find((x) => x.kind === 'radio');
    return q ? { y: q.y, fn: (ctx) => drawRadio(ctx, q.x, q.y, t) } : null;
  });

  // The key is declared in the shared registry: `KeyR` is physical, so the Russian «К» is
  // the same key with no second branch. While the panel is open the arrows are its — and
  // that stays on the raw key, as in every panel.
  api.keys([{ id: 'toggle', codes: ['KeyR'], group: 'panel', hint: 'radio.hint' }]);
  api.on('key', (raw) => radioKey(raw));
  api.on('action', (id) => {
    if (id !== 'radio.toggle') return false;
    radioOpen() ? closeRadio() : openRadio();
    return true;
  });
  api.on('esc', () => (radioOpen() ? (closeRadio(), true) : false));
  // An open panel holds the screen: while it is visible the office does not count as free.
  // The core used to know that by the line UI.radioOpen() in busy() — the core does not know
  // a module's ids, so it asks.
  api.on('busy', () => radioOpen());

  api.on('tick', (state) => {
    S = state;
    // While the music plays the office steps back; and it is heard the quieter the further
    // you have gone along the corridor.
    sound.duck(radio.playing);
    const q = prop || ((state.layout && state.layout.props) || []).find((x) => x.kind === 'radio');
    if (q) { prop = q; radio.listenFrom(Math.hypot(q.x - state.player.x, q.y - state.player.y)); }
  });

  api.on('hud', (state) => {
    S = S || state;
    return { text: radio.playing ? '♪ ' + nowPlaying() : '♪ R', kind: radio.playing ? 'work' : 'dim', title: tr('hud.radioTitle') };
  });

  api.on('lang', () => relabelRadio());

  // The receiver has to know about the Spotify application: without it it plays through the
  // built-in player, with it through its own. The settings arrive on the same tick.
  radio.load();
  const connect = () => {
    const id = (S && S.settings && S.settings.spotify && S.settings.spotify.clientId) || '';
    if (id !== connect.was) { connect.was = id; radio.connect(id); }
  };
  api.on('tick', connect);
}

function relabelRadio() {
      // There may be no panel at all: the core calls `lang` on every module when the
      // language changes, while the receiver starts no element of its own before the first
      // opening. Without this line the point fell over on every change of language — the
      // loader caught it and wrote to the log, that is, it broke silently and only in the
      // console.
      if (!el.radio) return;
      const lead = (sel, text) => {
        const n = el.radio.querySelector(sel);
        if (n && n.firstChild && n.firstChild.nodeType === 3) n.firstChild.nodeValue = text;
      };
      lead('.radiowrap .vhead', tr('radio.title'));
      lead('.radioadd', tr('radio.ownWave'));
      lead('#radiovolrow', tr('radio.volume'));
      const uri = el.radio.querySelector('#radiouri');
      if (uri) uri.placeholder = tr('radio.uriHint');
      paintRadio();
}

export { openRadio, closeRadio, radioOpen, radioKey, repaintRadioFocus };
