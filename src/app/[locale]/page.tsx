import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getHeroVideoSource, heroVideo } from "@/lib/hero-video";
import { homeCopy, Locale, copy, locales } from "@/lib/site-content";
import { createPageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!locales.includes(locale)) notFound();

  return createPageMetadata({
    locale,
    title: copy[locale].hero,
    description: copy[locale].intro,
  });
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale)) notFound();
  const content = copy[locale];
  const home = homeCopy[locale];
  const heroVideoSource = getHeroVideoSource(
    existsSync(join(process.cwd(), "public", heroVideo.src.slice(1))),
  );
  return (
    <>
      <SiteHeader locale={locale} overlay />
      <main>
        <section className="hero">
          <div
            className="hero-video-fallback"
            aria-label={heroVideo.fallback}
          />
          {heroVideoSource && (
            <video
              key={heroVideoSource}
              className="hero-video"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
            >
              <source src={heroVideoSource} type="video/mp4" />
            </video>
          )}
          <div className="hero-video-overlay" aria-hidden="true" />
          <div className="shell hero-grid">
            <div className="hero-copy">
              <p className="kicker">{home.heroKicker}</p>
              <h1>{content.hero}</h1>
              <p className="hero-intro">{content.intro}</p>
              <div className="hero-actions">
                <Link className="text-link" href={`/${locale}/catalogue`}>
                  {content.catalogue} <span></span>
                </Link>
              </div>
            </div>
          </div>
          <a
            className="hero-follow"
            href="https://www.instagram.com/catering.mbp/"
            target="_blank"
            rel="noreferrer"
          >
            <span>{home.follow}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" />
            </svg>
          </a>
        </section>
        <section className="shell service-intro">
          <p className="kicker">{home.introductionKicker}</p>
          <div className="split-heading">
            <h2>{home.introductionTitle}</h2>
            <p>{home.introductionBody}</p>
          </div>
          <div className="service-grid">
            <Link href={`/${locale}/b2b`} className="service-card business">
              <span>{home.businessEyebrow}</span>
              <h3>{content.b2b}</h3>
              <p>{content.b2bText}</p>
              <b>{home.discover}</b>
            </Link>
            <Link
              href={`/${locale}/evenements-prives`}
              className="service-card private"
            >
              <span>{home.privateEyebrow}</span>
              <h3>{content.private}</h3>
              <p>{content.privateText}</p>
              <b>{home.imagine}</b>
            </Link>
          </div>
        </section>
        <section className="catalogue-band">
          <div className="shell catalogue-layout">
            <div>
              <p className="kicker">{home.catalogueKicker}</p>
              <h2>{content.catalogueTitle}</h2>
              <p>{content.catalogueText}</p>
              <Link
                className="button button-light"
                href={`/${locale}/catalogue`}
              >
                {home.receiveCatalogue}
              </Link>
            </div>
            <ul>
              {home.cataloguePoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </section>
        <section className="shell trust-section">
          <div>
            <p className="kicker">{home.trustKicker}</p>
            <h2>{home.trustTitle}</h2>
          </div>
          <div className="trust-list">
            <p>
              <strong>10 {home.guestsLabel}</strong> {home.trustMinimum}
            </p>
            <p>
              <strong>48 h / 5 {home.daysLabel}</strong> {home.trustDeadline}
            </p>
            <p>
              <strong>± 40 km</strong> {home.trustArea}
            </p>
            <p>
              <strong>250 €</strong> {home.trustDelivery}
            </p>
          </div>
        </section>
        <section className="shell final-cta">
          <p className="kicker">{home.finalKicker}</p>
          <h2>{home.finalTitle}</h2>
          <p>{home.finalBody}</p>
          <Link className="button" href={`/${locale}/devis`}>
            {content.quote}
          </Link>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
