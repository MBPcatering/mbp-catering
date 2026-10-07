import Link from "next/link";
import { Locale, copy } from "@/lib/site-content";

const exploreLinks = [
  ["Accueil", ""],
  ["Catering B2B", "/b2b"],
  ["Événements privés", "/evenements-prives"],
  ["À propos", "/a-propos"],
] as const;

const discoverLinks = [
  ["Le catalogue", "/catalogue"],
  ["Galerie", "/galerie"],
  ["Questions fréquentes", "/faq"],
  ["Demander un devis", "/devis"],
] as const;

export function SiteFooter({ locale }: { locale: Locale }) {
  const content = copy[locale];

  return <footer className="site-footer">
    <div className="shell footer-intro"><p className="kicker">MBP Catering</p><h2>Des tables qui<br />restent en mémoire.</h2></div>
    <div className="shell footer-grid">
      <div className="footer-brand-block"><div className="footer-mark" aria-hidden="true"><i /><i /><i /><i /><i /></div><div className="brand brand-light">MBP <span>Catering</span><small>{content.tagline}</small></div><p>Bruxelles & environs</p></div>
      <nav className="footer-links" aria-label="Découvrir MBP Catering"><p className="footer-title">Découvrir</p>{exploreLinks.map(([label, path]) => <Link key={path} href={`/${locale}${path}`}>{label}</Link>)}</nav>
      <nav className="footer-links" aria-label="Nos informations"><p className="footer-title">Nos informations</p>{discoverLinks.map(([label, path]) => <Link key={path} href={`/${locale}${path}`}>{label}</Link>)}</nav>
      <div className="footer-contact"><p className="footer-title">Restons en contact</p><p>Une question, une idée ou un événement à organiser ?</p><a href="mailto:info@mbpcatering.be">info@mbpcatering.be</a><Link href={`/${locale}/confidentialite`}>RGPD & confidentialité</Link></div>
    </div>
    <div className="shell footer-bottom"><span>© {new Date().getFullYear()} MBP Catering</span><span>{content.logistics}</span><span>Préparé avec attention à Bruxelles</span></div>
  </footer>;
}
