import { CHARACTERS, PLAYER, STATS } from '../data/characters.js';
import { esc, sleep } from './UI.js';

const SAVE_KEY = 'hkk_save_v1';
const STAT_KEYS = new Set(['harin', 'sera', 'iseul', 'luna', 'trust', 'scandal']);
const NAME_TO_ID = Object.fromEntries(Object.entries(CHARACTERS).flatMap(([id, c]) => [[id, id], [c.name, id], [c.full, id]]));

export class VN {
  constructor({ cmds, labels }, pano, ui, audio) {
    this.cmds = cmds; this.labels = labels; this.pano = pano; this.ui = ui; this.audio = audio;
    this.labelIdx = Object.entries(labels).sort((a, b) => a[1] - b[1]);
    this.token = 0; this.auto = false; this.skip = false; this.log = [];
    this.waiter = null; // 현재 탭을 기다리는 핸들러
    pano.onTap = (key) => this.waiter?.(key);
    this.reset('도윤');
  }

  reset(playerName) {
    this.vars = { harin: 20, sera: 10, iseul: 10, luna: 0, trust: 30, scandal: 0, fans: 0 };
    this.player = playerName || '도윤';
    this.ip = 0; this.stack = []; this.log = [];
  }

  fmt = (s) => String(s ?? '').replaceAll('{player}', this.player);

  // ---------------- 실행 루프 ----------------
  async start(fromIp = 0) {
    const my = ++this.token;
    this.ip = fromIp;
    while (this.ip < this.cmds.length) {
      if (my !== this.token) return;
      this.cur = this.ip;
      const cmd = this.cmds[this.ip++];
      try { await this.exec(cmd); }
      catch (e) { console.error(`[대본 오류] ${cmd.src}`, e); this.ui.toast(`대본 오류: ${cmd.src}`, 'warn'); }
      if (my !== this.token) return;
    }
  }

  stop() { this.token++; this.waiter = null; }

  jump(label) {
    if (!(label in this.labels)) throw new Error(`라벨 없음: ${label}`);
    this.ip = this.labels[label];
  }

  waitTap() { return new Promise((r) => (this.waiter = (k) => { this.waiter = null; r(k); })); }

  async exec(c) {
    const p = this.pano, ui = this.ui, pos = c.pos || [];
    switch (c.op) {
      case 'say': return this.say(c);
      case 'bg':
        await p.setBackground(pos[0], this.skip ? 0 : c.fade ?? 600);
        if (c.yaw !== undefined || c.pitch !== undefined) p.setView(c.yaw ?? p.yaw, c.pitch ?? 0);
        return;
      case 'view': return p.setView(pos[0] ?? 0, pos[1] ?? 0);
      case 'look': ui.hideTextbox();
        return p.lookTo(c.yaw ?? pos[0] ?? p.yaw, c.pitch ?? pos[1] ?? p.pitch, this.skip ? 0 : c.dur ?? 1000, c.ease, c.dir);
      case 'lock': p.locked = true; return;
      case 'unlock': p.locked = false; return;
      case 'show': {
        const id = NAME_TO_ID[pos[0]] || pos[0];
        return p.showChar(id, pos[1] || c.expr || 'normal', { yaw: c.yaw, dist: c.dist, y: c.y, h: c.h, fade: this.skip ? 0 : c.fade });
      }
      case 'expr': return p.setExpr(NAME_TO_ID[pos[0]] || pos[0], pos[1]);
      case 'hide': return p.hideChar(NAME_TO_ID[pos[0]] || pos[0], this.skip ? 0 : c.fade ?? 300);
      case 'hideall': return p.hideAll(this.skip ? 0 : 300);
      case 'wait': return this.skip ? null : sleep(pos[0] ?? 500);
      case 'shake': ui.shake(); navigator.vibrate?.(90); return;
      case 'bgm': this.audio?.bgm(pos[0]); return;
      case 'sfx': this.audio?.sfx(pos[0]); if (pos[0] === 'vibe') navigator.vibrate?.([150, 80, 150]); return;
      case 'flash': ui.flash(pos[0]); return;
      case 'fade': return ui.fade(pos[0], this.skip ? 0 : pos[1] ?? 600, pos[2]);
      case 'hidebox': ui.hideTextbox(); return;
      case 'chapter':
        this.stopSkip();
        if (c.id) VN.unlockChapter(c.id, { vars: { ...this.vars }, player: this.player });
        this.audio?.sfx('chime');
        return ui.chapter(this.fmt(pos[0]), this.fmt(pos[1]));
      case 'fx': return this.applyFx(c.fx);
      case 'if': if (this.test(c.cond)) this.jump(c.jump); return;
      case 'jump': return this.jump(pos[0]);
      case 'call': this.stack.push(this.ip); return this.jump(pos[0]);
      case 'return': this.ip = this.stack.pop() ?? this.ip; return;
      case 'choice': return this.choice(c);
      case 'explore': return this.explore(c);
      case 'find': return this.find(c);
      case 'phone':
        this.stopSkip(); ui.hideTextbox();
        this.audio?.sfx(c.app === 'kakao' ? 'kakao' : c.app === 'video' ? 'pop' : 'vibe');
        if (c.app !== 'video') navigator.vibrate?.(60);
        return ui.phone(c.app, c.title, c.lines, this.fmt);
      case 'autosave': return this.save(true);
      case 'end': return this.end(c);
      default: console.warn('알 수 없는 명령', c);
    }
  }

