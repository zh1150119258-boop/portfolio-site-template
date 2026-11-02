"use client";

// 作品播放器。播放规则：
//   1. 先显示封面，不下载视频；
//   2. 点「播放」后加载「流畅」版（长边 1440，默认）；
//   3. 用户主动点「原画」才切换到原画，切换时保留播放进度；原画加载失败时自动退回流畅版；
//   4. 流畅版也失败时回到封面并提示。
import { useRef, useState } from "react";

type Props = { poster: string; stream: string; original?: string; ratio: number; title: string; allowOriginal: boolean };
type Quality = "smooth" | "original";

export function FilmPlayer({ poster, stream, original, ratio, title, allowOriginal }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [quality, setQuality] = useState<Quality>("smooth");
  const [status, setStatus] = useState<string | null>(null);
  const resumeAt = useRef(0);
  const src = quality === "original" && original ? original : stream;

  const switchTo = (next: Quality) => {
    if (next === quality) return;
    resumeAt.current = video.current?.currentTime ?? 0;
    setStatus(next === "original" ? "正在切换到原画…" : "正在切换到流畅…");
    setQuality(next);
    setStarted(true);
  };

  const onLoaded = () => {
    const node = video.current;
    if (!node) return;
    if (resumeAt.current) { node.currentTime = resumeAt.current; resumeAt.current = 0; }
    node.play().catch(() => undefined);
  };

  const onError = () => {
    if (quality === "original") {
      resumeAt.current = video.current?.currentTime ?? 0;
      setQuality("smooth");
      setStatus("原画加载失败，已切回流畅");
      return;
    }
    setStarted(false);
    setStatus("视频暂时加载不了，请稍后再试");
  };

  // 竖片不要撑满整屏高度
  const maxWidth = ratio < 1 ? `min(100%, calc(78vh * ${ratio}))` : undefined;

  return (
    <div>
      <div className="player" style={{ aspectRatio: String(ratio), maxWidth }}>
        {started ? (
          <video
            ref={video}
            key={src}
            src={src}
            poster={poster}
            controls
            playsInline
            preload="auto"
            onLoadedMetadata={onLoaded}
            onPlaying={() => setStatus(null)}
            onWaiting={() => setStatus("缓冲中…")}
            onError={onError}
          />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={poster} alt={title} />
            <button className="play" onClick={() => { setStarted(true); setStatus("加载中…"); }} aria-label={`播放 ${title}`}><span>▶ 播放</span></button>
          </>
        )}
        {status ? <div className="status" role="status">{status}</div> : null}
      </div>
      {allowOriginal && original ? (
        <div style={{ marginTop: 12 }}>
          <div className="quality" role="group" aria-label="画质">
            <button aria-pressed={quality === "smooth"} onClick={() => switchTo("smooth")}>流畅</button>
            <button aria-pressed={quality === "original"} onClick={() => switchTo("original")}>原画</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
