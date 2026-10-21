import { ImageResponse } from "next/og";
import { copy, Locale, locales } from "@/lib/site-content";

export const alt = "MBP Catering";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const content = locales.includes(locale) ? copy[locale] : copy.fr;

  return new ImageResponse(
    <div
      style={{
        alignItems: "flex-start",
        background:
          "linear-gradient(135deg, #211714 0%, #6f4037 55%, #b27e42 100%)",
        color: "#fffdf8",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "78px 88px",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 58, fontWeight: 700, letterSpacing: -3 }}>
          MBP Catering
        </span>
        <span style={{ fontSize: 22, letterSpacing: 6, marginTop: 8 }}>
          MY BEST PARTNER
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
        <span
          style={{
            fontSize: 76,
            fontWeight: 500,
            letterSpacing: -3,
            lineHeight: 1.06,
          }}
        >
          {content.hero}
        </span>
        <span style={{ fontSize: 28, marginTop: 30, opacity: 0.9 }}>
          Brussels · Catering & events
        </span>
      </div>
    </div>,
    size,
  );
}