  // ---------------- 대사 ----------------
  async say(c) {
    let name = null, color = null;
    if (c.who) {
      if (c.who === '나' || c.who === 'me' || c.who === '{player}') { name = this.player; color = PLAYER.color; }
      else if (NAME_TO_ID[c.who]) {
        const id = NAME_TO_ID[c.who], ch = CHARACTERS[id];
        name = this.vars[`known_${id}`] === false ? '???' : ch.name; color = ch.color;
        if (c.expr) this.pano.setExpr(id, c.expr);
      } else { name = this.fmt(c.who); color = '#6b6478'; }
    }
    const text = this.fmt(c.text);
    this.log.push({ name, text });
    const t = this.ui.type(name, color, text, c.style, this.skip);
    if (this.skip) { await sleep(60); t.finish(); return; }

    // 타이핑 중 탭 → 즉시 완성, 완성 후 탭 → 다음
    await new Promise((resolve) => {
      let autoTimer = null;
      const armAuto = () => { if (this.auto) autoTimer = setTimeout(() => { this.waiter = null; resolve(); }, 1400 + text.length * 45); };
      t.onDone = armAuto;
      if (t.done) armAuto();
      this.waiter = () => {
        if (!t.done) { t.finish(); return; }
        clearTimeout(autoTimer); this.waiter = null; resolve();
      };
      this._kick = () => { if (t.done) { clearTimeout(autoTimer); this.waiter = null; resolve(); } else t.finish(); };
    });
  }

  // ---------------- 선택지 / 탐색 ----------------
  async choice(c) {
    this.stopSkip();
    const opts = c.options.filter((o) => !o.cond || this.test(o.cond));
    const i = await this.ui.choice(opts.map((o) => ({ text: this.fmt(o.text) })), c.timer || 0, c.default ?? -1);
    const o = opts[i];
    this.log.push({ name: '▶', text: o.text });
    this.applyFx(o.fx);
    if (o.jump) this.jump(o.jump);
  }

  async explore(c) {
    this.stopSkip();
    const { label: vl, off: vo } = this.encode(this.cur);
    const vkey = `_v_${vl}_${vo}`;
    const visited = (this.vars[vkey] ||= []);
    const p = this.pano;
    p.locked = false; this.ui.hideTextbox();
    for (const s of c.spots) {
      if (s.jump === '@next' && visited.length < (c.need ?? 0)) continue;
      p.addHotspot(s.jump, s.yaw, s.pitch, this.fmt(s.label), visited.includes(s.jump));
    }
    this.ui.hint(this.fmt(c.hint));
    let key = null;
    while (!key) key = await this.waitTap();
    p.clearHotspots(); this.ui.hint(null);
    const spot = c.spots.find((s) => s.jump === key);
    await p.lookTo(spot.yaw, Math.max(-10, Math.min(10, spot.pitch)), 450, 'out');
    if (key === '@next') { p.locked = true; return; }
    if (!visited.includes(key)) visited.push(key);
    this.stack.push(this.cur); // 서브씬 끝의 @return 이 탐색으로 돌아옴
    p.locked = true;
    this.jump(key);
  }

  async find(c) {
    this.stopSkip();
    const [yaw, pitch, hint] = c.pos; const p = this.pano;
    p.locked = false; this.ui.hideTextbox(); this.ui.hint(this.fmt(hint || '찾아보세요'));
    p.addHotspot('@find', yaw, pitch, this.fmt(c.label || ''));
    await new Promise((resolve) => {
      let held = 0;
      const iv = setInterval(() => {
        held = p.isLookingAt(yaw, pitch, 9) ? held + 100 : 0;
        if (held >= 700) done();
      }, 100);
      const done = () => { clearInterval(iv); this.waiter = null; resolve(); };
      this.waiter = (k) => { if (k === '@find') done(); };
    });
    p.clearHotspots(); this.ui.hint(null); p.locked = true;
    await p.lookTo(yaw, Math.max(-8, Math.min(8, pitch)), 350, 'out');
  }

  // ---------------- 변수 ----------------
  applyFx(fx = []) {
    for (const f of fx) {
      if (f.op === 'set') { this.vars[f.k] = f.v; continue; }
      const before = this.vars[f.k] ?? 0;
      let v = before + f.v;
      if (STAT_KEYS.has(f.k)) v = Math.max(0, Math.min(100, v));
      this.vars[f.k] = v;
      this.notify(f.k, f.v);
    }
  }

