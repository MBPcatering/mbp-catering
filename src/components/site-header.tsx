import Link from "next/link";
import { Locale, copy } from "@/lib/site-content";

const destinations = ["/", "/b2b", "/evenements-prives", "/catalogue", "/a-propos", "/contact"];

export function SiteHeader({ locale }: { locale: Locale }) {
  const content = copy[locale];
  return <header className="site-header"><div className="shell nav-wrap">
    <Link href={`/${locale}`} className="brand" aria-label="MBP Catering">MBP <span>Catering</span><small>{content.tagline}</small></Link>
    <nav className="desktop-nav" aria-label="Navigation principale">{content.nav.map((item, index) => <Link key={item} href={`/${locale}${destinations[index]}`}>{item}</Link>)}</nav>
    <div className="nav-actions"><div className="language-switch" aria-label="Langue">{(["fr", "nl", "en"] as Locale[]).map((language) => <Link key={language} href={`/${language}`} className={language === locale ? "active" : ""}>{language.toUpperCase()}</Link>)}</div><Link className="button button-small" href={`/${locale}/devis`}>{content.quote}</Link></div>
  </div></header>;
}
