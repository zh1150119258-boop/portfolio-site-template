import type { ReactNode } from "react";
import Link from "next/link";
import { loadSettings } from "../_portfolio/site-store";
import { contactOf, textOf } from "../_site/content";
import { HitCounter, SiteNav } from "../_site/nav";
import { siteJsonLd } from "../_site/seo";
import { themeCss } from "../_site/theme";

export const dynamic = "force-dynamic";

// 国内直连 Cloudflare 网络不稳时（尤其是微信内置浏览器），页面脚本可能下载失败导致白屏：
// 发现脚本加载失败就自动重新加载一次页面（20 秒内最多一次），第二次还失败就提示点击重试。
const CHUNK_GUARD = `(function(){
  var KEY="site-reload-at";
  function failed(msg){ return /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(msg||""); }
  function recover(){
    var last=0; try{ last=+sessionStorage.getItem(KEY)||0; }catch(e){}
    if(Date.now()-last>20000){ try{ sessionStorage.setItem(KEY,String(Date.now())); }catch(e){} location.reload(); return; }
    if(document.getElementById("site-retry")) return;
    var b=document.createElement("button"); b.id="site-retry"; b.textContent="网络不太稳定，点这里重新加载";
    b.style.cssText="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;padding:12px 18px;border:0;border-radius:999px;background:#141414;color:#fff;font:15px -apple-system,PingFang SC,sans-serif";
    b.onclick=function(){ try{ sessionStorage.removeItem(KEY); }catch(e){} location.reload(); };
    document.body.appendChild(b);
  }
  window.addEventListener("unhandledrejection",function(e){ var r=e.reason; if(failed(r&&(r.message||String(r)))) recover(); });
  window.addEventListener("error",function(e){ var t=e.target; if(t&&t.tagName==="SCRIPT"&&(t.src||"").indexOf("/assets/")>-1) recover(); else if(failed(e.message)) recover(); },true);
})();`;

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const { settings } = await loadSettings();
  const contact = contactOf(settings);
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: CHUNK_GUARD }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteJsonLd() }} />
      <style>{themeCss(settings)}</style>
      <header className="site-header">
        <Link href="/" className="site-name">{textOf(settings, "name")}</Link>
        <SiteNav />
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <span>{textOf(settings, "copyright")}</span>
        <span>{[textOf(settings, "roles"), textOf(settings, "basedIn"), contact.emails[0]].filter(Boolean).join(" · ")}</span>
      </footer>
      <HitCounter />
    </>
  );
}
