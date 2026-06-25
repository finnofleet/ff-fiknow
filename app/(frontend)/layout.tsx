import type { Metadata } from "next";
import { Newsreader, Manrope, Sora, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeToggle } from "@/components/theme-toggle";
import { brand, brandFullName } from "@/lib/brand";
import "./globals.css";

// Alle verfügbaren Schriften werden zur Build-Zeit eingebunden (next/font
// verlangt statische Imports). Welches Set zur Laufzeit verwendet wird,
// entscheidet BRAND_FONT_SET via inline-CSS-Mapping unten.

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  // Kursiv-Subset bewusst nicht geladen — wir nutzen Kursiv plattformweit
  // nicht mehr (Display-Font-Swap + Color/Weight reichen als Akzent).
  style: ["normal"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Site-URL: NEXT_PUBLIC_SITE_URL per Env überschreibbar (z. B. für Brand-Overlays).
// Muss ein URL-Objekt sein — Next.js löst relative Pfade in openGraph.images etc. dagegen auf.
const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? `https://${brand.domain}`,
);

// Standard-OG-Bild, das alle Pages erben, sofern sie kein eigenes setzen.
// Der Pfad ist relativ zu metadataBase und zeigt auf opengraph-image.tsx
// in diesem Segment, das Next.js automatisch als /opengraph-image bedient.
const defaultOgImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${brandFullName} — ${brand.tagline}`,
};

export const metadata: Metadata = {
  // metadataBase erlaubt relative Pfade in openGraph.images, alternates.canonical etc.
  metadataBase: siteUrl,

  // title.template wird auf Child-Segments angewendet: "Kurse" → "Kurse | verstande.ch"
  // title.default greift, wenn eine Sub-Page kein eigenes title setzt.
  title: {
    default: `${brandFullName} — ${brand.tagline}`,
    template: `%s | ${brandFullName}`,
  },

  description: brand.description,

  // Kanonische URL für die Root — Sub-Pages überschreiben dies mit ihrem Pfad.
  alternates: {
    canonical: "/",
  },

  openGraph: {
    siteName: brandFullName,
    type: "website",
    locale: "de_CH",
    title: `${brandFullName} — ${brand.tagline}`,
    description: brand.description,
    images: [defaultOgImage],
  },

  twitter: {
    card: "summary_large_image",
    title: `${brandFullName} — ${brand.tagline}`,
    description: brand.description,
    images: [defaultOgImage.url],
  },
};

// Brand-Werte kommen aus Runtime-Env (BRAND_*). Static-Prerendering würde
// die Defaults aus der Build-Umgebung einbacken — daher alles dynamisch.
export const dynamic = "force-dynamic";

// Pro Brand-Font-Set: welche Schrift wird zu --font-display und --font-sans?
const fontSetMap: Record<string, { display: string; sans: string }> = {
  editorial: {
    display: "var(--font-newsreader)",
    sans: "var(--font-manrope)",
  },
  sora: {
    display: "var(--font-sora)",
    sans: "var(--font-sora)",
  },
};

const activeFonts = fontSetMap[brand.fontSet] ?? fontSetMap.editorial;

const brandStyle = `:root {
  --accent: oklch(${brand.accentOklch});
  --accent-ink: oklch(${brand.accentInkOklch});
  --font-display: ${activeFonts.display};
  --font-sans: ${activeFonts.sans};
}`;

const themeStorageKey = `${brand.name}-theme`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Theme aus Cookie lesen (Server-Side, gesetzt vom ThemeToggle).
  // Default `dark` falls keiner gesetzt ist. Damit ist `data-theme` schon
  // im SSR-HTML, kein Flash und kein Inline-Script mehr nötig.
  const cookieStore = await cookies();
  const theme = cookieStore.get("theme")?.value === "light" ? "light" : "dark";

  return (
    <html
      lang="de"
      className={`${newsreader.variable} ${manrope.variable} ${sora.variable} ${mono.variable}`}
      data-font-set={brand.fontSet}
      data-theme={theme}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: brandStyle }} />
      </head>
      <body>
        {children}
        <ThemeToggle storageKey={themeStorageKey} />
      </body>
    </html>
  );
}
