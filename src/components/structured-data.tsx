import { Locale } from "@/lib/site-content";
import { siteUrl } from "@/lib/seo";

export function StructuredData({ locale }: { locale: Locale }) {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Caterer",
        "@id": `${siteUrl}#business`,
        name: "MBP Catering",
        alternateName: "My Best Partner",
        url: siteUrl.toString(),
        email: "info@mbpcatering.be",
        image: new URL(`/${locale}/opengraph-image`, siteUrl).toString(),
        priceRange: "€€",
        address: {
          "@type": "PostalAddress",
          streetAddress: "24 avenue Seghers",
          postalCode: "1080",
          addressLocality: "Molenbeek-Saint-Jean",
          addressCountry: "BE",
        },
        areaServed: {
          "@type": "City",
          name: "Brussels",
        },
        availableLanguage: ["French", "Dutch", "English"],
        sameAs: ["https://www.instagram.com/catering.mbp/"],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}#website`,
        name: "MBP Catering",
        url: siteUrl.toString(),
        inLanguage: locale,
        publisher: { "@id": `${siteUrl}#business` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
