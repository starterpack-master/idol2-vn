// 캐릭터 정의. 대본에서 `하린:` 처럼 name 또는 `harin:` 처럼 id 로 부른다.
export const CHARACTERS = {
  harin: { name: '하린', full: '서하린', color: '#ff4d6d',
    art: { hair: '#7a4a2e', eye: '#b0602a', outfit: '#23305a', skirt: '#7b3040', accent: '#ff3b5c', style: 'long' } },
  sera: { name: '세라', full: '백세라', color: '#3d8bff',
    art: { hair: '#d9cbb0', eye: '#3a78d8', outfit: '#23305a', skirt: '#2c4f86', accent: '#3d8bff', style: 'ponytail' } },
  iseul: { name: '이슬', full: '윤이슬', color: '#5fc9e8',
    art: { hair: '#1c1a24', eye: '#4a5a8a', outfit: '#23305a', skirt: '#3b5a74', accent: '#8fe0ff', style: 'bob', alwaysBlush: true } },
  luna: { name: '루나', full: '강루나', color: '#a45cff',
    art: { hair: '#15101c', eye: '#9b5cff', outfit: '#1a1020', skirt: '#2a1438', accent: '#b27cff', style: 'wavy', inner: '#8a4cff' } },
  kwak: { name: '곽 사장', full: '곽태식', color: '#c9953a',
    art: { hair: '#3a3a3a', eye: '#3a2a1a', outfit: '#1e1e1e', skirt: '#34495e', accent: '#c9953a', style: 'short', pants: true, beard: 'rgba(60,60,60,.55)' } },
};

// 플레이어 (스탠딩 없음). {player} 로 대본에서 이름 치환
export const PLAYER = { id: 'me', color: '#8a8f9c' };

// 호감도 / 수치 표시용
export const STATS = [
  { key: 'harin', label: '하린 호감도', color: '#ff4d6d' },
  { key: 'sera', label: '세라 호감도', color: '#3d8bff' },
  { key: 'iseul', label: '이슬 호감도', color: '#5fc9e8' },
  { key: 'luna', label: '루나 호감도', color: '#a45cff' },
  { key: 'trust', label: '프로듀서 신뢰도', color: '#42d6a4' },
  { key: 'scandal', label: '스캔들 위험도', color: '#ffb400' },
];
