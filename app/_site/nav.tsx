"use client";

// 页头导航（当前页面高亮）和访问计数（页面加载、站内切换页面时各记一次，见 worker/hits.ts）。
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const LINKS: [string, string][] = [["/work", "作品"], ["/about", "关于"], ["/contact", "联系"]];

export function SiteNav() {
  const path = usePathname() ?? "/";
  return (
    <nav className="site-nav" aria-label="主菜单">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path === href || path.startsWith(`${href}/`) || (href === "/work" && path.startsWith("/film/")) ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}

export function HitCounter() {
  const path = usePathname() ?? "/";
  const first = useRef(true);
  useEffect(() => {
    const isNew = first.current;
    first.current = false;
    const body = JSON.stringify({ p: path, r: isNew ? document.referrer : location.origin + "/", n: isNew });
    try {
      if (!navigator.sendBeacon?.("/api/hit", new Blob([body], { type: "application/json" }))) {
        fetch("/api/hit", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => undefined);
      }
    } catch { /* 统计失败不影响浏览 */ }
  }, [path]);
  return null;
}