  notify(k, d) {
    if (this.skip || !d) return;
    const ch = CHARACTERS[k];
    if (ch) { this.ui.heart(ch.color, d > 0); this.audio?.sfx(d > 0 ? 'heart' : 'down'); navigator.vibrate?.(d > 0 ? 25 : [40, 40, 40]); }
    if (ch) this.ui.toast(d > 0 ? `♥ ${ch.name}의 마음이 움직였다` : `💔 ${ch.name}의 표정이 굳었다`);
    else if (k === 'trust') this.ui.toast(d > 0 ? '🎤 프로듀서로서 신뢰가 올랐다' : '🎤 프로듀서 신뢰가 떨어졌다', 'trust');
    else if (k === 'scandal') this.ui.toast(d > 0 ? '⚠ 스캔들 위험이 높아졌다' : '🛡 스캔들 위험이 줄었다', 'warn');
    else if (k === 'fans') this.ui.toast(`👥 팬 ${d > 0 ? '+' : ''}${d}명`, 'trust');
  }

  test(cond) {
    try { return !!new Function('v', `with (v) { return (${cond}); }`)(new Proxy(this.vars, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : t[k] ?? 0) })); }
    catch (e) { console.warn('조건식 오류', cond, e); return false; }
  }

  // ---------------- 모드 ----------------
  toggleAuto() { this.auto = !this.auto; if (this.auto) this._kick?.(); return this.auto; }
  toggleSkip() { this.skip = !this.skip; if (this.skip) { this.ui.typing?.finish(); this._kick?.(); } return this.skip; }
  stopSkip() { if (this.skip) { this.skip = false; document.querySelector('[data-act=skip]')?.classList.remove('on'); } }

  // ---------------- 세이브 ----------------
  // 저장 위치를 '라벨 + 오프셋'으로 기록 → 대본을 고쳐도 다른 챕터 세이브가 깨지지 않음
  encode(ip) {
    let label = null, base = 0;
    for (const [k, v] of this.labelIdx) { if (v <= ip) { label = k; base = v; } else break; }
    return { label, off: ip - base };
  }
  decode(p) { return typeof p === 'number' ? p : (this.labels[p.label] ?? 0) + p.off; }

  static unlockChapter(id, data) {
    const all = JSON.parse(localStorage.getItem('hkk_chapters') || '{}');
    if (!all[id]) { all[id] = data; localStorage.setItem('hkk_chapters', JSON.stringify(all)); }
  }
  static chapters() { return JSON.parse(localStorage.getItem('hkk_chapters') || '{}'); }

  async startChapter(label, data) {
    this.stop();
    this.vars = { ...data.vars }; this.player = data.player; this.stack = []; this.log = [];
    await this.pano.restore({ bg: this.pano.bgId, yaw: 0, pitch: 0, locked: true, chars: [] });
    this.start(this.labels[label]);
  }

  save(silent = false) {
    const data = { v: 2, pos: this.encode(this.cur), vars: this.vars, stack: this.stack.map((i) => this.encode(i)), player: this.player, pano: this.pano.snapshot(), bgm: this.audio?.trackName, at: Date.now() };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (!silent) this.ui.toast('💾 저장했습니다', 'trust');
  }
  static hasSave() { return !!localStorage.getItem(SAVE_KEY); }
  async load() {
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false;
    const d = JSON.parse(raw);
    this.stop();
    this.vars = d.vars; this.stack = (d.stack || []).map((p) => this.decode(p)); this.player = d.player; this.log = [];
    if (d.bgm) this.audio?.bgm(d.bgm);
    this.ui.hint(null); document.querySelector('#choices').classList.add('hidden');
    document.querySelector('#phone').classList.add('hidden');
    await this.pano.restore(d.pano);
    this.start(this.decode(d.pos ?? d.ip));
    return true;
  }

  // ---------------- 패널 ----------------
  showLog() {
    const html = this.log.slice(-80).map((l) => `<div class="log-line">${l.name ? `<b>${esc(l.name)}</b>` : ''}${esc(l.text)}</div>`).join('');
    this.ui.panel(html || '아직 기록이 없습니다.', (el) => (el.scrollTop = el.scrollHeight));
  }
  showStatus() {
    const html = STATS.map((s) => `<div>${s.label} <b style="float:right">${this.vars[s.key] ?? 0}</b></div><div class="bar"><i style="width:${this.vars[s.key] ?? 0}%;background:${s.color}"></i></div>`).join('')
      + `<div>팬 수 <b style="float:right">${this.vars.fans}명</b></div>`;
    this.ui.panel(`<h3 style="margin-bottom:10px">${esc(this.player)} 프로듀서 노트</h3>${html}`);
  }

  async end(c) {
    this.ui.hideTextbox(); this.audio?.bgm('stop');
    await this.ui.fade('out', 1200);
    await this.ui.chapter(this.fmt(c.pos[0] || 'TO BE CONTINUED'), this.fmt(c.pos[1] || ''));
    this.ui.panel(`<h3>${esc(this.fmt(c.pos[0] || ''))}</h3><p style="margin-top:8px">플레이해 주셔서 감사합니다!</p>` +
      STATS.map((s) => `<div style="margin-top:6px">${s.label}: <b>${this.vars[s.key]}</b></div>`).join(''));
    document.querySelector('#panel-close').onclick = () => location.reload();
  }
}
