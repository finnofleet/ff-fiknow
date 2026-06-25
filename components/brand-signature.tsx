import { brand, brandLogoSvg } from "@/lib/brand";

import { BrandWordmark } from "./brand-wordmark";

type Props = {
  /** CSS-Klasse für das Fallback-Mark-Kästchen (z. B. `styles.mark`). */
  markClassName?: string;
  /** CSS-Klasse für den Fallback-Wortmark-Container. */
  nameClassName?: string;
  /** CSS-Klasse für das `.tld`-Suffix im Wortmark (".ch" o. ä.). */
  tldClassName?: string;
};

/**
 * Komplette Brand-Signatur — entweder Inline-SVG-Logo (wenn
 * `brand/assets/logo.svg` existiert) oder Fallback aus Mark-Kästchen
 * + Wordmark-Text.
 *
 * Wichtig: Im Logo-Mode wird der Mark-Kästchen-Container NICHT
 * gerendert — das Logo bringt seine eigene Aspect-Ratio mit. Höhe
 * kontrollierbar via CSS-Variable `--brand-logo-h` im umgebenden
 * Container (Default 32px), siehe globals.css.
 *
 * Beispiel-Einsatz:
 *
 *   <Link className={styles.brand}>
 *     <BrandSignature
 *       markClassName={styles.mark}
 *       nameClassName={styles.name}
 *       tldClassName={styles.tld}
 *     />
 *   </Link>
 *
 * Bei Logo-Mode werden alle drei className-Props ignoriert, weil das
 * Logo den ganzen Brand-Slot selbst füllt.
 */
export function BrandSignature({
  markClassName,
  nameClassName,
  tldClassName,
}: Props) {
  if (brandLogoSvg) {
    return (
      <span
        className="brand-logo"
        aria-label={brand.name}
        // SVG kommt aus dem Repo / Brand-Overlay — vertrauenswürdig.
        dangerouslySetInnerHTML={{ __html: brandLogoSvg }}
      />
    );
  }
  return (
    <>
      {markClassName && (
        <span className={markClassName}>{brand.markLetter}</span>
      )}
      {nameClassName ? (
        <span className={nameClassName}>
          <BrandWordmark tldClassName={tldClassName} />
        </span>
      ) : (
        <BrandWordmark tldClassName={tldClassName} />
      )}
    </>
  );
}
