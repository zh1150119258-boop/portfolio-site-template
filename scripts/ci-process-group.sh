#!/usr/bin/env bash
# GitHub Actions 用的转码脚本（Ubuntu / bash），本地预览时 scripts/local-transcode.sh 也调用它。规格：
#   原画  <媒体文件夹>/clip-NN.mp4                 （H.264/HEVC 不重新压缩，只整理为 faststart；其他格式转高质量 H.264）
#   流畅  streams-balanced/<媒体文件夹>/clip-NN.mp4 （长边 1440，CRF 20，带声音）
#   预览  previews/<媒体文件夹>/clip-NN.mp4         （长边 540，约 700k，无声音）
#   封面  posters/<媒体文件夹>/clip-NN.jpg          （长边 1080）
# 用法：ci-process-group.sh <原片所在目录> <媒体文件夹> <输出目录>
# 结果按 R2 的路径放在输出目录里，另写 sizes.json（每张封面的宽高）。
set -euo pipefail

src="$1"; media_base="$2"; out="$3"
mkdir -p "$out/$media_base" "$out/streams-balanced/$media_base" "$out/previews/$media_base" "$out/posters/$media_base"
files=()
while IFS= read -r line; do files+=("$line"); done < <(find "$src" -maxdepth 1 -type f \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.m4v' \) | sort -V)
(( ${#files[@]} )) || { echo "没有找到原片" >&2; exit 1; }

scale() { echo "scale=w='if(gt(iw,ih),min($1,iw),-2)':h='if(gt(iw,ih),-2,min($1,ih))':flags=lanczos"; }
sizes="["
index=0
numbers="["
for file in "${files[@]}"; do
  index=$((index + 1))
  # 原片按 uploads/<组>/NN.ext 命名：NN 就是条目编号（追加视频时从已有条数往后接）
  n=$(basename "$file" | sed -E 's/^0*([0-9]+)\..*$/\1/')
  [[ "$n" =~ ^[0-9]+$ ]] || n=$index
  numbers+="$n,"
  clip=$(printf 'clip-%02d' "$n")
  echo "[$clip] $(basename "$file")"

  codec=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$file")
  case "$codec" in
    h264) ffmpeg -hide_banner -loglevel error -y -i "$file" -map 0:v:0 -map '0:a:0?' -c copy -map_metadata -1 -movflags +faststart "$out/$media_base/$clip.mp4" ;;
    hevc) ffmpeg -hide_banner -loglevel error -y -i "$file" -map 0:v:0 -map '0:a:0?' -c copy -tag:v hvc1 -map_metadata -1 -movflags +faststart "$out/$media_base/$clip.mp4" ;;
    *) ffmpeg -hide_banner -loglevel error -y -i "$file" -map 0:v:0 -map '0:a:0?' -c:v libx264 -preset slow -crf 16 -profile:v high -pix_fmt yuv420p -c:a aac -b:a 192k -map_metadata -1 -movflags +faststart "$out/$media_base/$clip.mp4" ;;
  esac

  ffmpeg -hide_banner -loglevel error -y -i "$file" -map 0:v:0 -map '0:a:0?' -vf "$(scale 1440)" \
    -c:v libx264 -preset medium -crf 20 -maxrate 5500k -bufsize 11000k -profile:v high -pix_fmt yuv420p \
    -force_key_frames 'expr:gte(t,n_forced*2)' -c:a aac -b:a 128k -ar 48000 -map_metadata -1 -movflags +faststart \
    "$out/streams-balanced/$media_base/$clip.mp4"

  ffmpeg -hide_banner -loglevel error -y -i "$file" -map 0:v:0 -an -vf "$(scale 540)" \
    -c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p -b:v 700k -maxrate 850k -bufsize 1400k \
    -force_key_frames 'expr:gte(t,n_forced*2)' -movflags +faststart "$out/previews/$media_base/$clip.mp4"

  duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$file")
  at=$(awk -v d="$duration" 'BEGIN { printf "%.2f", (d > 10 ? 1 : d * 0.1) }')
  ffmpeg -hide_banner -loglevel error -y -ss "$at" -i "$file" -frames:v 1 -vf "$(scale 1080)" -q:v 3 "$out/posters/$media_base/$clip.jpg"
  wh=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=, "$out/posters/$media_base/$clip.jpg")
  sizes+="[${wh}],"
done
echo "${sizes%,}]" > "$out/sizes.json"
echo "${numbers%,}]" > "$out/clips.json"
echo "$index" > "$out/count.txt"
echo "完成 $index 条"
