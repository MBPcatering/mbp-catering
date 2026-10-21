import type { Metadata } from "next";
import { Locale } from "./site-content";

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

export const siteUrl = new URL(configuredSiteUrl ?? "https://mbpcatering.be");

const localeCodes: Record<Locale, string> = {
  fr: "fr-BE",
  nl: "nl-BE",
  en: "en",
};

export function localizedPath(locale: Locale, slug = "") {
  return `/${locale}${slug}`;
}

export function localeAlternates(locale: Locale, path = "") {
  return {
    canonical: localizedPath(locale, path),
    languages: {
      "fr-BE": localizedPath("fr", path),
      "nl-BE": localizedPath("nl", path),
      en: localizedPath("en", path),
      "x-default": localizedPath("fr", path),
    },
  };
}

export function createPageMetadata({
  description,
  locale,
  path = "",
  title,
}: {
  description: string;
  locale: Locale;
  path?: string;
  title: string;
}): Metadata {
  const pagePath = localizedPath(locale, path);
  const imagePath = localizedPath(locale, "/opengraph-image");

  return {
    title,
    description,
    alternates: localeAlternates(locale, path),
    openGraph: {
      type: "website",
      locale: localeCodes[locale],
      url: pagePath,
      title,
      description,
      siteName: "MBP Catering",
      images: [{ url: imagePath, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imagePath],
    },
  };
}
