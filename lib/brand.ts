import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Brand-Konfiguration aus brand/brand.yaml.
 *
 * Lebenszyklus:
 * - Lokal: brand/brand.yaml im Repo (verstande als Default)
 * - Production: ein externer Brand-Repo wird als /app/brand gemountet,
 *   der diese Default-Konfig überschreibt
 *
 * Der Pfad zur YAML kann via `BRAND_CONFIG_PATH` env überschrieben werden.
 *
 * Wird einmalig beim Modul-Load gelesen — bei Brand-Änderung Container
 * neu starten.
 */

export type BrandConfig = {
  identity: {
    name: string;
    tagline: string;
    description: string;
    domain: string;
    markLetter: string;
  };
  design: {
    fontSet: "editorial" | "sora";
    accent: string;
    accentInk: string;
  };
  hero: {
    intro: string;
  };
};

const FALLBACK: BrandConfig = {
  identity: {
    name: "verstande.ch",
    tagline: "Nöd nur gwüsst. Verstande.",
    description:
      "Editoriale Lernplattform für Themen, die verstanden werden wollen.",
    domain: "verstande.ch",
    markLetter: "v",
  },
  design: {
    fontSet: "editorial",
    accent: "0.78 0.14 70",
    accentInk: "0.20 0.02 70",
  },
  hero: {
    intro:
      "Wir starten mit dem Drohnen-Führerschein A2. Weitere Kurse folgen — Wein, Meteorologie, und alles andere, was sich lohnt, in Ruhe zu durchdenken.",
  },
};

function loadBrandConfig(): BrandConfig {
  const configPath =
    process.env.BRAND_CONFIG_PATH ??
    path.join(process.cwd(), "brand", "brand.yaml");
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = parseYaml(raw) as Partial<BrandConfig>;
    // Shallow-merge mit Fallback, damit fehlende Felder Defaults bekommen
    return {
      identity: { ...FALLBACK.identity, ...(parsed.identity ?? {}) },
      design: { ...FALLBACK.design, ...(parsed.design ?? {}) },
      hero: { ...FALLBACK.hero, ...(parsed.hero ?? {}) },
    };
  } catch (err) {
    console.warn(
      `[brand] Konnte ${configPath} nicht lesen — verwende Fallback.`,
      err instanceof Error ? err.message : err,
    );
    return FALLBACK;
  }
}

export const brandConfig = loadBrandConfig();

/**
 * Liest ein optionales Brand-Logo ein, mit zwei Fallback-Stufen:
 *
 *   1. Bevorzugt: <dirname(BRAND_CONFIG_PATH)>/assets/logo.svg
 *      (Brand-Overlay liefert eigenes Logo mit, z. B. fiknow-brand).
 *   2. Fallback: ./brand/assets/logo.svg im Default-Pfad
 *      (greift wenn der Overlay-Pfad existiert aber kein Logo bringt,
 *      oder wenn der Overlay-Pfad ganz fehlt — beides typisch im
 *      lokalen Dev mit veralteter BRAND_CONFIG_PATH-Var).
 *
 * Bewusst SYNCHRON beim Modul-Load — der File ist klein (typisch <5 KB),
 * wird einmal pro Container-Lebenszeit gelesen und im Speicher gehalten.
 */
function loadBrandLogo(): string | null {
  const configPath =
    process.env.BRAND_CONFIG_PATH ??
    path.join(process.cwd(), "brand", "brand.yaml");
  const candidatePaths = [
    path.join(path.dirname(configPath), "assets", "logo.svg"),
    path.join(process.cwd(), "brand", "assets", "logo.svg"),
  ];
  for (const logoPath of candidatePaths) {
    try {
      const svg = readFileSync(logoPath, "utf8");
      return svg.trim();
    } catch {
      // probiere nächsten Kandidaten
    }
  }
  return null;
}

export const brandLogoSvg = loadBrandLogo();

/** Convenience-Aliase für gängige Felder */
export const brand = {
  name: brandConfig.identity.name,
  tagline: brandConfig.identity.tagline,
  description: brandConfig.identity.description,
  domain: brandConfig.identity.domain,
  markLetter: brandConfig.identity.markLetter,
  fontSet: brandConfig.design.fontSet,
  accentOklch: brandConfig.design.accent,
  accentInkOklch: brandConfig.design.accentInk,
} as const;

export const brandFullName = brand.name;
export const titleSuffix = ` — ${brandFullName}`;

/** Spaltet den Brand-Namen am letzten Punkt: { main, suffix } */
export function splitBrandName(name: string): { main: string; suffix: string } {
  const lastDot = name.lastIndexOf(".");
  if (lastDot < 0) return { main: name, suffix: "" };
  return { main: name.slice(0, lastDot), suffix: name.slice(lastDot) };
}
