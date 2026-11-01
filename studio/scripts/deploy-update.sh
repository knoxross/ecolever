#!/usr/bin/env bash
# 새 버전을 회사 홈페이지(가비아)에 올립니다 → 설치된 영상뚝딱이 자동으로 업데이트됩니다.
# 사용: (studio 폴더에서) npm run dist:win 으로 만든 뒤  bash scripts/deploy-update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
NETRC="$HOME/.ecolever/ftp.netrc"
HOST="ftp://ecolever.co.kr/app/ttukttak"
[ -f "$NETRC" ] || { echo "FTP 정보 파일이 없습니다: $NETRC (저장소 최상위의 setup-ftp.ps1 참고)" >&2; exit 1; }
shopt -s nullglob
files=(dist/latest.yml dist/latest-mac.yml dist/*.exe dist/*.exe.blockmap dist/*.dmg dist/*.zip)
for f in "${files[@]}"; do
  curl -s -S --netrc-file "$NETRC" --ftp-create-dirs -m 600 -T "$f" "$HOST/$(basename "$f")"
  echo "uploaded $(basename "$f")"
done
echo "완료: https://www.ecolever.co.kr/app/ttukttak/ 에서 설치된 앱이 새 버전을 받아 갑니다."
