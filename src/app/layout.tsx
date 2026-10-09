import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MBP Catering | Votre événement, notre savoir-faire",
  description:
    "Catering professionnel et événementiel à Bruxelles et dans les environs.",
  applicationName: "MBP Catering",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
