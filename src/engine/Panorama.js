import * as THREE from 'three';
import { makeBackgroundCanvas, makeCharCanvas } from './placeholders.js';
import { CHARACTERS } from '../data/characters.js';

const DEG = Math.PI / 180;
const BASE = import.meta.env.BASE_URL;
const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
};

function dirOf(yaw, pitch) {
  const y = yaw * DEG, p = pitch * DEG;
  return new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
}
const normYaw = (y) => ((y % 360) + 540) % 360 - 180;

function loadImageTexture(url) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(url, (t) => resolve(t), undefined, () => resolve(null));
  });
}

export class Panorama {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    this.yaw = 0; this.pitch = 0; this.locked = true;
    this.vel = 0; this.tweens = [];
    this.bgCache = new Map(); this.texCache = new Map();
    this.chars = new Map(); this.hotspots = [];
    this.bgId = null;
    this.onTap = () => {};

    const geo = new THREE.SphereGeometry(100, 64, 40); geo.scale(-1, 1, 1);
    const geoB = new THREE.SphereGeometry(90, 64, 40); geoB.scale(-1, 1, 1);
    this.sphereA = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
    this.sphereB = new THREE.Mesh(geoB, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    for (const s of [this.sphereA, this.sphereB]) { s.rotation.y = -Math.PI / 2; this.scene.add(s); }
    this.sphereB.visible = false;

    this.raycaster = new THREE.Raycaster();
    this._bindInput();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this.t0 = performance.now();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ---------------- 배경 ----------------
  async _bgTexture(id) {
    if (this.bgCache.has(id)) return this.bgCache.get(id);
    let tex = await loadImageTexture(`${BASE}assets/bg/${id}.jpg`);
    if (!tex) tex = new THREE.CanvasTexture(makeBackgroundCanvas(id));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.bgCache.set(id, tex);
    return tex;
  }

  async setBackground(id, fade = 600) {
    const tex = await this._bgTexture(id);
    this.bgId = id;
    const A = this.sphereA.material, B = this.sphereB.material;
    if (!fade || !A.map) {
      A.map = tex; A.color.set(0xffffff); A.needsUpdate = true; return;
    }
    B.map = tex; B.needsUpdate = true; B.opacity = 0; this.sphereB.visible = true;
    await this.tween(fade, (k) => (B.opacity = k), 'linear');
    A.map = tex; A.needsUpdate = true; this.sphereB.visible = false; B.opacity = 0;
  }

  // ---------------- 카메라 ----------------
  setView(yaw, pitch = this.pitch) { this.yaw = yaw; this.pitch = pitch; this.vel = 0; }

  lookTo(yaw, pitch = this.pitch, dur = 1000, easing = 'inOut', dir = 'short') {
    const from = this.yaw, fromP = this.pitch;
    let delta = normYaw(yaw - from);
    if (dir === 'right' && delta < 0) delta += 360;
    if (dir === 'left' && delta > 0) delta -= 360;
    this.vel = 0;
    return this.tween(dur, (k) => { this.yaw = from + delta * k; this.pitch = fromP + (pitch - fromP) * k; }, easing);
  }

  isLookingAt(yaw, pitch, tol = 14) {
    return Math.abs(normYaw(this.yaw - yaw)) < tol && Math.abs(this.pitch - pitch) < tol * 1.2;
  }

  tween(dur, fn, easing = 'inOut') {
    return new Promise((resolve) => {
      if (dur <= 0) { fn(1); resolve(); return; }
      this.tweens.push({ t0: performance.now(), dur, fn, e: ease[easing] || ease.inOut, resolve });
    });
  }

  // ---------------- 캐릭터 ----------------
  async _charTexture(id, expr) {
    const key = `${id}_${expr}`;
    if (this.texCache.has(key)) return this.texCache.get(key);
    let tex = await loadImageTexture(`${BASE}assets/char/${key}.png`);
    if (!tex && expr !== 'normal') tex = await loadImageTexture(`${BASE}assets/char/${id}_normal.png`);
    if (!tex) tex = new THREE.CanvasTexture(makeCharCanvas(CHARACTERS[id] || { name: id, art: CHARACTERS.harin.art }, expr));
    tex.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(key, tex);
    return tex;
  }

  async showChar(id, expr = 'normal', o = {}) {
    const yaw = o.yaw ?? this.yaw, dist = o.dist ?? 5.5, h = o.h ?? 7, y = o.y ?? -1.3;
    let c = this.chars.get(id);
    const tex = await this._charTexture(id, expr);
    if (!c) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, alphaTest: 0.01 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h / 2, h), mat);
      mesh.renderOrder = 10;
      this.scene.add(mesh);
      c = { id, mesh, expr, yaw, dist, y, h };
      this.chars.set(id, c);
    } else {
      c.mesh.material.map = tex; c.mesh.material.needsUpdate = true;
    }
    Object.assign(c, { expr, yaw, dist, y });
    if (c.h !== h) { c.mesh.geometry.dispose(); c.mesh.geometry = new THREE.PlaneGeometry(h / 2, h); c.h = h; }
    const p = dirOf(yaw, 0).multiplyScalar(dist); p.y = y;
    c.mesh.position.copy(p); c.mesh.lookAt(0, y, 0);
    const mat = c.mesh.material;
    if (mat.opacity < 1) {
      const start = mat.opacity, fade = o.fade ?? 350;
      await this.tween(fade, (k) => { mat.opacity = start + (1 - start) * k; c.mesh.position.y = y - 0.25 * (1 - k); }, 'out');
    }
  }

  async setExpr(id, expr) {
    const c = this.chars.get(id); if (!c || c.expr === expr) return;
    c.expr = expr;
    c.mesh.material.map = await this._charTexture(id, expr); c.mesh.material.needsUpdate = true;
  }

  async hideChar(id, fade = 300) {
    const c = this.chars.get(id); if (!c) return;
    this.chars.delete(id);
    const mat = c.mesh.material, s = mat.opacity;
    await this.tween(fade, (k) => (mat.opacity = s * (1 - k)), 'linear');
    this.scene.remove(c.mesh); c.mesh.geometry.dispose(); mat.dispose();
  }

  hideAll(fade = 300) { return Promise.all([...this.chars.keys()].map((id) => this.hideChar(id, fade))); }

  // ---------------- 핫스팟 (탐색) ----------------
  addHotspot(key, yaw, pitch, label, visited = false) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.strokeStyle = visited ? 'rgba(200,200,200,.6)' : '#ff4d8d'; g.lineWidth = 12;
    g.beginPath(); g.arc(256, 80, 56, 0, Math.PI * 2); g.stroke();
    g.fillStyle = visited ? 'rgba(200,200,200,.35)' : 'rgba(255,77,141,.45)'; g.beginPath(); g.arc(256, 80, 34, 0, 7); g.fill();
    g.font = '800 40px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.8)';
    const t = (visited ? '✓ ' : '') + (label || '');
    g.strokeText(t, 256, 200); g.fillStyle = '#fff'; g.fillText(t, 256, 200);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.position.copy(dirOf(yaw, pitch).multiplyScalar(8));
    sp.scale.set(2.4, 1.2, 1); sp.renderOrder = 20; sp.userData = { key, base: 2.4, visited };
    this.scene.add(sp); this.hotspots.push(sp);
  }

  clearHotspots() {
    for (const s of this.hotspots) { this.scene.remove(s); s.material.map.dispose(); s.material.dispose(); }
    this.hotspots = [];
  }

  // ---------------- 저장용 스냅샷 ----------------
  snapshot() {
    return {
      bg: this.bgId, yaw: this.yaw, pitch: this.pitch, locked: this.locked,
      chars: [...this.chars.values()].map(({ id, expr, yaw, dist, y, h }) => ({ id, expr, yaw, dist, y, h })),
    };
  }
  async restore(s) {
    this.clearHotspots();
    for (const id of [...this.chars.keys()]) await this.hideChar(id, 0);
    if (s.bg) await this.setBackground(s.bg, 0);
    this.setView(s.yaw, s.pitch); this.locked = s.locked;
    for (const c of s.chars) await this.showChar(c.id, c.expr, { ...c, fade: 0 });
  }

  // ---------------- 내부 ----------------
  _bindInput() {
    const el = this.renderer.domElement;
    let down = null, last = null;
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() }; last = { ...down };
      el.setPointerCapture(e.pointerId); this.vel = 0;
    });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      const now = performance.now();
      if (!this.locked && this.tweens.length === 0) {
        const sens = this.camera.fov / el.clientHeight;
        this.yaw -= dx * sens; this.pitch = Math.max(-80, Math.min(80, this.pitch + dy * sens));
        this.vel = (-dx * sens) / Math.max(1, now - last.t) * 16;
      }
      last = { x: e.clientX, y: e.clientY, t: now };
    });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (moved < 10 && dt < 500) this.onTap(this._pick(e));
    });
    el.addEventListener('pointercancel', () => (down = null));
  }

  _pick(e) {
    if (!this.hotspots.length) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.hotspots)[0];
    return hit ? hit.object.userData.key : null;
  }

  _resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 78 : 62; // 세로 화면은 시야각을 넓게
    this.camera.updateProjectionMatrix();
  }

  _frame() {
    const now = performance.now(), t = (now - this.t0) / 1000;
    this.tweens = this.tweens.filter((tw) => {
      const k = Math.min(1, (now - tw.t0) / tw.dur);
      tw.fn(tw.e(k));
      if (k >= 1) { tw.resolve(); return false; }
      return true;
    });
    if (!this.locked && Math.abs(this.vel) > 0.01 && !this.tweens.length) { this.yaw += this.vel; this.vel *= 0.92; }
    // 잠금 상태에서는 아주 약한 호흡 흔들림
    const sway = this.locked ? Math.sin(t * 0.7) * 0.25 : 0;
    const d = dirOf(this.yaw + sway, this.pitch + Math.sin(t * 0.9) * 0.15);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(d);
    for (const s of this.hotspots) {
      const k = s.userData.base * (1 + Math.sin(t * 4) * 0.06);
      s.scale.set(k, k / 2, 1);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
