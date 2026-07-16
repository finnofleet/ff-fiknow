/**
 * Bundle-Validierung ohne Schreiben (ADR 0004, Phase 1) — gibt Fremd-Agents
 * (und Menschen) eine Selbstkorrektur-Schleife VOR dem teuren Import-Roundtrip.
 *
 * Reuse statt Neubau: dieselben Bausteine wie der echte Import —
 * `parseBundleFromFiles` für die Struktur, `assertSafeMdx` für jeden Body. Der
 * Unterschied ist der Modus: der Import bricht beim ersten Verstoß ab (nichts
 * darf halb geschrieben werden), `validateBundleFiles` SAMMELT stattdessen.
 *
 * Sammel-Granularität (bewusst, Phase 1):
 *   - STRUKTUR (fehlende course.mdx, ungültige Slugs, fehlendes NN-Präfix) prüft
 *     der Parser fail-fast → höchstens EIN struktureller Befund pro Lauf. Ist
 *     die Struktur kaputt, lässt sich der Rest ohnehin nicht zuverlässig lesen.
 *   - MDX-Bodies werden ALLE geprüft und alle Verstöße gesammelt — das ist der
 *     häufige Autorenfall („3 Syntaxfehler über mehrere Lessons verteilt").
 */
import { assertSafeMdx, MdxValidationError } from "../mdx/validate";
import { parseBundleFromFiles } from "./bundle-parser";

export type BundleValidationFinding = {
  /** Datei, auf die sich der Befund bezieht (best-effort). */
  file: string;
  /** Zeilennummer, falls bekannt (MDX-Fehler liefern sie i. d. R. nicht). */
  line?: number;
  message: string;
};

/**
 * Validiert ein Bundle (als File-Map) gegen die Format-Spec, ohne zu schreiben.
 * Gibt eine Liste von Befunden zurück — leer = gültig.
 */
export async function validateBundleFiles(
  courseSlug: string,
  files: Map<string, Buffer>,
): Promise<BundleValidationFinding[]> {
  const findings: BundleValidationFinding[] = [];

  // 1. Struktur (fail-fast — der Parser wirft beim ersten Strukturfehler).
  let bundle;
  try {
    bundle = parseBundleFromFiles(courseSlug, files);
  } catch (err) {
    findings.push({
      file: "course.mdx",
      message: `Struktur: ${(err as Error).message}`,
    });
    return findings; // ohne valide Struktur keine sinnvolle Body-Prüfung
  }

  // 2. MDX-Bodies — alle prüfen, alle Verstöße sammeln.
  await collectMdx(findings, bundle.course.body, `${courseSlug}/course.mdx`);
  for (const section of bundle.sections) {
    for (const lesson of section.lessons) {
      await collectMdx(
        findings,
        lesson.body,
        `${section.slug}/${lesson.slug}.mdx`,
      );
    }
  }

  return findings;
}

async function collectMdx(
  findings: BundleValidationFinding[],
  body: string,
  file: string,
): Promise<void> {
  try {
    await assertSafeMdx(body, file);
  } catch (err) {
    if (err instanceof MdxValidationError) {
      findings.push({ file, message: err.message });
    } else {
      findings.push({ file, message: (err as Error).message });
    }
  }
}
