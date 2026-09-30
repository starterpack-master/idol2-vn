import { Panorama } from './engine/Panorama.js';
import { UI, esc } from './engine/UI.js';
import { VN } from './engine/VN.js';
import { Audio } from './engine/Audio.js';
import { linkScripts } from './engine/parser.js';

// 대본 파일: 파일명 순서대로 이어 붙임 (00_prologue.vn, 01_ch1.vn ...)
const files = import.meta.glob('./script/*.vn', { query: '?raw', import: 'default', eager: true });
const ordered = Object.keys(files).sort().map((k) => [k.split('/').pop(), files[k]]);
const script = linkScripts(ordered);

// 챕터 선택 목록 (label = 대본의 #라벨, id = @chapter 의 id=)
const CHAPTERS = [
  { id: 'prologue', label: 'prologue', title: 'PROLOGUE', sub: '뒤통수가 따가운 점심시간' },
  { id: 'ch1', label: 'ch1', title: 'Chapter 1', sub: '위험물 결성' },
  { id: 'ch2', label: 'ch2', title: 'Chapter 2', sub: '연습과 가치코이 연습 (준비 중)' },
];

const pano = new Panorama(document.getElementById('stage'));
const ui = new UI();
const audio = new Audio();
const vn = new VN(script, pano, ui, audio);
window.__vn = vn; // 디버그용

// 캔버스 플레이스홀더에 한글 폰트가 들어가도록 폰트 로드 후 배경 생성 (최대 2.5초 대기)
const fontsReady = Promise.race([
  Promise.all(['400 16px "Noto Sans KR"', '800 40px "Noto Sans KR"'].map((f) => document.fonts.load(f, '가'))),
  new Promise((r) => setTimeout(r, 2500)),
]).catch(() => {});

// 타이틀 배경: 옥상 파노라마를 천천히 회전
fontsReady.then(() => pano.setBackground('rooftop', 0)).then(() => pano.setView(0, 4));
const titleSpin = setInterval(() => (pano.yaw += 0.04), 16);

const title = document.getElementById('title');
const cont = document.getElementById('btn-continue');
if (!VN.hasSave()) cont.style.display = 'none';
const muteBtn = document.querySelector('[data-act=mute]');
muteBtn.classList.toggle('on', !audio.muted);

async function begin(mode, chapter) {
  audio.init(); // 사용자 탭 이후에만 오디오 시작 가능 (모바일 정책)
  clearInterval(titleSpin);
  title.classList.add('hidden'); ui.closePanel();
  ui.showGameUI(true); ui.hideTextbox();
  if (mode === 'load') { await vn.load(); return; }
  if (mode === 'chapter') { await ui.fade('out', 300); await vn.startChapter(chapter.label, VN.chapters()[chapter.id]); return; }
  vn.reset(document.getElementById('player-name').value.trim() || '도윤');
  await ui.fade('out', 300);
  vn.start(0);
}
document.getElementById('btn-new').onclick = () => begin('new');
cont.onclick = () => begin('load');
document.getElementById('btn-chapters').onclick = () => {
  const open = VN.chapters();
  const html = '<h3 style="margin-bottom:12px">챕터 선택</h3>' + CHAPTERS.map((c, i) => {
    const ok = open[c.id] && c.label in script.labels;
    return `<button class="ch-item ${ok ? '' : 'locked'}" data-i="${i}" ${ok ? '' : 'disabled'}>${ok ? '' : '🔒 '}${esc(c.title)}<small>${esc(c.sub)}</small></button>`;
  }).join('') + '<p style="font-size:12px;opacity:.6;margin-top:6px">한 번 도달한 챕터는 그 시점의 호감도로 다시 시작할 수 있어요.</p>';
  ui.panel(html, (el) => el.querySelectorAll('.ch-item:not(.locked)').forEach((b) => (b.onclick = () => begin('chapter', CHAPTERS[+b.dataset.i]))));
};

document.getElementById('topbar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  e.stopPropagation();
  audio.sfx('pop');
  switch (b.dataset.act) {
    case 'log': vn.showLog(); break;
    case 'auto': b.classList.toggle('on', vn.toggleAuto()); break;
    case 'skip': b.classList.toggle('on', vn.toggleSkip()); break;
    case 'save': vn.save(); break;
    case 'load': if (!VN.hasSave()) ui.toast('저장 데이터가 없습니다', 'warn'); else vn.load(); break;
    case 'status': vn.showStatus(); break;
    case 'mute': audio.setMuted(!audio.muted); b.classList.toggle('on', !audio.muted); break;
  }
});

// 선택지 클릭음
document.getElementById('choices').addEventListener('click', () => { audio.sfx('pop'); navigator.vibrate?.(20); }, true);

// 탭 이외 조작: 스페이스/엔터로 진행 (데스크톱), 백그라운드 전환 시 오디오 일시정지
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); vn.waiter?.(null); }
});
document.addEventListener('visibilitychange', () => {
  if (!audio.ctx) return;
  if (document.hidden) audio.ctx.suspend(); else audio.ctx.resume();
});
