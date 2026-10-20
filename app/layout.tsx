import type { Metadata } from "next";
import { Bungee, Figtree, Monoton } from "next/font/google";
import "@/components/arc/foundation.css";
import "./globals.css";

const monoton = Monoton({ variable: "--font-monoton", weight: "400", subsets: ["latin"] });
const bungee = Bungee({ variable: "--font-bungee", weight: "400", subsets: ["latin"] });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

// Vercel sets this on every deployment, so link previews always point at the public site.
const siteHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const metadata: Metadata = {
  metadataBase: new URL(siteHost ? `https://${siteHost}` : "http://localhost:3000"),
  title: {
    default: "Kitty's Arcade",
    template: "%s | Kitty's Arcade",
  },
  description: "Kat's jukebox of homemade browser games. Pick a record and play.",
  openGraph: {
    siteName: "Kitty's Arcade",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${monoton.variable} ${bungee.variable} ${figtree.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
