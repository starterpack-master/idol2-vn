// 실제 이미지가 없을 때 쓰는 자동 생성 플레이스홀더 (equirectangular 배경 + 스탠딩)
import { BACKGROUNDS } from '../data/backgrounds.js';

const W = 4096, H = 2048;
const X = (yaw) => ((0.5 + yaw / 360) % 1 + 1) % 1 * W;
const Y = (pitch) => (0.5 - pitch / 180) * H;

function wrapRect(ctx, yaw, wDeg, top, bot, draw) {
  const w = (wDeg / 360) * W, x = X(yaw) - w / 2, y = Y(top), h = Y(bot) - Y(top);
  for (const off of [-W, 0, W]) {
    if (x + off + w < 0 || x + off > W) continue;
    draw(x + off, y, w, h);
  }
}

function text(ctx, str, yaw, pitch, size = 42, color = 'rgba(255,255,255,.85)') {
  ctx.font = `800 ${size}px "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = size / 6; ctx.strokeStyle = 'rgba(0,0,0,.55)';
  for (const off of [-W, 0, W]) {
    ctx.strokeText(str, X(yaw) + off, Y(pitch));
    ctx.fillStyle = color; ctx.fillText(str, X(yaw) + off, Y(pitch));
  }
}

export function makeBackgroundCanvas(id) {
  const def = BACKGROUNDS[id] || BACKGROUNDS._fallback;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // 천장 / 벽 / 바닥 또는 하늘
  const horizon = def.horizon ?? -18;
  if (def.sky) {
    const g = ctx.createLinearGradient(0, 0, 0, Y(horizon));
    def.sky.forEach((col, i) => g.addColorStop(i / (def.sky.length - 1), col));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Y(horizon));
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, Y(def.ceilAt ?? 32));
    g.addColorStop(0, shade(def.ceil, -30)); g.addColorStop(1, def.ceil);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Y(def.ceilAt ?? 32));
    ctx.fillStyle = def.wall; ctx.fillRect(0, Y(def.ceilAt ?? 32), W, Y(horizon) - Y(def.ceilAt ?? 32));
    // 벽 아래 걸레받이
    ctx.fillStyle = shade(def.wall, -40); ctx.fillRect(0, Y(horizon) - 18, W, 18);
  }
  const fg = ctx.createLinearGradient(0, Y(horizon), 0, H);
  fg.addColorStop(0, def.floor); fg.addColorStop(1, shade(def.floor, -45));
  ctx.fillStyle = fg; ctx.fillRect(0, Y(horizon), W, H - Y(horizon));
  // 바닥 원근선
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 3;
  for (let p = horizon - 4; p > -88; p -= (p > -40 ? 5 : 10)) {
    ctx.beginPath(); ctx.moveTo(0, Y(p)); ctx.lineTo(W, Y(p)); ctx.stroke();
  }

  for (const o of def.objects || []) {
    if (o.type === 'glow') {
      const r = (o.r / 360) * W;
      for (const off of [-W, 0, W]) {
        const gg = ctx.createRadialGradient(X(o.yaw) + off, Y(o.pitch), 0, X(o.yaw) + off, Y(o.pitch), r);
        gg.addColorStop(0, o.color); gg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gg; ctx.fillRect(X(o.yaw) + off - r, Y(o.pitch) - r, r * 2, r * 2);
      }
      continue;
    }
    if (o.type === 'skyline') {
      ctx.fillStyle = o.color;
      let seed = 7;
      const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      for (let yaw = -180; yaw < 180; yaw += 2 + rnd() * 3) {
        if (o.skip && Math.abs(((yaw - o.skip[0] + 540) % 360) - 180) < o.skip[1]) continue;
        const top = o.base + 2 + rnd() * o.height;
        wrapRect(ctx, yaw, 2.5 + rnd() * 3, top, o.base, (x, y, w, h) => ctx.fillRect(x, y, w, h));
        if (rnd() > 0.4) { // 창문 불빛
          ctx.fillStyle = 'rgba(255,220,140,.55)';
          wrapRect(ctx, yaw, 0.5, top - 1, top - 1.6, (x, y, w, h) => ctx.fillRect(x, y, w, h));
          ctx.fillStyle = o.color;
        }
      }
      continue;
    }
    if (o.type === 'fence') {
      ctx.strokeStyle = o.color; ctx.lineWidth = 5;
      for (let yaw = -180; yaw < 180; yaw += o.step) {
        if (o.skip && Math.abs(((yaw - o.skip[0] + 540) % 360) - 180) < o.skip[1]) continue;
        const x = X(yaw); ctx.beginPath(); ctx.moveTo(x, Y(o.top)); ctx.lineTo(x, Y(o.bot)); ctx.stroke();
      }
      ctx.lineWidth = 10;
      for (const p of [o.top, (o.top + o.bot) / 2]) { ctx.beginPath(); ctx.moveTo(0, Y(p)); ctx.lineTo(W, Y(p)); ctx.stroke(); }
      continue;
    }
    if (o.type === 'row') { // 여러 개 반복 (책상 등)
      for (let i = 0; i < o.count; i++) {
        const yaw = o.from + i * o.step;
        wrapRect(ctx, yaw, o.w, o.top, o.bot, (x, y, w, h) => box(ctx, x, y, w, h, o.color));
      }
      continue;
    }
    wrapRect(ctx, o.yaw, o.w, o.top, o.bot, (x, y, w, h) => {
      box(ctx, x, y, w, h, o.color, o.frame);
      if (o.inner) { // 창문 격자 등
        ctx.strokeStyle = o.inner; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
      }
    });
    if (o.label) text(ctx, o.label, o.yaw, (o.top + o.bot) / 2, 40);
  }

  // 방향 표시 (플레이스홀더 전용)
  for (const [yaw, t] of [[0, '정면 0°'], [90, '오른쪽 90°'], [180, '뒤 180°'], [-90, '왼쪽 270°']]) {
    text(ctx, t, yaw, 62, 34, 'rgba(255,255,255,.45)');
  }
  text(ctx, `[PLACEHOLDER] ${def.name || id}`, 0, 72, 36, 'rgba(255,255,255,.5)');
  return c;
}

function box(ctx, x, y, w, h, fill, frame) {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, y, w, h * 0.15);
  ctx.strokeStyle = frame || 'rgba(0,0,0,.35)'; ctx.lineWidth = frame ? 14 : 4; ctx.strokeRect(x, y, w, h);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// ---------------- 캐릭터 스탠딩 플레이스홀더 ----------------
export function makeCharCanvas(ch, expr = 'normal') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024;
  const g = c.getContext('2d');
  const a = ch.art;
  const cx = 256, hy = 230, hr = 92;

  // 뒷머리
  g.fillStyle = a.hair;
  if (a.style === 'long' || a.style === 'wavy') { roundRect(g, cx - 120, hy - 60, 240, 380, 110); g.fill(); }
  if (a.style === 'ponytail') { g.beginPath(); g.ellipse(cx + 95, hy - 20, 45, 150, -0.3, 0, Math.PI * 2); g.fill(); }
  if (a.style === 'bob') { roundRect(g, cx - 112, hy - 70, 224, 200, 90); g.fill(); }

  // 몸 (블레이저 / 무대의상)
  g.fillStyle = a.outfit;
  g.beginPath(); g.moveTo(cx - 60, 330); g.lineTo(cx + 60, 330); g.lineTo(cx + 110, 640); g.lineTo(cx - 110, 640); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx - 28, 330); g.lineTo(cx + 28, 330); g.lineTo(cx, 440); g.closePath(); g.fill();
  g.fillStyle = a.accent; g.beginPath(); g.moveTo(cx - 22, 350); g.lineTo(cx + 22, 350); g.lineTo(cx, 385); g.closePath(); g.fill();
  // 팔
  g.fillStyle = a.outfit; roundRect(g, cx - 140, 345, 50, 260, 25); g.fill(); roundRect(g, cx + 90, 345, 50, 260, 25); g.fill();
  g.fillStyle = '#f6d9c6'; g.beginPath(); g.arc(cx - 115, 615, 24, 0, 7); g.arc(cx + 115, 615, 24, 0, 7); g.fill();
  if (a.pants) {
    // 바지
    g.fillStyle = a.skirt; g.fillRect(cx - 100, 620, 200, 60);
    g.fillRect(cx - 100, 640, 90, 320); g.fillRect(cx + 10, 640, 90, 320);
  } else {
    // 치마
    g.fillStyle = a.skirt; g.beginPath(); g.moveTo(cx - 110, 620); g.lineTo(cx + 110, 620); g.lineTo(cx + 150, 770); g.lineTo(cx - 150, 770); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 4;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(cx + i * 30, 620); g.lineTo(cx + i * 42, 770); g.stroke(); }
    // 다리
    g.fillStyle = '#f6d9c6'; g.fillRect(cx - 70, 770, 42, 190); g.fillRect(cx + 28, 770, 42, 190);
    g.fillStyle = '#222'; g.fillRect(cx - 70, 880, 42, 80); g.fillRect(cx + 28, 880, 42, 80);
  }
  g.fillStyle = '#3a2a22'; roundRect(g, cx - 78, 955, 58, 26, 12); g.fill(); roundRect(g, cx + 20, 955, 58, 26, 12); g.fill();
  // 목, 얼굴
  g.fillStyle = '#f6d9c6'; g.fillRect(cx - 22, hy + 70, 44, 50);
  g.beginPath(); g.ellipse(cx, hy, hr, hr * 1.08, 0, 0, Math.PI * 2); g.fill();

  // 눈
  const eyeY = hy + 18, eyeDX = 38;
  const eyeClosed = expr === 'smile' || expr === 'smug';
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDX;
    if (expr === 'wink' && s === 1) { arcLine(g, ex, eyeY, 16, true); continue; }
    if (eyeClosed) { arcLine(g, ex, eyeY + 4, 17, expr === 'smile'); continue; }
    const big = expr === 'surprised' || expr === 'panic' ? 1.15 : 1;
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, eyeY, 17 * big, 24 * big, 0, 0, 7); g.fill();
    g.fillStyle = a.eye; g.beginPath(); g.ellipse(ex, eyeY + 3, 13 * big, 19 * big, 0, 0, 7); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(ex, eyeY + 5, 6, 9, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(ex - 5, eyeY - 5, 5, 0, 7); g.fill();
    g.strokeStyle = '#2a1a14'; g.lineWidth = 5; g.beginPath(); g.moveTo(ex - 19, eyeY - 22); g.quadraticCurveTo(ex, eyeY - 30, ex + 19, eyeY - 22); g.stroke();
    if (expr === 'angry') { g.lineWidth = 6; g.beginPath(); g.moveTo(ex - s * 18, eyeY - 38); g.lineTo(ex + s * 14, eyeY - 28); g.stroke(); }
    if (expr === 'sad') { g.lineWidth = 5; g.beginPath(); g.moveTo(ex - s * 16, eyeY - 30); g.lineTo(ex + s * 14, eyeY - 38); g.stroke(); }
  }
  // 입
  g.strokeStyle = '#a0413f'; g.fillStyle = '#c85a5a'; g.lineWidth = 5;
  const my = hy + 62;
  g.beginPath();
  if (expr === 'smile' || expr === 'wink') { g.arc(cx, my - 8, 16, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
  else if (expr === 'smug') { g.moveTo(cx - 14, my); g.quadraticCurveTo(cx + 4, my + 6, cx + 16, my - 8); g.stroke(); }
  else if (expr === 'surprised' || expr === 'panic') { g.ellipse(cx, my, 9, 13, 0, 0, 7); g.fill(); }
  else if (expr === 'angry' || expr === 'sad') { g.moveTo(cx - 13, my + 4); g.quadraticCurveTo(cx, my - 6, cx + 13, my + 4); g.stroke(); }
  else { g.moveTo(cx - 10, my); g.lineTo(cx + 10, my); g.stroke(); }
  // 볼터치
  if (expr === 'blush' || expr === 'panic' || a.alwaysBlush) {
    g.fillStyle = 'rgba(255,90,110,.45)';
    g.beginPath(); g.ellipse(cx - 55, hy + 48, 20, 10, 0, 0, 7); g.ellipse(cx + 55, hy + 48, 20, 10, 0, 0, 7); g.fill();
  }
  if (expr === 'panic') { g.fillStyle = '#9fd8ff'; g.beginPath(); g.moveTo(cx + 95, hy - 40); g.quadraticCurveTo(cx + 115, hy - 5, cx + 95, hy); g.quadraticCurveTo(cx + 78, hy - 5, cx + 95, hy - 40); g.fill(); }

  // 앞머리
  g.fillStyle = a.hair;
  g.beginPath(); g.ellipse(cx, hy - 55, hr + 10, 70, 0, Math.PI, 0); g.fill();
  const bangDepth = a.style === 'bob' ? 60 : 38;
  for (let i = -3; i <= 3; i++) {
    g.beginPath(); g.moveTo(cx + i * 28 - 20, hy - 70); g.lineTo(cx + i * 28 + 20, hy - 70); g.lineTo(cx + i * 26, hy - 70 + bangDepth + (i % 2 ? 0 : 12)); g.fill();
  }
  if (a.style === 'long' || a.style === 'wavy') { g.fillRect(cx - hr - 12, hy - 60, 28, 230); g.fillRect(cx + hr - 16, hy - 60, 28, 230); }
  if (a.style === 'bob') { g.fillRect(cx - hr - 16, hy - 50, 32, 150); g.fillRect(cx + hr - 16, hy - 50, 32, 150); }
  if (a.inner) { g.fillStyle = a.inner; g.fillRect(cx - hr - 12, hy + 60, 12, 110); g.fillRect(cx + hr, hy + 60, 12, 110); }
  if (a.beard) { g.fillStyle = a.beard; g.beginPath(); g.ellipse(cx, hy + 72, 58, 30, 0, 0, Math.PI); g.fill(); }
  // 머리핀 / 액세서리
  if (!a.pants) { g.fillStyle = a.accent; g.beginPath(); g.arc(cx + 62, hy - 58, 11, 0, 7); g.fill(); }

  // 이름표
  g.fillStyle = 'rgba(0,0,0,.55)'; roundRect(g, cx - 150, 990, 300, 32, 12); g.fill();
  g.fillStyle = '#fff'; g.font = '800 20px "Noto Sans KR", sans-serif'; g.textAlign = 'center';
  g.fillText(`${ch.name} [${expr}] · PLACEHOLDER`, cx, 1013);
  return c;
}

function arcLine(g, x, y, r, up) {
  g.strokeStyle = '#2a1a14'; g.lineWidth = 6; g.beginPath();
  if (up) g.arc(x, y + 6, r, 1.15 * Math.PI, 1.85 * Math.PI); else g.arc(x, y - 6, r, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
