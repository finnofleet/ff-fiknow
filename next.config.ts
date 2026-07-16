import { execSync } from "node:child_process";

import type { NextConfig } from "next";

import { withPayload } from "@payloadcms/next/withPayload";

/**
 * Git-SHA des Builds — beim `next build` aus dem Repo gelesen und via
 * env.BUILD_SHA in den Server gebacken. Macht `/api/health` zur eindeutigen
 * „welcher Commit läuft?"-Quelle. Fällt auf eine gesetzte BUILD_SHA-Env oder
 * "unknown" zurück, falls git im Build-Container fehlt.
 */
function resolveBuildSha(): string {
  if (process.env.BUILD_SHA) return process.env.BUILD_SHA;
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const BUILD_SHA = resolveBuildSha();

const nextConfig: NextConfig = {
  // Erzeugt einen self-contained Server-Build unter `.next/standalone/`
  // (~50 MB statt ~500 MB) — Voraussetzung für schlanke Docker-Images
  // und Deployment auf Jelastic / Exoscale / jedem Container-Host.
  output: "standalone",

  // ADR 0004 Phase 2: Der MCP-Server liest das Autoren-Wissen (lib/authoring/
  // guide.ts) zur Laufzeit aus diesen Doc-/Beispiel-Files. Der Standalone-
  // Tracer erfasst sie nicht (keine JS-Imports) → hier explizit der MCP-Route
  // zuordnen, damit sie unter .next/standalone landen. Key = Route-Glob
  // (picomatch; `*` matcht das [transport]-Segment).
  outputFileTracingIncludes: {
    "/api/mcp/*": [
      "./docs/**/*.md",
      "./tooling/course-plugin/examples/minimal-course/**/*",
      "./brand/**/*",
    ],
  },

  // Build-Metadaten in den Server backen (siehe resolveBuildSha + /api/health).
  env: {
    BUILD_SHA,
  },

  // Security-Header auf allen Routen.
  async headers() {
    // Content-Security-Policy.
    //
    // - default-src 'self'  → alles aus eigener Origin erlaubt
    // - script-src 'self' 'unsafe-inline'  → Next.js injiziert für Hydration
    //   einige Inline-Scripts. Nonce-basiert würde Server-Components
    //   komplizieren — pragmatisch 'unsafe-inline' lassen. Reduziert XSS-
    //   Schutz, aber alle anderen Restrictions greifen.
    // - style-src 'self' 'unsafe-inline'  → brandStyle in layout.tsx
    //   ist inline (über dangerouslySetInnerHTML), zudem inline-style-Attribute
    //   von Lucide-Icons + diversen CSS-Modules
    // - img-src 'self' data: blob:  → Inline-data-URIs für Icons + Blob-URIs
    //   für Drag&Drop-Previews
    // - font-src 'self' data:  → next/font/google self-hostet bei Build,
    //   data: für Inline-Fonts (z.B. Lucide)
    // - connect-src 'self' + Supabase-URL  → fetch zu GoTrue + Plattform-API
    // - frame-ancestors 'none'  → keine iframe-Einbettung von aussen
    // - base-uri 'self'  → blockt <base>-Tag-Hijacks
    // - form-action 'self'  → Formulare gehen nur an eigene Origin
    //
    // Bewusst NICHT auf /admin und /api angewandt: Payload-Admin nutzt
    // unsafe-eval u.a. — separate Source-Regel mit nur den anderen
    // Security-Headern.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseOrigin = supabaseUrl
      ? new URL(supabaseUrl).origin
      : "";

    // In Development braucht React/Turbopack 'unsafe-eval' für HMR +
    // Stack-Reconstruction. Prod-Builds nutzen kein eval() — dort
    // bleibt die strikte Policy.
    const isDev = process.env.NODE_ENV !== "production";

    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self'${supabaseOrigin ? " " + supabaseOrigin : ""}${isDev ? " ws: http:" : ""}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");

    const baseHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      },
    ];

    // Restriktive CSP für direkt servierte Media-Dateien (SECURITY_AUDIT 9):
    // neutralisiert aktive Inhalte (script-src 'none' + sandbox), falls je eine
    // Datei die Sanitisierung (media-sanitize.ts) überlebt. Bricht Inline-
    // Anzeige NICHT — bei <img>/<Image>-Subressourcen greift die Document-CSP
    // (inkl. sandbox) ohnehin nicht; sie schützt die Direktnavigation auf die
    // Datei. Bewusst KEIN Content-Disposition: attachment (Risiko für den
    // next/image-Optimizer-Fetch; die CSP ist die tragende Abwehr).
    const mediaCsp = [
      {
        key: "Content-Security-Policy",
        value:
          "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src 'self' data:; script-src 'none'; sandbox",
      },
    ];

    return [
      {
        // Frontend-Routen: volle CSP + Standard-Header
        source: "/((?!admin|api).*)",
        headers: [
          ...baseHeaders,
          { key: "Content-Security-Policy", value: csp },
        ],
      },
      {
        // Payload-Admin + API: nur Basic-Header, KEINE CSP — Payload-UI
        // nutzt unsafe-eval, dynamische Skripte etc. Eigenes CSP-Setup
        // wäre möglich, aber Payload pflegt das nicht out-of-the-box.
        source: "/(admin|api)(/.*)?",
        headers: baseHeaders,
      },
      {
        // Payload-API-Pfad der Media-Dateien (Default-URL, so im Import-Rewrite
        // referenziert: SVG via plain <img>, Raster als Optimizer-Quelle).
        // Steht NACH der /api-Regel → gewinnt bei Key-Kollision (Next: „last
        // header wins"). baseHeaders kommen weiterhin von der /api-Regel.
        source: "/api/media/file/:path*",
        headers: mediaCsp,
      },
      {
        // Statischer Zweitpfad: Payload schreibt nach public/media, Next
        // serviert das unter /media/… → dieselbe strikte CSP, damit dieser
        // Pfad nicht die laxere Frontend-CSP (script 'unsafe-inline') erbt.
        source: "/media/:path*",
        headers: mediaCsp,
      },
    ];
  },

  images: {
    // Wir liefern unsere eigenen, vom Autor verwalteten SVGs aus.
    // Für inhaltliche Diagramme ist SVG bewusst zugelassen.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

// withPayload integriert das Payload-CMS als Plugin — dadurch laufen
// Admin-UI (`/admin`) und REST-/GraphQL-API (`/api/...`) aus demselben
// Next.js-Server. Siehe payload.config.ts für die Inhaltskonfiguration.
export default withPayload(nextConfig);
