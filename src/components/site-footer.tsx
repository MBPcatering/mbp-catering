import Link from "next/link";
import { Locale, copy } from "@/lib/site-content";

export function SiteFooter({ locale }: { locale: Locale }) {
  const content = copy[locale];
  return <footer className="site-footer"><div className="shell footer-grid"><div><div className="brand brand-light">MBP <span>Catering</span><small>{content.tagline}</small></div><p>Bruxelles · Belgique</p></div><div><p className="footer-title">Parlons de votre événement</p><a href="mailto:info@mbpcatering.be">info@mbpcatering.be</a></div><div><p className="footer-title">Une demande ?</p><Link href={`/${locale}/devis`}>{content.quote}</Link><Link href={`/${locale}/contact`}>Contact</Link><Link href={`/${locale}/confidentialite`}>RGPD & confidentialité</Link></div></div><div className="shell footer-bottom">© {new Date().getFullYear()} MBP Catering · {content.logistics}</div></footer>;
}
