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
 *
 * ADR 0009 (Phase D3) ergänzt eine rein referenzielle Prüfung für Pool-
 * Abschlusstests: `question_pool`-Slugs müssen auf vorhandene Frage-Blöcke
 * zeigen, `questions_per_attempt` muss zur Pool-Größe passen, und ein Pool
 * verlangt `final_exam: true`. Keine neue MDX-Härtung — reine Frontmatter-
 * Referenz-Konsistenz.
 */
import { assertSafeMdx, MdxValidationError } from "../mdx/validate";
import { parseQuestionBlock } from "../quiz/question-parse";
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

  // 3. Frage-Blöcke (ADR 0009, Phase D1) — dieselbe MDX-Härtung wie Lesson-
  // Bodies, plus zwei domänenspezifische Prüfungen: das Format-Vertrag
  // (genau ein <Question> pro Datei) und Slug-Eindeutigkeit je Kurs (der
  // Frage-Slug ist der stabile Ref-Key im Index — ein Duplikat würde beim
  // Insert den Unique-Index verletzen bzw. eine Frage im Index verdecken).
  const seenSlugs = new Map<string, string>(); // slug -> erste Datei, die ihn nutzt
  for (const question of bundle.questions) {
    const file = `questions/${question.slug}.mdx`;
    await collectMdx(findings, question.body, file);

    const parsed = parseQuestionBlock(question.body);
    if (!parsed) {
      findings.push({
        file,
        message: `Frage-Block: kein <Question>-Element gefunden (erwartet genau eins).`,
      });
    }

    const firstFile = seenSlugs.get(question.slug);
    if (firstFile) {
      findings.push({
        file,
        message: `Frage-Block: Slug "${question.slug}" ist nicht eindeutig (bereits in ${firstFile} verwendet).`,
      });
    } else {
      seenSlugs.set(question.slug, file);
    }
  }

  // 4. Pool-Abschlusstest-Referenzen (ADR 0009, Phase D3) — eine `type: quiz`-
  // Lesson kann statt eines inline <Question>-Bodys einen Fragen-POOL per
  // Frontmatter referenzieren (`question_pool: [slug, ...]`). Drei
  // domänenspezifische Konsistenz-Prüfungen, rein auf Frontmatter-Ebene
  // (keine MDX-Härtung nötig, das ist reine YAML-Referenz-Prüfung):
  //   a) jeder referenzierte Slug muss ein im Bundle vorhandener Frage-Block
  //      sein (sonst zieht der Server zur Laufzeit ins Leere)
  //   b) `questions_per_attempt` (falls gesetzt) muss zwischen 1 und der
  //      Pool-Größe liegen (sonst kann der Server nicht genug/sinnvoll ziehen)
  //   c) `question_pool` gesetzt ⇒ `final_exam: true` erwartet — ein Pool
  //      ohne diesen Marker wäre ein inkonsistent autor-ter Abschlusstest
  const knownQuestionSlugs = new Set(seenSlugs.keys());
  for (const section of bundle.sections) {
    for (const lesson of section.lessons) {
      const fm = lesson.frontmatter;
      const pool: unknown = fm.question_pool;
      if (pool == null) continue;

      const file = `${section.slug}/${lesson.slug}.mdx`;

      if (!Array.isArray(pool)) {
        findings.push({
          file,
          message: `question_pool muss eine Liste von Frage-Slugs sein.`,
        });
        continue;
      }

      for (const slug of pool) {
        if (typeof slug !== "string" || !knownQuestionSlugs.has(slug)) {
          findings.push({
            file,
            message: `question_pool referenziert unbekannten Frage-Slug '${String(slug)}'.`,
          });
        }
      }

      const poolSize = pool.length;
      const perAttempt: unknown = fm.questions_per_attempt;
      if (perAttempt != null) {
        if (
          typeof perAttempt !== "number" ||
          !Number.isFinite(perAttempt) ||
          perAttempt < 1 ||
          perAttempt > poolSize
        ) {
          findings.push({
            file,
            message:
              `questions_per_attempt (${String(perAttempt)}) muss zwischen 1 ` +
              `und der Pool-Größe (${poolSize}) liegen.`,
          });
        }
      }

      if (fm.final_exam !== true) {
        findings.push({
          file,
          message: `question_pool gesetzt, aber final_exam ist nicht true — ein Fragen-Pool erwartet final_exam: true.`,
        });
      }
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
