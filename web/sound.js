// Tiny WebAudio kit: keyboards clattering nearby, rain behind the glass, thunder.
// Nothing is created until the first click or keypress — browsers demand a gesture.
const KEY = 'valey-sound';

export const sound = {
  on: localStorage.getItem(KEY) !== '0',
  ctx: null, master: null, rainGain: null, ready: false, ducked: false,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.on ? this.level() : 0;
    this.master.connect(ctx.destination);

    // rain bed: looping filtered noise, silent until the sky says otherwise
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1400;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    src.connect(lp); lp.connect(this.rainGain); this.rainGain.connect(this.master);
    src.start();
    this.ready = true;
  },

  toggle() {
    this.on = !this.on;
    localStorage.setItem(KEY, this.on ? '1' : '0');
    this.init();
    if (this.master) this.master.gain.setTargetAtTime(this.on ? this.level() : 0, this.ctx.currentTime, 0.05);
    return this.on;
  },

  // Пока играет музыка, офис отходит на второй план: клавиши и дождь становятся
  // тише. Зовёт это тот, кто её играет, — сейчас модуль радио.
  duck(on) {
    if (on === this.ducked) return;
    this.ducked = on;
    if (this.ready && this.on) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.4);
  },

  level() { return this.ducked ? 0.18 : 0.5; },

  // one key of a mechanical keyboard, somewhere in the room
  key(vol = 0.3, bright = 1) {
    if (!this.ready || !this.on) return;
    const c = this.ctx, now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime((900 + Math.random() * 900) * bright, now);
    osc.frequency.exponentialRampToValueAtTime(180 * bright, now + 0.035);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06 * vol, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05 + Math.random() * 0.03);
    osc.connect(bp); bp.connect(g); g.connect(this.master);
    osc.start(now); osc.stop(now + 0.12);
  },

  // a footfall: wooden floor in the rooms, runner or tile in the corridor
  step(vol = 1, surface = 'wood') {
    if (!this.ready || !this.on) return;
    const c = this.ctx, now = c.currentTime;
    const tone = { wood: 190, tile: 240, carpet: 130 }[surface] || 190;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(tone * (0.9 + Math.random() * 0.2), now);
    osc.frequency.exponentialRampToValueAtTime(tone * 0.55, now + 0.07);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.05 * vol, now + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(og); og.connect(this.master);
    osc.start(now); osc.stop(now + 0.14);

    // scuff of the sole, skipped on carpet
    if (surface !== 'carpet') {
      const len = Math.floor(c.sampleRate * 0.06);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
      const src = c.createBufferSource(); src.buffer = buf;
      const hp = c.createBiquadFilter();
      hp.type = 'bandpass'; hp.frequency.value = surface === 'tile' ? 2600 : 1500; hp.Q.value = 0.7;
      const g = c.createGain(); g.gain.value = 0.035 * vol;
      src.connect(hp); hp.connect(g); g.connect(this.master);
      src.start(now);
    }
  },

  // hinges of an office door, plus the soft clack of the frame
  door(vol = 1) {
    if (!this.ready || !this.on) return;
    const c = this.ctx, now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const base = 300 + Math.random() * 120;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.linearRampToValueAtTime(base * 0.55, now + 0.26);
    const wob = c.createOscillator(); wob.type = 'sine'; wob.frequency.value = 22;
    const wobGain = c.createGain(); wobGain.gain.value = 26;
    wob.connect(wobGain); wobGain.connect(osc.frequency);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.03 * vol, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(bp); bp.connect(g); g.connect(this.master);
    osc.start(now); wob.start(now);
    osc.stop(now + 0.34); wob.stop(now + 0.34);

    const len = Math.floor(c.sampleRate * 0.09);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
    const src = c.createBufferSource(); src.buffer = buf;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const cg = c.createGain(); cg.gain.value = 0.05 * vol;
    src.connect(lp); lp.connect(cg); cg.connect(this.master);
    src.start(now + 0.3);
  },

  // water falling into a paper cup, then the glug of the bottle
  pour(vol = 1) {
    if (!this.ready || !this.on) return;
    const c = this.ctx, now = c.currentTime;
    const len = Math.floor(c.sampleRate * 1.1);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, (len - i) / len * 1.4);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(2600, now);
    bp.frequency.linearRampToValueAtTime(1500, now + 1.0);   // the cup fills up
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05 * vol * this.level() * 2, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(now);
  },

  // one swallow
  gulp(vol = 1) {
    if (!this.ready || !this.on) return;
    const c = this.ctx, now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150 + Math.random() * 40, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.13);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.07 * vol, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(g); g.connect(this.master);
    osc.start(now); osc.stop(now + 0.2);
  },

  // the bottle burping a bubble back
  bubble(vol = 1) {
    if (!this.ready || !this.on) return;
    const c = this.ctx, now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320 + Math.random() * 160, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.035 * vol, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    osc.connect(g); g.connect(this.master);
    osc.start(now); osc.stop(now + 0.14);
  },

  // someone finished something
  // лифт: створки — сухой шорох с лязгом, приезд — две ноты вниз, как в кабине
  lift(kind, vol = 1) {
    if (!this.ready || !this.on) return;
    const c = this.ctx, now = c.currentTime;
    if (kind === 'ding') {
      [1046, 784].forEach((f, i) => {
        const osc = c.createOscillator(); osc.type = 'sine';
        osc.frequency.value = f;
        const g = c.createGain();
        const at = now + i * 0.14;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.06 * vol, at + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
        osc.connect(g); g.connect(this.master);
        osc.start(at); osc.stop(at + 0.75);
      });
      return;
    }
    // ход кабины и створки — узкополосный шум, у створок короче и выше
    const long = kind === 'move';
    const dur = long ? 0.9 : 0.32;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const k = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.min(1, k * 8) * (1 - k) ** 1.5;
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = long ? 180 : 520; bp.Q.value = long ? 1.2 : 2.4;
    const g = c.createGain(); g.gain.value = (long ? 0.055 : 0.04) * vol;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(now);
  },

  chime() {
    if (!this.ready || !this.on) return;
    const c = this.ctx, now = c.currentTime;
    [880, 1320].forEach((f, i) => {
      const osc = c.createOscillator(); osc.type = 'triangle';
      osc.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.07, now + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.5);
      osc.connect(g); g.connect(this.master);
      osc.start(now + i * 0.09); osc.stop(now + i * 0.09 + 0.6);
    });
  },

  // Пейджер: два коротких писка квадратной волной. Не chime — тот мягкий и
  // сообщает о хорошем, а этот должен подобрать голову от чужого окна. Звук
  // включён по умолчанию, как и весь остальной офис: выключается на M, вместе
  // со всем прочим, и это единственный переключатель.
  pager() {
    if (!this.ready || !this.on) return;
    const c = this.ctx, now = c.currentTime;
    for (let i = 0; i < 2; i++) {
      const at = now + i * 0.16;
      const osc = c.createOscillator(); osc.type = 'square';
      osc.frequency.setValueAtTime(1720, at);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05, at + 0.008);
      g.gain.setValueAtTime(0.05, at + 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
      osc.connect(g); g.connect(this.master);
      osc.start(at); osc.stop(at + 0.14);
    }
  },

  thunder(strength = 1) {
    if (!this.ready || !this.on) return;
    const c = this.ctx, now = c.currentTime;
    const len = c.sampleRate * 1.6;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = c.createBufferSource(); src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, now);
    lp.frequency.exponentialRampToValueAtTime(90, now + 1.4);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now + 0.25);
    g.gain.exponentialRampToValueAtTime(0.32 * strength, now + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(now + 0.2);
  },

  rain(level) {
    if (!this.ready) return;
    this.rainGain.gain.setTargetAtTime(Math.max(0, Math.min(0.5, level)), this.ctx.currentTime, 0.4);
  },
};

const RAIN_BED = { rain: 0.24, storm: 0.34, snow: 0.05, fog: 0.02, clouds: 0, clear: 0 };

// Called every frame: keyboards near the player, rain louder by the windows.
export function tickSound(state, dt, weather) {
  if (!sound.ready || !sound.on) return;
  const p = state.player;

  for (const act of state.actors.values()) {
    const a = state.agents.find((x) => x.id === act.id);
    if (!a) continue;
    const dist = Math.hypot(act.x - p.x, act.y - p.y);

    if (a.status === 'working' && act.state === 'sit' && dist < 150) {
      const near = 1 - dist / 150;
      if (Math.random() < 0.055 * dt * near) sound.key(near * near, 0.8 + (act.id.charCodeAt(0) % 5) / 10);
    }
    // someone walking past you
    if (act.state === 'walk' && dist < 110) {
      const near = 1 - dist / 110;
      if (Math.random() < 0.035 * dt * near) sound.step(near * 0.5, 'wood');
    }
  }

  const bed = RAIN_BED[weather.kind] || 0;
  const outside = p.y < 150 ? 1 : 0.32;          // corridors run along the windows
  sound.rain(bed * weather.intensity * outside);
}
