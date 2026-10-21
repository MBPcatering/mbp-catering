import type { MetadataRoute } from "next";
import { locales, routes } from "@/lib/site-content";
import { localizedPath, siteUrl } from "@/lib/seo";

const indexedRoutes = routes;
const lastModified = new Date("2026-10-21T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.flatMap((locale) => [
    {
      url: new URL(localizedPath(locale), siteUrl).toString(),
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...indexedRoutes.map((slug) => ({
      url: new URL(localizedPath(locale, `/${slug}`), siteUrl).toString(),
      lastModified,
      changeFrequency: "monthly" as const,
      priority: slug === "devis" || slug === "contact" ? 0.7 : 0.8,
    })),
  ]);
}
