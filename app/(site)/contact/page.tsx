import { loadSettings } from "../../_portfolio/site-store";
import { contactOf, textOf } from "../../_site/content";
import { pageMeta } from "../../_site/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { settings } = await loadSettings();
  return pageMeta({ path: "/contact", title: textOf(settings, "contactTitle") });
}

// 联系页：联系方式在后台「网站设置 → 联系方式」里填写，没填的项不显示。
export default async function ContactPage() {
  const { settings } = await loadSettings();
  const contact = contactOf(settings);
  const rows: [string, React.ReactNode][] = [
    ...contact.emails.map((email, index): [string, React.ReactNode] => [index ? "" : "邮箱", <a key={email} href={`mailto:${email}`}>{email}</a>]),
    ...(contact.wechat ? [["微信", contact.wechat] as [string, React.ReactNode]] : []),
    ...(contact.line ? [["Line", contact.line] as [string, React.ReactNode]] : []),
    ...(contact.whatsapp?.label ? [["WhatsApp", contact.whatsapp.href ? <a href={contact.whatsapp.href} rel="noopener">{contact.whatsapp.label}</a> : contact.whatsapp.label] as [string, React.ReactNode]] : []),
  ];
  return (
    <>
      <header className="page-head">
        <h1>{textOf(settings, "contactTitle")}</h1>
        <p>{textOf(settings, "contactLine")}</p>
      </header>
      {rows.length ? <dl className="contact-list">{rows.map(([label, value], index) => <div key={index}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p className="empty">还没有填写联系方式（在后台「网站设置 → 联系方式」里填写）。</p>}
      {contact.emails[0] ? <a className="button" href={`mailto:${contact.emails[0]}`}>{textOf(settings, "sendEmail")}</a> : null}
    </>
  );
}
