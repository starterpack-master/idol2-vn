// Web Audio로 직접 합성하는 BGM / 효과음 (외부 음원 파일 없이 동작)
// 나중에 실제 음원을 쓰려면 public/assets/bgm/{이름}.mp3 를 넣으면 그걸 우선 재생한다.
const BASE = import.meta.env.BASE_URL;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const triad = ([root, q]) => [root, root + (q === 'm' ? 3 : 4), root + 7];

// 트랙 정의: bpm, 코드 진행(4마디), 리드/베이스/드럼 패턴
const TRACKS = {
  daily: { // 학교 일상 — 밝은 팝
    bpm: 112, chords: [[48, 'M'], [43, 'M'], [45, 'm'], [41, 'M']], lead: 'square', leadVol: 0.035,
    melody: [72,0,76,0,79,0,76,0,74,0,72,0,74,76,0,0, 74,0,79,0,83,0,79,0,77,0,76,0,74,0,0,0,
             72,0,76,0,81,0,79,0,76,0,74,0,72,0,0,0, 69,0,72,0,77,0,76,0,74,0,72,0,71,0,0,0],
    drums: { k: [0, 8, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] }, bass: [0, 6, 8, 14], pad: 0.02,
  },
  rooftop: { // 노을/감성
    bpm: 84, chords: [[41, 'M'], [43, 'M'], [40, 'm'], [45, 'm']], lead: 'triangle', leadVol: 0.06,
    melody: [0,0,72,0,0,0,74,0,76,0,0,0,74,0,72,0, 0,0,71,0,0,0,72,0,74,0,0,0,79,0,0,0,
             0,0,76,0,0,0,74,0,72,0,0,0,71,0,67,0, 0,0,69,0,0,0,72,0,76,0,0,0,0,0,0,0],
    drums: { k: [0, 10], s: [8], h: [4, 12] }, bass: [0, 10], pad: 0.035,
  },
  night: { // 밤, 방 — 잔잔
    bpm: 70, chords: [[45, 'm'], [41, 'M'], [48, 'M'], [43, 'M']], lead: 'sine', leadVol: 0.06, arp: true,
    drums: { k: [], s: [], h: [8] }, bass: [0], pad: 0.04,
  },
  tension: { // 긴장
    bpm: 92, chords: [[38, 'm'], [38, 'm'], [34, 'M'], [33, 'M']], lead: 'sawtooth', leadVol: 0.018,
    melody: [0,0,0,0,62,0,0,0,0,0,0,0,61,0,0,0, 0,0,0,0,62,0,0,0,0,0,65,0,64,0,0,0,
             0,0,0,0,62,0,0,0,0,0,0,0,58,0,0,0, 0,0,0,0,57,0,0,0,61,0,0,0,0,0,0,0],
    drums: { k: [0, 3], s: [], h: [] }, bass: [0, 2, 4, 6, 8, 10, 12, 14], pad: 0.03,
  },
  live: { // 라이브하우스 — 아이돌 업템포
    bpm: 150, chords: [[41, 'M'], [43, 'M'], [40, 'm'], [45, 'm']], lead: 'square', leadVol: 0.03,
    melody: [77,0,77,79,81,0,79,77,76,0,74,0,72,0,74,76, 79,0,79,81,83,0,81,79,77,0,76,0,74,0,76,77,
             79,0,79,81,83,0,84,83,81,0,79,0,76,0,77,79, 81,0,81,0,79,0,77,0,76,0,74,0,76,0,0,0],
    drums: { k: [0, 4, 8, 12], s: [4, 12], h: [2, 6, 10, 14] }, bass: [0, 2, 4, 6, 8, 10, 12, 14], pad: 0.015,
  },
};

