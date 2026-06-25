import { brand, splitBrandName } from "@/lib/brand";

/**
 * Wortmarke: rendert den Brand-Namen mit optionalem ausgegrauten Suffix
 * (Teil nach dem letzten Punkt). Für verstande.ch wird ".ch" muted, für
 * FiKnow rendert der ganze Name in Primärfarbe.
 *
 * Nutzt die `tldClassName`-Prop, weil die Komponente in mehreren Layouts
 * mit unterschiedlichen CSS-Modulen verwendet wird — jedes liefert seine
 * eigene Suffix-Style-Klasse.
 */
export function BrandWordmark({ tldClassName }: { tldClassName?: string }) {
  const { main, suffix } = splitBrandName(brand.name);
  return (
    <>
      {main}
      {suffix && <span className={tldClassName}>{suffix}</span>}
    </>
  );
}
