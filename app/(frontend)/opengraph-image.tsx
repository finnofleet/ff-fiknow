/**
 * Globales OG-Default-Bild für Link-Previews (WhatsApp, Slack, Telegram etc.).
 *
 * Dient als Fallback für alle Pages, die kein eigenes OG-Bild definieren.
 * Next.js bedient das Bild als /opengraph-image und setzt
 * <meta property="og:image"> automatisch.
 *
 * Schrift: kein externes Font-File nötig — system-ui ist auf allen
 * Rendering-Servern verfügbar und passt gut zu Manrope.
 */
import { ImageResponse } from "next/og";

import { brand } from "@/lib/brand";

export const alt = `${brand.name} — ${brand.tagline}`;

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          padding: "72px 80px",
          background: "#0d0d0d",
          position: "relative",
        }}
      >
        {/* Akzent-Linie oben.
            Hex-Wert statt oklch() weil Satori (ImageResponse-Engine) noch
            kein oklch() unterstützt. #d4a647 ≈ oklch(0.78 0.14 70). */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "4px",
            background: "#d4a647",
          }}
        />

        {/* Brand-Name */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#f5f5f5",
            letterSpacing: "-0.02em",
            fontFamily: "system-ui, sans-serif",
            lineHeight: 1.1,
            marginBottom: 20,
          }}
        >
          {brand.name}
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 400,
            color: "#a0a0a0",
            fontFamily: "system-ui, sans-serif",
            letterSpacing: "0.01em",
          }}
        >
          {brand.tagline}
        </div>
      </div>
    ),
    size,
  );
}
