# 방과후 위험물 — 360° 파노라마 지하돌 프로듀싱 미연시 (Three.js)

▶ **플레이: https://starterpack-master.github.io/idol2-vn/** (모바일 세로 화면 권장, 이어폰 권장)

```bash
npm install
npm run dev      # 휴대폰에서 같은 와이파이로 http://<PC IP>:5173 접속
npm run build    # dist/ 생성 (상대 경로 빌드라 어느 정적 호스팅이든 하위 경로 그대로 동작)
npm run deploy   # 빌드 후 dist/ 를 gh-pages 브랜치에 푸시 → GitHub Pages 갱신 (반영까지 1~2분)
```

| 경로 | 내용 |
|---|---|
| `docs/01_기획서.md` | 분량 산정, 작업 순서, 캐릭터, 시스템 |
| `docs/02_스토리라인.md` | 3시간 챕터 구성, 이벤트, 엔딩 9종 조건 |
| `docs/03_이미지_프롬프트.md` | 360° 배경/스탠딩 생성 프롬프트와 파일명 규칙 |
| `docs/04_대본_문법.md` | `.vn` 대본 문법 |
| `src/script/*.vn` | 대본 (파일명 순서로 실행) |
| `src/engine/` | Panorama(Three.js), 파서, 인터프리터, UI |
| `src/data/` | 캐릭터 · 배경 정의 |
| `public/assets/bg`, `public/assets/char` | 실제 이미지를 넣으면 플레이스홀더가 자동으로 교체됨 |

현재 구현: **프롤로그 + Chapter 1** (약 13,000자, 1회차 약 35~40분)

기능: 360° 강제 회전/자유 탐색/찾기, 시간제한 선택지, 폰 연출(유튜브·카톡·DM·갤·메모), 호감도 하트 연출, Web Audio BGM 5종·효과음, 모바일 진동, 챕터 선택(도달 시점 호감도로 재시작), 라벨 기반 세이브, LOG/AUTO/SKIP, 음소거.

새 챕터 추가: `src/script/02_ch2.vn`을 만들고 `#ch2` 라벨 + `@chapter "Chapter 2" "..." id=ch2`로 시작 → Ch1 마지막 `@end`를 `@jump ch2`로 교체.
