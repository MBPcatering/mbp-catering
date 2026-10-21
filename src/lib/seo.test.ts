import { describe, expect, it } from "vitest";
import { localeAlternates, localizedPath, siteUrl } from "./seo";

describe("SEO URLs", () => {
  it("builds localized paths without duplicate slashes", () => {
    expect(localizedPath("fr")).toBe("/fr");
    expect(localizedPath("nl", "/catalogue")).toBe("/nl/catalogue");
  });

  it("publishes reciprocal language alternates with French as default", () => {
    expect(localeAlternates("nl", "/catalogue")).toEqual({
      canonical: "/nl/catalogue",
      languages: {
        "fr-BE": "/fr/catalogue",
        "nl-BE": "/nl/catalogue",
        en: "/en/catalogue",
        "x-default": "/fr/catalogue",
      },
    });
  });

  it("uses the production domain as the default canonical origin", () => {
    expect(siteUrl.origin).toBe("https://mbpcatering.be");
  });
});
