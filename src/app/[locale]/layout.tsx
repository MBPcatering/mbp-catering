import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { copy, Locale, locales } from "@/lib/site-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!locales.includes(locale)) notFound();

  return {
    title: `MBP Catering | ${copy[locale].hero}`,
    description: copy[locale].intro,
  };
}

export default function LocaleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
