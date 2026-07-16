/**
 * Größen-/Zeit-Grenzen der MDX-Pipeline (SECURITY_AUDIT, Finding 10).
 *
 * Bewusst ohne weitere Imports — wird sowohl von der MDX-Validierung
 * (`lib/mdx/validate.ts`) als auch vom Payload-Lessons-Schema gezogen; Letzteres
 * soll keine schweren MDX-Deps in den Config-Graph holen.
 */

/**
 * Harte Obergrenze für einen MDX-Body in Zeichen. Großzügig (≈ 30k Wörter) —
 * ein Sicherheits-Cap gegen Compile-Bomben, kein Stil-Limit. Die didaktische
 * Empfehlung (< ~2.000 Wörter) steht in AUTHORING_BUNDLE.md.
 */
export const MAX_MDX_SOURCE_CHARS = 200_000;

/**
 * Maximale Wartezeit auf einen MDX-Compile, bevor abgebrochen wird. Begrenzt
 * die Request-Latenz bei pathologischen Eingaben (der Compile selbst lässt sich
 * nicht hart abbrechen — echte Isolation wäre Finding 12).
 */
export const MDX_COMPILE_TIMEOUT_MS = 5_000;
