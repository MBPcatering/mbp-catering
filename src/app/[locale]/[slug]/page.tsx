import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogueDownloadForm } from "@/components/catalogue-download-form";
import { QuoteForm } from "@/components/quote-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  copy,
  detailPages,
  faqCopy,
  Locale,
  locales,
  RouteSlug,
  routes,
} from "@/lib/site-content";
import { createPageMetadata } from "@/lib/seo";
import { galleryImages } from "@/lib/gallery";

const quoteCopy = {
  fr: {
    kicker: "Demande de devis",
    title: "Votre événement commence par quelques bonnes questions.",
    lead: "Donnez-nous l’essentiel. Votre demande est conçue pour être ensuite enregistrée, suivie et traitée par l’équipe MBP.",
  },
  nl: {
    kicker: "Offerte aanvragen",
    title: "Uw evenement begint met enkele goede vragen.",
    lead: "Geef ons de essentie. Uw aanvraag is ontworpen om vervolgens door het MBP-team geregistreerd, opgevolgd en behandeld te worden.",
  },
  en: {
    kicker: "Request a quote",
    title: "Your event starts with a few good questions.",
    lead: "Tell us the essentials. Your request is designed to be recorded, followed up and handled by the MBP team.",
  },
} as const;

const catalogueCopy = {
  fr: {
    formKicker: "Recevoir le catalogue",
    formTitle: "Vos coordonnées",
    kicker: "Catalogue 2026-2027",
    lead: "Indiquez vos coordonnées pour recevoir notre catalogue complet et imaginer la formule adaptée à votre événement.",
    list: [
      "Formules B2B et événements privés",
      "Suggestions pour chaque moment de la journée",
      "Accompagnement sur mesure par l’équipe MBP",
    ],
    title: "Découvrez l’univers MBP Catering.",
  },
  nl: {
    formKicker: "Catalogus ontvangen",
    formTitle: "Uw gegevens",
    kicker: "Catalogus 2026-2027",
    lead: "Laat uw gegevens achter om onze volledige catalogus te ontvangen en de formule voor uw evenement te ontdekken.",
    list: [
      "B2B- en privéformules",
      "Suggesties voor elk moment van de dag",
      "Begeleiding op maat door het MBP-team",
    ],
    title: "Ontdek de wereld van MBP Catering.",
  },
  en: {
    formKicker: "Receive the catalogue",
    formTitle: "Your details",
    kicker: "Catalogue 2026-2027",
    lead: "Leave your details to receive our complete catalogue and imagine the formula that suits your event.",
    list: [
      "Business and private-event formulas",
      "Suggestions for every moment of the day",
      "Tailored guidance from the MBP team",
    ],
    title: "Discover the world of MBP Catering.",
  },
} as const;

export function generateStaticParams() {
  return locales.flatMap((locale) => routes.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!locales.includes(locale) || !routes.includes(slug as RouteSlug)) {
    notFound();
  }

  if (slug === "devis") {
    const content = quoteCopy[locale];
    return createPageMetadata({
      locale,
      path: "/devis",
      title: content.title,
      description: content.lead,
    });
  }

  if (slug === "catalogue") {
    const content = catalogueCopy[locale];
    return createPageMetadata({
      locale,
      path: "/catalogue",
      title: content.title,
      description: content.lead,
    });
  }

  const page = detailPages[locale][slug as Exclude<RouteSlug, "devis">];
  return createPageMetadata({
    locale,
    path: `/${slug}`,
    title: page.title,
    description: page.lead,
  });
}

export default async function DetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!locales.includes(locale) || !routes.includes(slug as RouteSlug))
    notFound();

  if (slug === "devis") {
    const content = quoteCopy[locale];
    return (
      <>
        <SiteHeader locale={locale} />
        <main className="quote-page">
          <div className="shell page-heading">
            <p className="kicker">{content.kicker}</p>
            <h1>{content.title}</h1>
            <p>{content.lead}</p>
          </div>
          <div className="shell">
            <QuoteForm locale={locale} />
          </div>
        </main>
        <SiteFooter locale={locale} />
      </>
    );
  }

  if (slug === "catalogue") {
    const content = catalogueCopy[locale];
    return (
      <>
        <SiteHeader locale={locale} />
        <main className="catalogue-page">
          <section className="shell catalogue-gate">
            <div className="catalogue-gate-copy">
              <p className="kicker">{content.kicker}</p>
              <h1>{content.title}</h1>
              <p>{content.lead}</p>
              <ul>
                {content.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="catalogue-gate-form">
              <p className="kicker">{content.formKicker}</p>
              <h2>{content.formTitle}</h2>
              <CatalogueDownloadForm locale={locale} />
            </div>
          </section>
        </main>
        <SiteFooter locale={locale} />
      </>
    );
  }

  const page = detailPages[locale][slug as Exclude<RouteSlug, "devis">];

  if (slug === "galerie") {
    return (
      <>
        <SiteHeader locale={locale} />
        <main className="gallery-page">
          <section className="shell page-heading gallery-heading">
            <p className="kicker">MBP Catering</p>
            <h1>{page.title}</h1>
            <p>{page.lead}</p>
          </section>
          <section className="shell gallery-grid" aria-label={page.title}>
            {galleryImages.map((image, index) => (
              <figure
                className={`gallery-item gallery-item-${index + 1}`}
                key={image.src}
              >
                <Image
                  alt={image.alt}
                  fill
                  priority={index < 2}
                  sizes="(max-width: 820px) 100vw, 50vw"
                  src={image.src}
                />
              </figure>
            ))}
          </section>
        </main>
        <SiteFooter locale={locale} />
      </>
    );
  }

  return (
    <>
      <SiteHeader locale={locale} />
      <main className="detail-page">
        <section className="shell page-heading">
          <p className="kicker">MBP Catering</p>
          <h1>{page.title}</h1>
          <p>{page.lead}</p>
        </section>
        <section className="shell detail-content">
          <div>
            <p>{page.body}</p>
            <Link className="button" href={`/${locale}/devis`}>
              {copy[locale].quote}
            </Link>
          </div>
          <div className="detail-points">
            {page.points.map((point) => (
              <p key={point}>{point}</p>
            ))}
          </div>
        </section>
        {slug === "faq" && (
          <section className="shell faq-list">
            {faqCopy[locale].map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </section>
        )}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
