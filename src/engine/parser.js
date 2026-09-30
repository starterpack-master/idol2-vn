// .vn 대본 파서 — 문법은 docs/04_대본_문법.md 참고
// 화자 이름: 최대 8자, 중간 공백 허용 (예: "곽 사장", "반 친구A")
const SPEAKER_RE = /^([^\s:：\[\]"『「(（…][^:：\[\]"『「(（…]{0,7}?)(?:\[([\w-]+)\])?\s*[:：]\s?(.*)$/;

function tokenize(s) {
  const out = []; const re = /(\w+)="([^"]*)"|"([^"]*)"|(\S+)/g; let m;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) out.push(`${m[1]}=${m[2]}`);
    else out.push(m[3] !== undefined ? { q: m[3] } : m[4]);
  }
  return out;
}
function args(s) {
  const pos = [], kv = {};
  for (const t of tokenize(s)) {
    if (typeof t === 'object') { pos.push(t.q); continue; }
    const m = t.match(/^(\w+)=(.*)$/);
    if (m) kv[m[1]] = num(m[2].replace(/^"|"$/g, '')); else pos.push(num(t));
  }
  return { pos, kv };
}
const num = (v) => {
  if (typeof v !== 'string') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return /^-?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : v;
};

// "harin+3 scandal-2 flag:met_luna set:route=harin" → [{k,v,op}]
function effects(s) {
  const out = [];
  for (const t of s.trim().split(/\s+/).filter(Boolean)) {
    let m;
    if ((m = t.match(/^(\w+)([+-]\d+)$/))) out.push({ op: 'add', k: m[1], v: parseInt(m[2], 10) });
    else if ((m = t.match(/^flag:(\w+)$/))) out.push({ op: 'set', k: m[1], v: true });
    else if ((m = t.match(/^set:(\w+)=(.+)$/))) out.push({ op: 'set', k: m[1], v: num(m[2]) });
  }
  return out;
}

function parseOption(line) {
  const parts = line.split('|').map((p) => p.trim());
  const opt = { text: parts.shift(), fx: [], jump: null, cond: null };
  for (let p of parts) {
    if (p.startsWith('?')) { opt.cond = p.slice(1).trim(); continue; }
    const j = p.match(/->\s*(\S+)\s*$/);
    if (j) { opt.jump = j[1]; p = p.slice(0, j.index); }
    opt.fx.push(...effects(p));
  }
  // "텍스트 -> label" 처럼 | 없이 쓴 경우
  const j = opt.text.match(/\s*->\s*(\S+)\s*$/);
  if (j) { opt.jump = j[1]; opt.text = opt.text.slice(0, j.index); }
  return opt;
}

export function parseScript(src, file = 'script') {
  const cmds = [], labels = {};
  const lines = src.replace(/\r/g, '').split('\n');
  let block = null; // { cmd, kind }

  const push = (c, ln) => { c.src = `${file}:${ln + 1}`; cmds.push(c); return c; };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (block?.kind === 'phone') {
      if (line === '@endphone') { block = null; continue; }
      if (line) block.cmd.lines.push(line);
      continue;
    }
    if (block && (block.kind === 'choice' || block.kind === 'explore')) {
      if (line.startsWith('- ')) {
        const body = line.slice(2);
        if (block.kind === 'choice') block.cmd.options.push(parseOption(body));
        else {
          const { pos } = args(body.replace(/->\s*(\S+)\s*$/, ''));
          const target = body.match(/->\s*(\S+)\s*$/)?.[1];
          block.cmd.spots.push({ yaw: pos[0], pitch: pos[1], label: pos[2] ?? '', jump: target });
        }
        continue;
      }
      block = null;
    }
    if (!line || line.startsWith('//')) continue;

    if (line.startsWith('#')) { labels[line.slice(1).trim()] = cmds.length; continue; }

    if (line.startsWith('@')) {
      const sp = line.indexOf(' ');
      const name = (sp < 0 ? line.slice(1) : line.slice(1, sp)).toLowerCase();
      const rest = sp < 0 ? '' : line.slice(sp + 1).trim();
      const { pos, kv } = args(rest);
      switch (name) {
        case 'choice': block = { kind: 'choice', cmd: push({ op: 'choice', options: [], ...kv }, i) }; break;
        case 'explore': block = { kind: 'explore', cmd: push({ op: 'explore', hint: pos[0] || '주변을 둘러보세요', spots: [], ...kv }, i) }; break;
        case 'phone': block = { kind: 'phone', cmd: push({ op: 'phone', app: pos[0] || 'kakao', title: pos[1] || '', lines: [], ...kv }, i) }; break;
        case 'if': {
          const m = rest.match(/^(.*)->\s*(\S+)\s*$/);
          push({ op: 'if', cond: m[1].trim(), jump: m[2] }, i); break;
        }
        case 'add': case 'set': push({ op: 'fx', fx: name === 'add' ? effects(rest) : effects(rest.split(/\s+/).map((t) => 'set:' + t).join(' ')) }, i); break;
        default: push({ op: name, pos, ...kv }, i);
      }
      continue;
    }

    if (line.startsWith('>')) { push({ op: 'say', who: null, text: line.slice(1).trim() }, i); continue; }
    if (line.startsWith('(') && line.endsWith(')')) { push({ op: 'say', who: null, text: line, style: 'thought' }, i); continue; }
    const m = line.match(SPEAKER_RE);
    if (m) { push({ op: 'say', who: m[1], expr: m[2] || null, text: m[3] }, i); continue; }
    push({ op: 'say', who: null, text: line }, i);
  }
  return { cmds, labels };
}

// 여러 파일을 하나로 합침 (라벨은 전역)
export function linkScripts(files) {
  const all = [], labels = {};
  for (const [name, src] of files) {
    const { cmds, labels: l } = parseScript(src, name);
    for (const k in l) labels[k] = l[k] + all.length;
    all.push(...cmds);
  }
  return { cmds: all, labels };
}
