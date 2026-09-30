// DOM 기반 UI (대사창, 선택지, 폰, 토스트, 패널)
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class UI {
  constructor() {
    this.app = $('#app'); this.box = $('#textbox'); this.name = $('#nameplate'); this.text = $('#text');
    this.typing = null; this.speed = 28; // ms per char
  }

  showGameUI(on) { this.box.classList.toggle('hidden', !on); $('#topbar').classList.toggle('hidden', !on); }

  // ---------- 대사 ----------
  /** 타이핑 시작. 반환된 객체의 finish()로 즉시 완성 */
  type(name, color, text, style, fast = false) {
    this.box.classList.remove('hidden', 'done');
    if (name) { this.name.textContent = name; this.name.style.background = color; this.name.classList.remove('hidden'); }
    else this.name.classList.add('hidden');
    this.text.className = style || (name ? '' : 'narr');
    const chars = [...text];
    let i = 0, done = false, timer = null;
    const state = {
      get done() { return done; },
      finish: () => { if (done) return; clearTimeout(timer); this.text.textContent = text; done = true; this.box.classList.add('done'); state.onDone?.(); },
      onDone: null,
    };
    const step = () => {
      if (done) return;
      i += fast ? 6 : 1;
      this.text.textContent = chars.slice(0, i).join('');
      if (i >= chars.length) state.finish();
      else timer = setTimeout(step, chars[i - 1] === '.' || chars[i - 1] === '…' ? this.speed * 4 : this.speed);
    };
    this.text.textContent = '';
    step();
    this.typing = state;
    return state;
  }

  hideTextbox() { this.box.classList.add('hidden'); }

  // ---------- 선택지 ----------
  choice(options, timer = 0, def = -1) {
    const el = $('#choices'); el.innerHTML = ''; el.classList.remove('hidden');
    return new Promise((resolve) => {
      let t = null;
      const pick = (i) => { clearTimeout(t); el.classList.add('hidden'); el.innerHTML = ''; resolve(i); };
      if (timer) {
        const lab = document.createElement('div'); lab.className = 'timer-label'; lab.textContent = '⏱ 빨리 결정해!';
        const bar = document.createElement('div'); bar.className = 'timer';
        bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: timer, fill: 'forwards' });
        el.append(lab, bar);
        t = setTimeout(() => pick(def < 0 ? options.length - 1 : def), timer);
      }
      options.forEach((o, i) => {
        const b = document.createElement('button'); b.textContent = o.text;
        b.style.animationDelay = `${i * 70}ms`;
        b.onclick = (e) => { e.stopPropagation(); pick(i); };
        el.append(b);
      });
    });
  }

  // ---------- 폰 ----------
  async phone(app, title, lines, fmt) {
    const ph = $('#phone'), content = $('#phone-content');
    ph.className = `app-${app}`; $('#phone-title').textContent = fmt(title);
    content.innerHTML = '';
    const nodes = this._phoneNodes(app, lines, fmt);
    let shown = 0, closed = false;
    return new Promise((resolve) => {
      const reveal = async () => {
        while (shown < nodes.length && !closed) {
          content.append(nodes[shown++]); content.scrollTop = content.scrollHeight;
          // 넘치면 오래된 것부터 밀어냄
          while (content.scrollHeight > content.clientHeight + 4 && content.children.length > 1 && app !== 'video') content.firstElementChild.remove();
          await sleep(app === 'video' ? 0 : app === 'memo' ? 260 : 650);
        }
      };
      reveal();
      ph.onclick = (e) => {
        e.stopPropagation();
        if (shown < nodes.length) { while (shown < nodes.length) content.append(nodes[shown++]);
          while (content.scrollHeight > content.clientHeight + 4 && content.children.length > 1 && app !== 'video') content.firstElementChild.remove();
          return; }
        closed = true; ph.classList.add('hidden'); ph.onclick = null; resolve();
      };
    });
  }

  _phoneNodes(app, lines, fmt) {
    const div = (cls, html) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
    if (app === 'video') {
      const cap = lines.map((l) => esc(fmt(l.replace(/^캡션:\s*/, '')))).join('<br>');
      return [div('fancam', `<div class="beam a"></div><div class="beam b"></div><div class="rec">직캠 4K</div><div class="idol"></div><div class="cap">${cap}</div>`)];
    }
    if (app === 'memo') return lines.map((raw) => { const l = fmt(raw); return div(l.startsWith('# ') ? 'memo-h' : 'memo-line', esc(l.replace(/^# /, ''))); });
    const out = []; let post = null;
    for (const raw of lines) {
      const l = fmt(raw);
      let m;
      if (l.startsWith('> ')) out.push(div('msg me', esc(l.slice(2))));
      else if (l.startsWith('= ')) out.push(div('msg sys', esc(l.slice(2))));
      else if ((m = l.match(/^<\s*([^:]+):\s*(.*)$/))) out.push(div('msg them', `<div class="who">${esc(m[1])}</div>${esc(m[2])}`));
      else if ((m = l.match(/^\*\s*([^:]+):\s*(.*)$/))) out.push(div('gal-cmt', `<b>${esc(m[1])}</b>${esc(m[2])}`));
      else if ((m = l.match(/^제목:\s*(.*)$/))) { post = div('gal-post', `<div class="t">${esc(m[1])}</div>`); out.push(post); }
      else if ((m = l.match(/^작성자:\s*(.*)$/)) && post) post.insertAdjacentHTML('beforeend', `<div class="m">${esc(m[1])}</div>`);
      else if ((m = l.match(/^본문:\s*(.*)$/)) && post) post.insertAdjacentHTML('beforeend', `<div>${esc(m[1])}</div>`);
      else out.push(div('msg sys', esc(l)));
    }
    return out;
  }

  // ---------- 연출 ----------
  hint(text) { const h = $('#hint'); if (!text) return h.classList.add('hidden'); h.textContent = text; h.classList.remove('hidden'); }

  toast(text, kind = '') {
    const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = text;
    $('#toasts').append(t); setTimeout(() => t.remove(), 2900);
  }

  async chapter(title, sub, fast) {
    const c = $('#chapter'); c.querySelector('.ch-title').textContent = title; c.querySelector('.ch-sub').textContent = sub || '';
    c.classList.remove('hidden'); this.hideTextbox();
    await sleep(fast ? 300 : 2600);
    c.classList.add('hidden');
  }

  fade(to, ms = 600, color = '#000') {
    const f = $('#fade'); f.style.background = color; f.style.transition = `opacity ${ms}ms`;
    f.style.opacity = to === 'out' ? 1 : 0;
    return sleep(ms);
  }

  flash(color = '#fff') {
    const f = $('#flash'); f.style.background = color;
    f.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 500 });
  }

  heart(color, up = true) {
    for (let i = 0; i < (up ? 5 : 1); i++) {
      const h = document.createElement('div'); h.className = 'heart-fx' + (up ? '' : ' broken');
      h.textContent = up ? '♥' : '💔'; h.style.color = color;
      h.style.left = `${42 + Math.random() * 16}%`; h.style.animationDelay = `${i * 90}ms`;
      h.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
      this.app.append(h); setTimeout(() => h.remove(), 1800);
    }
  }

  shake() { this.app.classList.remove('shake'); void this.app.offsetWidth; this.app.classList.add('shake'); }

  // ---------- 패널 ----------
  panel(html, onBind) {
    $('#panel-content').innerHTML = html; $('#panel').classList.remove('hidden');
    $('#panel-close').onclick = () => $('#panel').classList.add('hidden');
    onBind?.($('#panel-content'));
  }
  closePanel() { $('#panel').classList.add('hidden'); }
}
export { esc, sleep };
