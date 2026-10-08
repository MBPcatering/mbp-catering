"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMobileMenuLabel } from "@/lib/mobile-menu";
import { hasScrolledPastHeader } from "@/lib/header-scroll";
import { Locale, copy } from "@/lib/site-content";

const destinations = ["/", "/b2b", "/evenements-prives", "/catalogue", "/a-propos", "/contact"];

export function SiteHeader({ locale, overlay = false }: { locale: Locale; overlay?: boolean }) {
  const content = copy[locale];
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    if (!overlay) return;

    const updateHeader = () => setIsScrolled(hasScrolledPastHeader(window.scrollY));
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, [overlay]);

  return <header className={`site-header${overlay ? " site-header-overlay" : ""}${isScrolled ? " is-scrolled" : ""}`}>
    <div className="shell nav-wrap">
      <Link href={`/${locale}`} className="brand" aria-label="MBP Catering">MBP <span>Catering</span><small>{content.tagline}</small></Link>
      <nav className="desktop-nav" aria-label="Navigation principale">{content.nav.map((item, index) => <Link key={item} href={`/${locale}${destinations[index]}`}>{item}</Link>)}</nav>
      <div className="nav-actions"><Link className="button button-small" href={`/${locale}/devis`}>{content.quote}</Link></div>
      <button className={`mobile-menu-toggle${isMobileMenuOpen ? " is-open" : ""}`} type="button" aria-expanded={isMobileMenuOpen} aria-controls="mobile-menu" aria-label={getMobileMenuLabel(isMobileMenuOpen)} onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}><span /><span /><span /></button>
    </div>
    <nav id="mobile-menu" className={`mobile-menu${isMobileMenuOpen ? " is-open" : ""}`} aria-label="Navigation mobile">
      <div className="shell mobile-menu-content">{content.nav.map((item, index) => <Link key={item} href={`/${locale}${destinations[index]}`} onClick={() => setIsMobileMenuOpen(false)}>{item}</Link>)}<div className="mobile-language-switch">{(["fr", "nl", "en"] as Locale[]).map((language) => <Link key={language} href={`/${language}`} className={language === locale ? "active" : ""} onClick={() => setIsMobileMenuOpen(false)}>{language.toUpperCase()}</Link>)}</div></div>
    </nav>
  </header>;
}