export class Audio {
  constructor() {
    this.ctx = null; this.muted = localStorage.getItem('hkk_mute') === '1';
    this.track = null; this.trackName = null; this.timer = null; this.el = null;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(this.ctx.destination);
    this.bgmBus = this.ctx.createGain(); this.bgmBus.gain.value = 0.5; this.bgmBus.connect(this.master);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    const len = this.ctx.sampleRate; this.noise = this.ctx.createBuffer(1, len, len);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.pending) { const p = this.pending; this.pending = null; this.bgm(p); }
  }

  setMuted(m) {
    this.muted = m; localStorage.setItem('hkk_mute', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    if (this.el) this.el.muted = m;
  }

  // ---------------- BGM ----------------
  async bgm(name) {
    if (name === this.trackName) return;
    this.stopBgm();
    this.trackName = name;
    if (!name || name === 'stop') { this.trackName = null; return; }
    if (!this.ctx) { this.pending = name; return; }
    // 실제 음원 파일이 있으면 우선 사용
    const el = new window.Audio(`${BASE}assets/bgm/${name}.mp3`);
    el.loop = true; el.volume = 0.5; el.muted = this.muted;
    const ok = await el.play().then(() => true).catch(() => false);
    if (this.trackName !== name) { el.pause(); return; }
    if (ok) { this.el = el; return; }
    const t = TRACKS[name]; if (!t) return;
    this.track = t; this.step = 0; this.next = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this._schedule(), 40);
  }

  stopBgm() {
    clearInterval(this.timer); this.timer = null; this.track = null;
    if (this.el) { this.el.pause(); this.el = null; }
  }

  _schedule() {
    const t = this.track, c = this.ctx; if (!t) return;
    const dt = 60 / t.bpm / 4;
    while (this.next < c.currentTime + 0.2) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % t.chords.length;
      const chord = triad(t.chords[bar]), at = this.next;
      if (s === 0) for (const n of chord) this._tone(mtof(n + 12), at, dt * 16, 'triangle', t.pad, this.bgmBus, 0.3, 0.6);
      if (t.bass.includes(s)) this._tone(mtof(chord[0] - 12 + (s % 4 === 2 && t.bpm > 140 ? 12 : 0)), at, dt * 1.8, 'triangle', 0.12, this.bgmBus, 0.005, 0.1);
      const mel = t.arp ? (s % 2 === 0 ? chord[(s / 2) % 3] + 24 : 0) : t.melody[(bar * 16 + s) % t.melody.length];
      if (mel) this._tone(mtof(mel), at, dt * (t.arp ? 3 : 1.6), t.lead, t.leadVol, this.bgmBus, 0.01, 0.12);
      if (t.drums.k.includes(s)) this._kick(at, this.bgmBus, 0.45);
      if (t.drums.s.includes(s)) this._noise(at, 0.12, 'bandpass', 1800, 0.18, this.bgmBus);
      if (t.drums.h.includes(s)) this._noise(at, 0.03, 'highpass', 7000, 0.06, this.bgmBus);
      this.next += dt; this.step++;
    }
  }

  // ---------------- 합성 유닛 ----------------
  _tone(freq, at, dur, type, vol, bus, attack = 0.01, release = 0.1, freqEnd) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, at + dur);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.setTargetAtTime(0, at + Math.max(attack, dur - release), release / 3);
    o.connect(g).connect(bus); o.start(at); o.stop(at + dur + release * 2);
  }
  _kick(at, bus, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(40, at + 0.12);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
    o.connect(g).connect(bus); o.start(at); o.stop(at + 0.3);
  }
  _noise(at, dur, ftype, freq, vol, bus, freqEnd) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = ftype; f.frequency.setValueAtTime(freq, at);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, at + dur);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    s.connect(f).connect(g).connect(bus); s.start(at, Math.random() * 0.5); s.stop(at + dur + 0.05);
  }

  // ---------------- 효과음 ----------------
  sfx(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, b = this.sfxBus;
    switch (name) {
      case 'door': this._noise(t, 0.9, 'lowpass', 600, 0.25, b, 150); this._tone(140, t, 0.7, 'sawtooth', 0.05, b, 0.05, 0.2, 70); break;
      case 'vibe': for (let i = 0; i < 3; i++) this._tone(70, t + i * 0.22, 0.14, 'square', 0.12, b, 0.005, 0.02); break;
      case 'kakao': this._tone(1318, t, 0.12, 'sine', 0.2, b); this._tone(1568, t + 0.13, 0.2, 'sine', 0.2, b); break;
      case 'pop': this._tone(880, t, 0.08, 'sine', 0.2, b, 0.005, 0.05, 1320); break;
      case 'heart': [72, 76, 79, 84].forEach((n, i) => this._tone(mtof(n), t + i * 0.06, 0.18, 'triangle', 0.14, b)); break;
      case 'down': [72, 68, 65].forEach((n, i) => this._tone(mtof(n), t + i * 0.08, 0.2, 'triangle', 0.12, b)); break;
      case 'shock': this._tone(500, t, 0.45, 'sawtooth', 0.12, b, 0.005, 0.2, 90); this._noise(t, 0.3, 'lowpass', 2000, 0.2, b); break;
      case 'crowd': this._noise(t, 2.2, 'bandpass', 900, 0.12, b, 700); break;
      case 'step': [0, 0.35].forEach((d) => this._kick(t + d, b, 0.25)); break;
      case 'chime': [79, 76, 72, 67].forEach((n, i) => this._tone(mtof(n), t + i * 0.35, 0.8, 'sine', 0.12, b, 0.01, 0.4)); break;
      case 'type': this._tone(1500, t, 0.02, 'square', 0.015, b, 0.001, 0.01); break;
      default: console.warn('sfx 없음', name);
    }
  }
}
