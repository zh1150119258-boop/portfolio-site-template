"use client";

// 作品卡片：先显示封面；电脑上鼠标移上去、手机上滑到屏幕中间时，才加载并静音循环播放轻量预览（几百 KB）。
// 离开可视区就暂停并卸载视频，避免一页同时下载很多视频。打开页面时不会请求流畅版或原画。
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Props = { href: string; poster: string; preview?: string; ratio: number; title: string; note?: string; eager?: boolean };

export function PreviewCard({ href, poster, preview, ratio, title, note, eager }: Props) {
  const box = useRef<HTMLAnchorElement>(null);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = box.current;
    if (!node || !preview) return;
    // 能悬停的设备（电脑）：悬停时播放；触屏：靠近屏幕中间时播放
    if (window.matchMedia("(hover: hover)").matches) {
      const on = () => setActive(true);
      const off = () => { setActive(false); setReady(false); };
      node.addEventListener("pointerenter", on);
      node.addEventListener("pointerleave", off);
      return () => { node.removeEventListener("pointerenter", on); node.removeEventListener("pointerleave", off); };
    }
    const observer = new IntersectionObserver(([entry]) => {
      setActive(entry.isIntersecting);
      if (!entry.isIntersecting) setReady(false);
    }, { rootMargin: "-35% 0px -35% 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [preview]);

  return (
    <Link ref={box} href={href} className="card">
      <div className="frame" style={{ aspectRatio: String(ratio) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt={title} loading={eager ? "eager" : "lazy"} decoding="async" />
        {active && preview ? (
          <video className={ready ? "on" : ""} src={preview} muted loop playsInline autoPlay preload="auto" aria-hidden="true" onPlaying={() => setReady(true)} onError={() => setActive(false)} />
        ) : null}
      </div>
      <div className="meta"><span>{title}</span>{note ? <span>{note}</span> : null}</div>
    </Link>
  );
}
