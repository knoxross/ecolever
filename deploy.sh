#!/usr/bin/env bash
# 가비아 웹호스팅(www.ecolever.co.kr)으로 사이트 파일을 업로드합니다.
# FTP 계정 정보는 저장소 밖 ~/.ecolever/ftp.netrc 에 있습니다 (GitHub에 올라가지 않음).
set -euo pipefail

cd "$(dirname "$0")"
NETRC="$HOME/.ecolever/ftp.netrc"
HOST="ftp://ecolever.co.kr"

[ -f "$NETRC" ] || { echo "FTP 정보 파일이 없습니다: $NETRC" >&2; exit 1; }

files=(index.html .htaccess css/* js/* imgs/*)
for f in "${files[@]}"; do
  [ -f "$f" ] || continue
  curl -s -S --netrc-file "$NETRC" --ftp-create-dirs -m 60 -T "$f" "$HOST/$f"
  echo "uploaded $f"
done
echo "done: ${#files[@]} files"
