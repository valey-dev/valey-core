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
import { toast, renderHud, focusRing, openKeyCard, closeBag } from '../../web/ui.js';
import { sound } from '../../web/sound.js';
import { MARGIN } from '../../web/layout.js';
import { radio, stationName, kindOf, parseWave, mixedContent, stream, PICKS } from './radio.js';
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
// The core's callbacks, kept from register(). Saving a setting used to be
// written as `api.saveSettings` inside paintRadio, where no `api` existed — a
// ReferenceError on click, and the Client ID went nowhere. Held here on purpose.
let api = null;
let prop = null;

const nowPlaying = () => {
  if (radio.isStream()) return (radio.onAir && radio.onAir.title) || stationName(radio.station()) || '';
  return radio.sdk && player.track ? player.track.name : stationName(radio.station()) || '';
};

const DICT = {
  ru: {
    // The caption on its cap in the keys panel: a module's key is the module's business
    'radio.hint': 'радио',
    'radio.playKey': 'пуск/пауза',
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
    'radio.uriHint': 'ссылка Spotify или адрес потока: .mp3, .aac, Icecast',
    'radio.waking': 'Плеер ещё просыпается…',
    'radio.notWave': 'Это не ссылка Spotify и не адрес потока',
    'radio.picks': 'из подборки:',
    'radio.srcStream': 'ПОТОК',
    'radio.srcSpotify': 'SPOTIFY',
    'radio.lcdOn': '● В ЭФИРЕ',
    'radio.lcdTuning': '… ЛОВЛЮ',
    'radio.lcdOff': '○ ВЫКЛЮЧЕНО',
    'radio.lcdSilent': '✕ МОЛЧИТ',
    'radio.onFor': 'в эфире {n} мин',
    'radio.onJust': 'только что в эфире',
    'radio.waitSound': 'жду звук — до 10 секунд',
    'radio.advice': 'проверь ссылку или убери волну',
    'radio.why.timeout': 'адрес не ответил за 10 секунд',
    'radio.why.hls': 'это HLS (.m3u8) — браузер его не играет, нужен адрес .mp3 или .aac',
    'radio.why.mixed': 'http-поток не играет на https-странице офиса',
    'radio.why.gone': 'станция закрыла поток ({code})',
    'radio.why.status': 'станция ответила ошибкой {code}',
    'radio.why.notAudio': 'по адресу не поток: {type}',
    'radio.why.unreachable': 'адрес не найден или не отвечает',
    'radio.why.format': 'браузер не играет этот формат',
    'radio.why.silent': 'станция оборвала поток',
    'radio.why.gesture': 'браузер ждёт нажатия — включи ещё раз',
    'radio.why.notUrl': 'это не адрес потока',
    'radio.checking': 'проверяю адрес…',
    'radio.isStream': '✓ это поток: отвечает · {info}',
    'radio.notChecked': 'адрес не проверен: проверку делает хозяин офиса',
    'radio.nameIt': 'как назвать волну',
    'radio.catch': 'поймать волну',
    'radio.cancel': 'отмена',
    'radio.noteStream': 'Поток играет прямо в этой вкладке: без аккаунта, громкость ручкой, в коридоре затихает. Пока радио играет, офис звучит тише.',
    'radio.noteAdding': 'У адреса потока нет имени — назови волну сам. Enter ловит, Esc — отмена. Не отвечает или не поток — строка скажет почему, волна не добавится.',
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
    'key.spot.name': 'Spotify',
    'key.spot.on': 'подключён',
    'key.spot.off': 'не подключён',
    'key.spot.bad': 'нужен 127.0.0.1',
    'key.spot.gives': 'Что даёт: в приёмнике у входа играют целые треки твоего Spotify вместо тридцатисекундных превью. Без ключа приёмник работает — просто превью, отсюда обрывы.',
    'key.spot.givesOn': 'Что даёт: в приёмнике у входа играет твой Spotify — целые треки вместо тридцатисекундных превью, громкость ручкой, затихает, когда отходишь по коридору.',
    'key.spot.loopback': 'Офис открыт на {host}, а Spotify пускает обратно только на 127.0.0.1. Открой офис по 127.0.0.1:{port}, иначе четвёртый шаг откажет.',
    'key.spot.openLoop': 'открыть 127.0.0.1:{port}',
    'key.spot.s1': 'Заведи приложение на developer.spotify.com — бесплатно, хватит обычного аккаунта.',
    'key.spot.s1btn': 'открыть в браузере',
    'key.spot.s2': 'Впиши в него Redirect URI:',
    'key.spot.s3': 'Вставь Client ID:',
    'key.spot.s4': 'Spotify спросит разрешение в новом окне и вернёт сюда.',
    'key.spot.note': 'Client ID — не секрет: он лежит в .settings.json и один на весь офис. А ключ, который Spotify выдаёт в ответ, останется в этом браузере — в другом придётся подключаться заново.',
    'key.spot.premium': 'Нужен Premium: без него Web Playback SDK не заводится, и целых треков не будет даже с ключом.',
    'key.spot.rowAccount': 'аккаунт',
    'key.spot.rowApp': 'приложение',
    'key.spot.rowDevice': 'устройство',
    'key.spot.accountVal': 'Premium — без него плеер не заводится',
    'key.spot.appVal': 'client id {id} · твоё, заведено на developer.spotify.com',
    'key.spot.deviceVal': '«Valey — офис»',
    'key.spot.noDrm': 'В приёмнике нет Widevine, поэтому Spotify отдаёт только превью. Полные треки — в Chrome, Safari или Firefox.',
    'key.spot.inBrowser': 'ключ живёт в этом браузере, а не на диске',
    'key.spot.toRadio': 'проводить к приёмнику',
    'key.spot.whyBrowser': 'Поэтому в другом браузере офис попросит подключиться заново — и поэтому же ключ не уезжает вместе с .settings.json на другую машину.',
    'radio.previewLine': 'Без подключения своего Spotify играет превью по 30 сек.',
    'radio.tune': 'настроить',
    'radio.noteDrm': 'В этом браузере нет расшифровки защищённого контента (Widevine), поэтому Spotify сможет отдавать только превью. Полные треки — в браузере с DRM: Chrome, Safari, Firefox.',
    'radio.notePreview': 'Встроенный плеер отдаёт превью — короткие отрывки, отсюда обрывы. Треки целиком играют, только если подключить свой Spotify кнопкой выше.',
    'radio.noteEmbed': 'Играет прямо в этой вкладке. Пока радио играет, офис звучит тише.',
  },
  en: {
    'radio.hint': 'radio',
    'radio.playKey': 'play/pause',
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
    'radio.uriHint': 'a Spotify link or a stream address: .mp3, .aac, Icecast',
    'radio.waking': 'The player is still waking up…',
    'radio.notWave': 'Neither a Spotify link nor a stream address',
    'radio.picks': 'from the picks:',
    'radio.srcStream': 'STREAM',
    'radio.srcSpotify': 'SPOTIFY',
    'radio.lcdOn': '● ON AIR',
    'radio.lcdTuning': '… TUNING',
    'radio.lcdOff': '○ OFF',
    'radio.lcdSilent': '✕ SILENT',
    'radio.onFor': 'on air {n} min',
    'radio.onJust': 'just on air',
    'radio.waitSound': 'waiting for sound — up to 10 seconds',
    'radio.advice': 'check the link or remove the station',
    'radio.why.timeout': 'the address did not answer in 10 seconds',
    'radio.why.hls': 'this is HLS (.m3u8) — browsers do not play it, an .mp3 or .aac address is needed',
    'radio.why.mixed': 'an http stream will not play on the office’s https page',
    'radio.why.gone': 'the station closed the stream ({code})',
    'radio.why.status': 'the station answered with error {code}',
    'radio.why.notAudio': 'not a stream at this address: {type}',
    'radio.why.unreachable': 'the address was not found or does not answer',
    'radio.why.format': 'the browser does not play this format',
    'radio.why.silent': 'the station cut the stream off',
    'radio.why.gesture': 'the browser wants a press — switch it on again',
    'radio.why.notUrl': 'this is not a stream address',
    'radio.checking': 'checking the address…',
    'radio.isStream': '✓ a stream: answering · {info}',
    'radio.notChecked': 'not checked: the office owner’s server does the checking',
    'radio.nameIt': 'name the station',
    'radio.catch': 'tune in',
    'radio.cancel': 'cancel',
    'radio.noteStream': 'The stream plays right in this tab: no account, volume on the knob, fading down the corridor. While the radio plays, the office sounds quieter.',
    'radio.noteAdding': 'A stream address carries no name — name the station yourself. Enter tunes in, Esc cancels. If it does not answer or is not a stream, the line says why and the station is not added.',
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
    'key.spot.name': 'Spotify',
    'key.spot.on': 'connected',
    'key.spot.off': 'not connected',
    'key.spot.bad': '127.0.0.1 needed',
    'key.spot.gives': 'What it gives: the receiver by the entrance plays whole tracks from your Spotify instead of thirty-second previews. Without the key the receiver still works — previews, hence the cut-offs.',
    'key.spot.givesOn': 'What it gives: the receiver by the entrance plays your Spotify — whole tracks instead of thirty-second previews, volume on the knob, fading as you walk off down the corridor.',
    'key.spot.loopback': 'The office is open at {host}, and Spotify only lets you back in at 127.0.0.1. Open the office at 127.0.0.1:{port}, or the fourth step will refuse.',
    'key.spot.openLoop': 'open 127.0.0.1:{port}',
    'key.spot.s1': 'Register an app at developer.spotify.com — free, an ordinary account is enough.',
    'key.spot.s1btn': 'open in the browser',
    'key.spot.s2': 'Give it this Redirect URI:',
    'key.spot.s3': 'Paste the Client ID:',
    'key.spot.s4': 'Spotify will ask permission in a new window and bring you back here.',
    'key.spot.note': 'The Client ID is not a secret: it lies in .settings.json and is one for the whole office. The key Spotify hands back stays in this browser — in another one you connect again.',
    'key.spot.premium': 'Premium is required: without it the Web Playback SDK never starts, and there are no whole tracks even with a key.',
    'key.spot.rowAccount': 'account',
    'key.spot.rowApp': 'app',
    'key.spot.rowDevice': 'device',
    'key.spot.accountVal': 'Premium — the player will not start without it',
    'key.spot.appVal': 'client id {id} · yours, registered at developer.spotify.com',
    'key.spot.deviceVal': '“Valey — the office”',
    'key.spot.noDrm': 'This browser has no Widevine, so Spotify only hands over previews. Whole tracks live in Chrome, Safari or Firefox.',
    'key.spot.inBrowser': 'the key lives in this browser, not on the disk',
    'key.spot.toRadio': 'walk me to the receiver',
    'key.spot.whyBrowser': 'So in another browser the office will ask you to connect again — and so the key never travels with .settings.json to another machine.',
    'radio.previewLine': 'Without your own Spotify connected, 30-second previews play.',
    'radio.tune': 'set up',
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
// The stream rows joined it on 12 September 2026: the name of a new wave, its two
// buttons and the picks — all of them reachable without the mouse, like the rest.
const RING = '.radioknobs button, #radiovol, .rst, .rdel, #radiouri, #radiowave, #radiocatch, #radiocancel, .rpick, .radioauth button';
const radioRing = focusRing(() => el.radio, RING, { numbers: '.rst' });

// Put the ring on a given wave, by its number in the list. Used after a wave is
// added: the one just caught is the one now playing, and it is what the hand
// should be on.
function ringToWave(n) {
  if (!el.radio) return;
  const wave = el.radio.querySelectorAll('.rst')[n];
  if (wave) radioRing.on(wave);
}
function closeRadio() { if (el.radio) el.radio.classList.remove('open'); radioRing.reset(); }

// Start or stop the music, with the panel open or closed. The player lives inside the
// panel's frame, so with the receiver never opened this session there is nothing to
// toggle: then the first press builds the panel without showing it and wakes the player,
// and says so — the second press plays. The word is needed because with the panel closed
// the only other sign of life is the note in the corner of the HUD.
function playPause() {
  // A stream needs no player to wake: our own <audio> is there from the first press.
  if (radio.isStream()) { radio.toggle(); return; }
  if (!radio.sdk && !radio.controller) {
    buildRadio();
    radio.attach($('#radioslot'));
    toast(tr('radio.waking'));
    return;
  }
  if (!radio.toggle()) toast(tr('radio.waking'));
}
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
        <div id="radiolcd" class="lcd radiolcd" hidden>
          <div class="l1"><span id="lcdstate"></span><span class="pn" id="lcdbr"></span></div>
          <div class="l2" id="lcdtitle"></div>
          <div class="l3" id="lcdmeta"></div>
        </div>
        <div class="radioknobs">
          <button id="radioprev" title="${tr('radio.prevWave')}">◀</button>
          <button id="radiotoggle" class="big">${tr('radio.play')}</button>
          <button id="radionext" title="${tr('radio.nextWave')}">▶</button>
        </div>
        <label id="radiovolrow" class="radiovol" hidden>${tr('radio.volume')}
          <input id="radiovol" type="range" min="0" max="100" step="1">
          <span id="radiovolpct"></span>
        </label>
      </div>
      <ul id="radiolist" class="radiolist"></ul>
      <label class="radioadd">${tr('radio.ownWave')}
        <input id="radiouri" placeholder="${tr('radio.uriHint')}">
      </label>
      <div id="radiocheck" class="radiocheck" hidden></div>
      <label id="radionamerow" class="radioadd" hidden>${tr('radio.nameIt')}
        <input id="radiowave" maxlength="40">
      </label>
      <div id="radioaddbtns" class="radioaddbtns" hidden>
        <button id="radiocatch" class="primary">${tr('radio.catch')}</button>
        <button id="radiocancel">${tr('radio.cancel')}</button>
      </div>
      <div id="radiopicks" class="radiopicks"></div>
      <div id="radioauth" class="radioauth"></div>
      <p id="radiohint" class="hint"></p>
    </div></div>`;

  $('#radiox').onclick = closeRadio;
  $('#radiotoggle').onclick = () => playPause();
  $('#radioprev').onclick = () => radio.tune(radio.current - 1);
  $('#radionext').onclick = () => radio.tune(radio.current + 1);
  $('#radiovol').oninput = (e) => {
    const v = Number(e.target.value) / 100;
    if (radio.isStream()) stream.setVolume(v); else player.setVolume(v);
    $('#radiovolpct').textContent = e.target.value + '%';
  };
  // The field holds the real focus of the browser while it is being typed into, and
  // web/main.js hands nothing from an INPUT to the office: neither the arrows nor
  // Escape. So the field has to let go itself, or the panel becomes a room without a
  // door — reported 6 September 2026: after Enter the arrows moved the caret, Escape
  // did nothing, and the only way out was the mouse.
  //
  // Enter lets go and puts the ring on the wave just caught; Escape lets go and leaves
  // the ring where it stood, so the next Escape closes the panel, as it does everywhere.
  //
  // A stream address does not go straight into the list: the server checks it first,
  // and it asks for a name, which an address does not carry. Frame 2046:631.
  $('#radiouri').onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancelAdding(); e.target.blur(); radioRing.paint(); return; }
    if (e.key !== 'Enter') return;
    const w = parseWave(e.target.value);
    if (!w) return toast(tr('radio.notWave'));
    if (w.kind === 'spotify') {
      radio.add(e.target.value.trim().slice(0, 40).replace(/^https?:\/\/[^/]+\//, '') || tr('radio.ownWave'), w.uri);
      e.target.value = '';
      e.target.blur();
      ringToWave(radio.current);
      toast(tr('radio.caught'));
      return;
    }
    checkWave(w.uri);
  };
  $('#radiowave').onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancelAdding(); e.target.blur(); radioRing.on($('#radiouri')); return; }
    if (e.key === 'Enter') { e.preventDefault(); catchWave(); }
  };
  $('#radiocatch').onclick = () => catchWave();
  $('#radiocancel').onclick = () => { cancelAdding(); radioRing.on($('#radiouri')); };
  radio.onChange = paintRadio;
}

// ------------------------------------------------------- a stream being added
// One address at a time, from the Enter in «своя волна» to «поймать волну» or «отмена».
// state: checking → ok | guest | bad. Only ok and guest may be caught: a stream the
// server called not a stream is not added, and the line says why. A guest's receiver
// is not checked at all — the server checks for its owner only — so it is named and
// caught on trust, and the display will say soon enough if it is silent.
let adding = null;

const hostOf = (uri) => { try { return new URL(uri).hostname.replace(/^www\./, ''); } catch { return ''; } };
// What a station calls itself is often a sentence: «Groove Salad: a nicely chilled
// plate of ambient beats…». The name of a wave is the part before the first colon,
// dash or bracket.
const shortName = (n) => String(n || '').split(/:| \| | - | — /)[0].replace(/\s*[([].*$/, '').trim().slice(0, 32);

function whyText(reason, extra = {}) {
  return tr('radio.why.' + reason, { code: extra.status || '', type: extra.type || '' });
}

async function checkWave(uri) {
  const mine = { uri, state: 'checking', out: null, name: '' };
  adding = mine;
  if (mixedContent(uri)) { mine.state = 'bad'; mine.out = { reason: 'mixed' }; paintRadio(); return; }
  paintRadio();
  let out;
  try {
    const r = await fetch('/api/radio/probe?url=' + encodeURIComponent(uri));
    out = r.status === 403 ? { guest: true } : await r.json();
  } catch { out = { ok: false, reason: 'unreachable' }; }
  if (adding !== mine) return;   // cancelled, or another address typed meanwhile
  mine.out = out;
  if (out.guest) mine.state = 'guest';
  else if (out.ok) { mine.state = 'ok'; mine.uri = out.uri || uri; }
  else mine.state = 'bad';
  mine.name = shortName(out.name) || hostOf(mine.uri);
  paintRadio();
  if (mine.state === 'ok' || mine.state === 'guest') {
    const name = $('#radiowave');
    name.value = mine.name;
    name.focus();
    name.select();
  }
}

function catchWave() {
  if (!adding || (adding.state !== 'ok' && adding.state !== 'guest')) return;
  const name = $('#radiowave').value.trim() || adding.name || hostOf(adding.uri);
  const uri = adding.uri;
  adding = null;
  $('#radiouri').value = '';
  $('#radiowave').value = '';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  radio.add(name.slice(0, 40), uri);
  ringToWave(radio.current);
  toast(tr('radio.caught'));
}

function cancelAdding() {
  if (!adding) return;
  adding = null;
  $('#radiouri').value = '';
  $('#radiowave').value = '';
  paintRadio();
}

function paintAdding() {
  const check = $('#radiocheck');
  const open = !!adding;
  const named = open && (adding.state === 'ok' || adding.state === 'guest');
  check.hidden = !open;
  $('#radionamerow').hidden = !named;
  $('#radioaddbtns').hidden = !named;
  if (open) {
    const out = adding.out || {};
    check.className = 'radiocheck ' + adding.state;
    check.textContent = adding.state === 'checking' ? tr('radio.checking')
      : adding.state === 'guest' ? tr('radio.notChecked')
        : adding.state === 'ok'
          ? tr('radio.isStream', { info: [out.format, out.bitrate ? out.bitrate + ' kbps' : ''].filter(Boolean).join(' · ') })
          : '✕ ' + whyText(out.reason || 'unreachable', out);
  }
  // The picks stand aside while an address is being named: two ways in at once is one too many.
  const have = new Set(radio.stations.map((x) => x.uri));
  const left = PICKS.filter((p) => !have.has(p.uri));
  const picks = $('#radiopicks');
  picks.hidden = open || !left.length;
  picks.innerHTML = left.length ? `<span class="rpicklbl">${tr('radio.picks')}</span>`
    + left.map((p) => `<button class="rpick" data-uri="${esc(p.uri)}">${esc(p.name)}</button>`).join('') : '';
  picks.querySelectorAll('.rpick').forEach((b) => b.onclick = () => {
    const p = PICKS.find((x) => x.uri === b.dataset.uri);
    if (!p) return;
    radio.add(p.name, p.uri);
    ringToWave(radio.current);
    toast(tr('radio.caught'));
  });
}

// The display of a stream. It stands where the Spotify glass stands and says the one
// thing the glass cannot: whether the station is on the air, what it plays, and — when
// it is silent — why and what to do. Frames 2045:565 (on air) and 2046:4010 (silent).
function paintLcd(st) {
  const a = radio.onAir || {};
  const lcd = $('#radiolcd');
  const au = stream.audio;
  const tuning = !radio.playing && !radio.streamError && au && au.getAttribute('src') && !au.paused;
  let l1, l2, l3, br = '';
  if (radio.streamError) {
    l1 = tr('radio.lcdSilent');
    l2 = whyText(radio.streamError, { status: radio.streamStatus });
    l3 = tr('radio.advice');
  } else if (radio.playing) {
    const min = radio.streamSince ? Math.floor((Date.now() - radio.streamSince) / 60000) : 0;
    l1 = tr('radio.lcdOn');
    br = a.bitrate ? String(a.bitrate) : '';
    l2 = a.title || stationName(st);
    l3 = [stationName(st), a.format, min ? tr('radio.onFor', { n: min }) : tr('radio.onJust')].filter(Boolean).join(' · ');
  } else if (tuning) {
    l1 = tr('radio.lcdTuning');
    l2 = stationName(st);
    l3 = tr('radio.waitSound');
  } else {
    l1 = tr('radio.lcdOff');
    l2 = stationName(st);
    l3 = hostOf(st.uri);
  }
  lcd.classList.toggle('bad', !!radio.streamError);
  $('#lcdstate').textContent = l1;
  $('#lcdbr').textContent = br;
  $('#lcdtitle').textContent = l2;
  $('#lcdmeta').textContent = l3;
}

// What stands in the footer of the panel now that the connection has moved out.
// One line and a way to it — the receiver's job is to say why the music breaks
// off, not to walk anybody through four steps of setting up an application.
// Frame 572:2.
//
// The whole flow lives on the key shelf: the Client ID field, the Redirect URI,
// the loopback warning and the sign-in are the card's, and there is exactly one
// of each. While the full player is live the block is gone altogether — the
// panel then wears the player's own face, and the hint under it already says
// whose Spotify is playing.
function authBlock() {
  if (player.state === 'ready') return '';
  return `<div class="radiotune"><p class="hint">${tr('radio.previewLine')}</p>
    <button id="radiotune">${tr('radio.tune')}</button></div>`;
}

// ------------------------------------------------------------- the key card
// Spotify on the inventory's key shelf. Frames: 571:2 (not connected), 565:2
// (connected). The whole connection lives here — the receiver keeps one line
// and a way over, because a thing that plays music is a bad place to explain
// four steps of registering an application.
//
// Three states, and the third earns its place: `bad` is the office opened on
// localhost. Everything is set up correctly and the last step will still
// refuse, because Spotify only returns to 127.0.0.1 — a different problem with
// a different fix, and calling it «not connected» sends people back round the
// same four steps.
function spotIcon(c) {
  c.fillStyle = '#1c130d'; c.fillRect(0, 0, 48, 36);
  c.fillStyle = '#3f7a4e';
  c.beginPath(); c.arc(24, 18, 13, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#0f1a12'; c.lineCap = 'round';
  for (const [y, w, t] of [[13, 16, 3], [18, 12, 2.4], [23, 8, 2]]) {
    c.lineWidth = t;
    c.beginPath(); c.arc(24, y + 6, w / 2, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  }
}

const spotCfg = () => (S && S.settings && S.settings.spotify) || {};
const spotState = () => (player.state === 'ready' ? 'on' : radio.needsLoopback ? 'bad' : 'off');

// The Redirect URI Spotify must be given. Always the loopback form: that is the
// one Spotify accepts, whatever address the office happens to be open at.
const redirectUri = () => `http://127.0.0.1:${location.port}/callback`;

function spotBody() {
  const cfg = spotCfg();
  if (player.state === 'ready') {
    const id = cfg.clientId ? cfg.clientId.slice(0, 8) + '…' : '—';
    const drm = radio.drm === 'none' ? `<p class="keywarn">⚠ ${tr('key.spot.noDrm')}</p>` : '';
    return `<p class="keygives">${tr('key.spot.givesOn')}</p>
      <div class="keyrow"><span>${tr('key.spot.rowAccount')}</span><b>${tr('key.spot.accountVal')}</b></div>
      <div class="keyrow"><span>${tr('key.spot.rowApp')}</span><b>${tr('key.spot.appVal', { id: esc(id) })}</b></div>
      <div class="keyrow"><span>${tr('key.spot.rowDevice')}</span><b>${tr('key.spot.deviceVal')}</b></div>
      ${drm}
      <div class="keyfoot"><span class="dim">${tr('key.spot.inBrowser')}</span>
        <button class="obtn" data-act="forget">${tr('radio.changeApp')}</button>
        <button class="obtn" data-act="toradio">${tr('key.spot.toRadio')}</button>
        <button class="obtn" data-act="out">${tr('radio.signOut')}</button></div>
      <p class="hint">${tr('key.spot.whyBrowser')}</p>`;
  }
  const loop = radio.needsLoopback
    ? `<p class="keywarn">⚠ ${tr('key.spot.loopback', { host: esc(location.host), port: esc(location.port) })}
      <button class="obtn" data-act="loop">${tr('key.spot.openLoop', { port: esc(location.port) })}</button></p>`
    : '';
  const has = !!cfg.clientId;
  const four = player.state === 'starting' ? tr('radio.connecting') : tr('radio.connect');
  return `<p class="keygives">${tr('key.spot.gives')}</p>
    ${loop}
    <div class="keystep"><i>1</i><span>${tr('key.spot.s1')}</span>
      <button class="obtn" data-act="dash">${tr('key.spot.s1btn')}</button></div>
    <div class="keystep"><i>2</i><span>${tr('key.spot.s2')}</span>
      <input id="spoturi" value="${esc(redirectUri())}" readonly>
      <button class="obtn" data-copy="${esc(redirectUri())}">${tr('key.copy')}</button></div>
    <div class="keystep"><i>3</i><span>${tr('key.spot.s3')}</span>
      <input id="spotcid" placeholder="Client ID" value="${esc(cfg.clientId || '')}">
      <button class="obtn" data-act="save">${tr('radio.save')}</button></div>
    <div class="keystep${has ? '' : ' todo'}"><i>4</i><span>${tr('key.spot.s4')}</span>
      <button class="obtn" data-act="in"${has ? '' : ' disabled'}>${four}</button></div>
    <p class="hint">${tr('key.spot.note')}</p>
    <p class="hint">${tr('key.spot.premium')}</p>`;
}

function spotBind(root) {
  const on = (act, fn) => { const b = root.querySelector(`[data-act="${act}"]`); if (b) b.onclick = fn; };
  on('dash', () => window.open('https://developer.spotify.com/dashboard', '_blank', 'noreferrer'));
  on('loop', () => { location.href = `http://127.0.0.1:${location.port}/`; });
  on('save', async () => {
    const id = root.querySelector('#spotcid').value.trim();
    if (!/^[A-Za-z0-9]{16,64}$/.test(id)) return toast(tr('radio.badId'));
    await api.saveSettings({ spotify: { clientId: id } });
    await radio.connect(id);
    openKeyCard('spotify');
    toast(tr('radio.appSaved'));
  });
  on('in', () => radio.signIn());
  on('out', () => { radio.signOut(); openKeyCard('spotify'); });
  on('forget', async () => {
    await api.saveSettings({ spotify: { clientId: '' } });
    radio.signOut();
    openKeyCard('spotify');
  });
  // «Проводить к приёмнику» closes the inventory and opens the radio: the key is
  // set up, and the next thing anybody wants is to hear it.
  on('toradio', () => { closeBag(); openRadio(); });
}

const spotCard = () => ({
  id: 'spotify',
  name: tr('key.spot.name'),
  state: spotState(),
  word: () => tr('key.spot.' + spotState()),
  icon: spotIcon,
  body: spotBody,
  bind: spotBind,
});

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
  const streamOn = kindOf(st) === 'stream' && !!st;
  // The full player's face belongs to Spotify waves only: on a stream it would show a
  // Spotify track that is not playing.
  const live = radio.sdk && !streamOn;
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
  el.radio.querySelector('.radioglass').hidden = live || streamOn;
  $('#radiolcd').hidden = !streamOn;
  if (streamOn) paintLcd(st);
  const face = $('#radioface');
  face.hidden = !live;
  if (live) {
    $('#facetrack').textContent = track ? track.name : tr('radio.waiting');
    $('#faceartist').textContent = track ? (track.artists || []).map((a) => a.name).join(', ') : '';
    $('#facealbum').textContent = track && track.album ? track.album.name : '';
    paintCover();
  }
  $('#radiovolrow').hidden = !live && !streamOn;
  if (live || streamOn) {
    const v = Math.round((streamOn ? stream.volume : player.volume) * 100);
    $('#radiovol').value = v;
    $('#radiovolpct').textContent = v + '%';
  }

  $('#radiolist').innerHTML = radio.stations.map((s, i) => `<li class="${i === radio.current ? 'now' : ''}">
    <button class="rst" data-i="${i}">${i === radio.current ? '●' : '○'} ${esc(stationName(s))}${i < 9 ? ` <kbd>${i + 1}</kbd>` : ''}</button>
    <span class="rsrc">${tr(kindOf(s) === 'stream' ? 'radio.srcStream' : 'radio.srcSpotify')}</span>
    ${radio.stations.length > 1 ? `<button class="rdel" data-del="${i}" title="${tr('radio.remove')}">✕</button>` : ''}</li>`).join('');
  el.radio.querySelectorAll('.rst').forEach((b) => b.onclick = () => radio.tune(Number(b.dataset.i)));
  el.radio.querySelectorAll('.rdel').forEach((b) => b.onclick = () => radio.remove(Number(b.dataset.del)));
  paintAdding();
  repaintRadioFocus();

  // The line about previews is Spotify's: a stream has nothing to preview, and while an
  // address is being named the line under the buttons is the naming's.
  $('#radioauth').innerHTML = streamOn || adding ? '' : authBlock();
  const tune = $('#radiotune');
  if (tune) tune.onclick = () => { closeRadio(); openKeyCard('spotify'); };

  // A track length of thirty seconds is a sure sign that the built-in player is giving out
  // a preview rather than music: otherwise the break-off looks like a broken radio.
  const preview = !live && radio.duration > 0 && radio.duration <= 35_000;
  $('#radiohint').textContent = adding ? tr('radio.noteAdding')
    : streamOn ? tr('radio.noteStream')
    : player.error || radio.error
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

export function register(a) {
  api = a;
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
  // R opens the receiver; S starts and stops what it is playing, wherever you are.
  // Two separate keys because they are two separate wishes: the panel is for choosing a
  // wave, and «stop the music» is asked for with the panel closed — from the corridor,
  // from an open transcript, from anywhere. Until 6 September 2026 the only answer to it
  // was M, which mutes the whole office, so a person who wanted the music off also lost
  // the doors, the footsteps and the kettle.
  //
  // S is free under both layouts, sits under the left hand while the right one is on the
  // arrows, and reads as start/stop in both languages. It is `act` rather than `panel`:
  // it does something in the world instead of opening a window.
  api.keys([
    { id: 'toggle', codes: ['KeyR'], group: 'panel', hint: 'radio.hint' },
    { id: 'play', codes: ['KeyS'], group: 'act', hint: 'radio.playKey' },
  ]);
  api.on('key', (raw) => radioKey(raw));
  api.on('action', (id) => {
    if (id === 'radio.play') { playPause(); return true; }
    if (id !== 'radio.toggle') return false;
    radioOpen() ? closeRadio() : openRadio();
    return true;
  });
  api.on('keys', () => spotCard());
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
      lead('#radionamerow', tr('radio.nameIt'));
      const say = (sel, text) => { const n = el.radio.querySelector(sel); if (n) n.textContent = text; };
      say('#radiocatch', tr('radio.catch'));
      say('#radiocancel', tr('radio.cancel'));
      const uri = el.radio.querySelector('#radiouri');
      if (uri) uri.placeholder = tr('radio.uriHint');
      paintRadio();
}

export { openRadio, closeRadio, radioOpen, radioKey, repaintRadioFocus };
