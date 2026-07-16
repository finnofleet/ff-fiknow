/**
 * SEO-Hilfsfunktionen.
 *
 * Alle Helpers sind bewusst schlank gehalten — kein Framework,
 * nur kleine pure Funktionen, die in generateMetadata() genutzt werden.
 */

/**
 * Kürzt einen Text auf maximal `max` Zeichen (Default 160).
 * Schneidet an Wortgrenze ab und hängt "…" an.
 */
export function truncateDescription(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + "…";
}

/**
 * Liefert die kanonische URL für einen Pfad relativ zur Site-Root.
 * Wird als String zurückgegeben — Next.js löst ihn gegen metadataBase auf.
 *
 * Beispiel: canonicalPath("/courses/a2-drohne") → "/courses/a2-drohne"
 */
export function canonicalPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}
