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
      <div className="footer-brand-block"><div className="brand brand-light">MBP <span>Catering</span><small>{content.tagline}</small></div><p>24, avenue Seghers<br />1080 Molenbeek</p></div>
      <nav className="footer-links" aria-label="Découvrir MBP Catering"><p className="footer-title">Découvrir</p>{exploreLinks.map(([label, path]) => <Link key={path} href={`/${locale}${path}`}>{label}</Link>)}</nav>
      <nav className="footer-links" aria-label="Nos informations"><p className="footer-title">Nos informations</p>{discoverLinks.map(([label, path]) => <Link key={path} href={`/${locale}${path}`}>{label}</Link>)}</nav>
      <div className="footer-contact"><p className="footer-title">Restons en contact</p><p>Une question, une idée ou un événement à organiser ?</p><a href="mailto:info@mbpcatering.be">info@mbpcatering.be</a><a className="footer-instagram" href="https://www.instagram.com/catering.mbp/" target="_blank" rel="noreferrer" aria-label="Suivre MBP Catering sur Instagram"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" /></svg><span>Instagram</span></a><Link href={`/${locale}/confidentialite`}>RGPD & confidentialité</Link></div>
    </div>
    <div className="shell footer-bottom"><span>© {new Date().getFullYear()} MBP Catering</span><span>Bruxelles & environs</span><span>Conçu avec passion par KENOMI</span></div>
  </footer>;
}
