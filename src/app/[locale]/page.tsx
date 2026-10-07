import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Locale, copy, locales } from "@/lib/site-content";

export function generateStaticParams() { return locales.map((locale) => ({ locale })); }

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  if (!locales.includes(locale)) notFound();
  const content = copy[locale];
  return <><SiteHeader locale={locale} /><main>
    <section className="hero"><div className="shell hero-grid"><div className="hero-copy"><p className="kicker">Bruxelles · Catering & événements</p><h1>{content.hero}</h1><p className="hero-intro">{content.intro}</p><div className="hero-actions"><Link className="button" href={`/${locale}/devis`}>{content.quote}</Link><Link className="text-link" href={`/${locale}/catalogue`}>{content.catalogue} <span>↗</span></Link></div></div><div className="hero-art" aria-label="Une composition culinaire MBP"><div className="plate"><div className="plate-core"><i /><i /><i /><i /><b /></div></div><p>Préparé avec soin<br />pour être partagé.</p></div></div></section>
    <section className="shell service-intro"><p className="kicker">Une table à votre image</p><div className="split-heading"><h2>Du premier café au dernier toast, MBP accompagne vos moments importants.</h2><p>Une cuisine de saison, des formules généreuses et une équipe attentive : la base d’un événement simple à organiser et agréable à vivre.</p></div><div className="service-grid"><Link href={`/${locale}/b2b`} className="service-card business"><span>Pour les équipes</span><h3>{content.b2b}</h3><p>{content.b2bText}</p><b>Découvrir <i>↗</i></b></Link><Link href={`/${locale}/evenements-prives`} className="service-card private"><span>Pour les hôtes</span><h3>{content.private}</h3><p>{content.privateText}</p><b>Imaginer mon événement <i>↗</i></b></Link></div></section>
    <section className="catalogue-band"><div className="shell catalogue-layout"><div><p className="kicker">Catalogue 2026–2027</p><h2>{content.catalogueTitle}</h2><p>{content.catalogueText}</p><Link className="button button-light" href={`/${locale}/catalogue`}>Recevoir le catalogue</Link></div><ul><li>Un guide complet pour vos événements</li><li>Des formules pour les entreprises</li><li>Des propositions pour les moments privés</li><li>Une équipe à votre écoute</li></ul></div></section>
    <section className="shell trust-section"><div><p className="kicker">L’essentiel, clairement</p><h2>Votre événement mérite une organisation fluide.</h2></div><div className="trust-list"><p><strong>10 personnes</strong> minimum pour nos formules</p><p><strong>48 h / 5 jours</strong> selon votre type d’événement</p><p><strong>± 40 km</strong> autour de Bruxelles</p><p><strong>250 €</strong> de commande, livraison offerte</p></div></section>
    <section className="shell final-cta"><p className="kicker">Votre projet commence ici</p><h2>Parlons de votre prochaine table.</h2><p>Indiquez les grandes lignes. MBP vous répond avec une proposition vraiment adaptée.</p><Link className="button" href={`/${locale}/devis`}>{content.quote}</Link></section>
  </main><SiteFooter locale={locale} /></>;
}
