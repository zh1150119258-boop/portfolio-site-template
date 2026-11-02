import { aboutFor, loadAbout } from "../../_portfolio/about-store";
import { loadSettings } from "../../_portfolio/site-store";
import { textOf } from "../../_site/content";
import { pageMeta } from "../../_site/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const [{ settings }, { content }] = await Promise.all([loadSettings(), loadAbout()]);
  return pageMeta({ path: "/about", title: textOf(settings, "aboutTitle"), description: aboutFor(content, "zh").intro });
}

// 关于页：主张句、简介、正文、擅长方向、工作履历。内容都在后台「关于页与履历」里填写。
export default async function AboutPage() {
  const [{ settings }, { content }] = await Promise.all([loadSettings(), loadAbout()]);
  const about = aboutFor(content, "zh");
  return (
    <div className="about">
      <header className="page-head" style={{ paddingBottom: 0 }}>
        <p style={{ margin: "0 0 18px" }}>{textOf(settings, "aboutTitle")}</p>
        <h1 className="statement">{about.statement.map((line) => <span key={line}>{line}</span>)}</h1>
      </header>
      <section className="prose">
        <p className="lead">{about.intro}</p>
        {about.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </section>
      {about.focus.length ? (
        <section>
          <div className="section-title"><span>{textOf(settings, "focusTitle")}</span></div>
          <ul className="tags">{about.focus.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}
      {about.experience.length ? (
        <section>
          <div className="section-title"><span>{textOf(settings, "experienceTitle")}</span></div>
          <table className="jobs"><tbody>{about.experience.map(([years, company, role], index) => <tr key={index}><td>{years}</td><td>{company}</td><td>{role}</td></tr>)}</tbody></table>
        </section>
      ) : null}
    </div>
  );
}
