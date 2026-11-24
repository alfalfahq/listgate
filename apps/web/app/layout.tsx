import type { Metadata } from "next";
import "./globals.css";

const DESCRIPTION = "Listgate is the distribution layer behind property portals. Agents tick one box in their CRM and their listings reach the products they choose.";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${process.env.ROOT_DOMAIN || "listgate.com.au"}`),
  title: "Listgate: one feed, every outcome",
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "Listgate", locale: "en_AU", title: "Listgate: one feed, every outcome", description: DESCRIPTION, url: "/" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
