#!/usr/bin/env bash
# dist/ 를 gh-pages 브랜치에 올려 GitHub Pages로 배포한다.
# (GitHub Settings → Pages → Branch: gh-pages / root 로 서비스)
# 사용법: npm run deploy
set -euo pipefail
cd "$(dirname "$0")/.."

REMOTE="$(git remote get-url origin)"
SRC_SHA="$(git rev-parse --short HEAD)"

npm run build
touch dist/.nojekyll # Jekyll 처리 생략

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if git ls-remote --exit-code --heads "$REMOTE" gh-pages >/dev/null 2>&1; then
  git clone --quiet --depth 1 --branch gh-pages "$REMOTE" "$WORK/site"
  git -C "$WORK/site" rm -rq --ignore-unmatch .
else
  git init --quiet -b gh-pages "$WORK/site"
  git -C "$WORK/site" remote add origin "$REMOTE"
fi

cp -R dist/. "$WORK/site/"
git -C "$WORK/site" add -A
if git -C "$WORK/site" diff --cached --quiet; then
  echo "변경 사항 없음 — 배포를 건너뜁니다."
  exit 0
fi
git -C "$WORK/site" commit --quiet -m "deploy: ${SRC_SHA}"
git -C "$WORK/site" push --quiet origin gh-pages
echo "배포 완료: gh-pages ← ${SRC_SHA}"
