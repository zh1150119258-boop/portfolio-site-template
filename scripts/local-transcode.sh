#!/usr/bin/env bash
# 本地模拟「GitHub 转码」：转码本机原片 → 写入本地模拟存储桶 → 回调标记完成。仅用于 pnpm dev。
# 用法：bash scripts/local-transcode.sh <作品组编号> <原片1> [原片2 ...]
set -euo pipefail
id="$1"; shift
site="${SITE:-http://localhost:3000}"
work=$(mktemp -d); mkdir -p "$work/src"
n=0; for f in "$@"; do n=$((n+1)); ext="${f##*.}"; cp "$f" "$work/src/$(printf '%02d' $n).${ext,,}"; done
bash "$(dirname "$0")/ci-process-group.sh" "$work/src" "brand/$id" "$work/out"
( cd "$work/out" && find brand previews streams-balanced posters -type f ) | while read -r key; do
  curl -sf -X PUT --data-binary @"$work/out/$key" "$site/api/admin/dev-put?key=$key" > /dev/null && echo "写入 $key"
done
curl -sf -X POST "$site/api/media-callback" -H "Authorization: Bearer local-dev-only" -H "Content-Type: application/json" \
  -d "{\"group\":\"$id\",\"ok\":true,\"count\":$(cat "$work/out/count.txt"),\"clips\":$(cat "$work/out/clips.json"),\"sizes\":$(cat "$work/out/sizes.json")}"
echo; echo "完成：$id"
