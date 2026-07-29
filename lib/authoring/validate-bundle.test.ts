import { describe, expect, it } from "vitest";

import { validateBundleFiles } from "./validate-bundle";

/**
 * Baut ein minimales, ansonsten valides Bundle als File-Map. `overrides`
 * ersetzt/ergänzt einzelne Dateien (Key = bundle-root-relativer Pfad) — so
 * kann jeder Test nur die eine Datei ändern, die den zu prüfenden Fall
 * auslöst (Rest bleibt der bekannte Gut-Fall).
 */
function buildFiles(overrides: Record<string, string> = {}): Map<string, Buffer> {
  const base: Record<string, string> = {
    "course.mdx": [
      "---",
      'title: "Mini-Kurs"',
      'description: "Test-Bundle für die Pool-Referenz-Validierung."',
      "---",
      "",
      "Intro.",
    ].join("\n"),
    "01-einleitung/01-lesson.mdx": [
      "---",
      'title: "Erste Lesson"',
      'type: "reading"',
      "---",
      "",
      "# Erste Lesson",
    ].join("\n"),
    "questions/frage-a.mdx": [
      "---",
      'tags: ["basics"]',
      "---",
      "",
      '<Question prompt="Frage A?" explanation="Weil A." type="single">',
      "  <Option correct={true}>Ja</Option>",
      "  <Option>Nein</Option>",
      "</Question>",
    ].join("\n"),
    "questions/frage-b.mdx": [
      "---",
      "---",
      "",
      '<Question prompt="Frage B?" explanation="Weil B." type="single">',
      "  <Option correct={true}>Ja</Option>",
      "  <Option>Nein</Option>",
      "</Question>",
    ].join("\n"),
    "01-einleitung/02-abschlusstest.mdx": [
      "---",
      'title: "Abschlusstest"',
      'type: "quiz"',
      "final_exam: true",
      'question_pool: ["frage-a", "frage-b"]',
      "questions_per_attempt: 1",
      "passing_score: 0.7",
      "---",
      "",
      "# Abschlusstest",
    ].join("\n"),
  };

  const merged = { ...base, ...overrides };
  const files = new Map<string, Buffer>();
  for (const [key, content] of Object.entries(merged)) {
    files.set(key, Buffer.from(content, "utf8"));
  }
  return files;
}

describe("validateBundleFiles — Pool-Abschlusstest-Referenzen (ADR 0009, D3)", () => {
  it("akzeptiert einen validen Pool-Abschlusstest (Positiv-Fall)", async () => {
    const findings = await validateBundleFiles("mini-kurs", buildFiles());
    expect(findings).toEqual([]);
  });

  it("meldet einen unbekannten Frage-Slug in question_pool", async () => {
    const files = buildFiles({
      "01-einleitung/02-abschlusstest.mdx": [
        "---",
        'title: "Abschlusstest"',
        'type: "quiz"',
        "final_exam: true",
        'question_pool: ["frage-a", "frage-nicht-vorhanden"]',
        "questions_per_attempt: 1",
        "passing_score: 0.7",
        "---",
        "",
        "# Abschlusstest",
      ].join("\n"),
    });

    const findings = await validateBundleFiles("mini-kurs", files);
    const messages = findings.map((f) => f.message).join(" | ");
    expect(messages).toMatch(
      /question_pool referenziert unbekannten Frage-Slug 'frage-nicht-vorhanden'/,
    );
  });

  it("meldet questions_per_attempt ausserhalb von [1, Pool-Groesse]", async () => {
    const files = buildFiles({
      "01-einleitung/02-abschlusstest.mdx": [
        "---",
        'title: "Abschlusstest"',
        'type: "quiz"',
        "final_exam: true",
        'question_pool: ["frage-a", "frage-b"]',
        "questions_per_attempt: 5",
        "passing_score: 0.7",
        "---",
        "",
        "# Abschlusstest",
      ].join("\n"),
    });

    const findings = await validateBundleFiles("mini-kurs", files);
    const messages = findings.map((f) => f.message).join(" | ");
    expect(messages).toMatch(/questions_per_attempt \(5\) muss zwischen 1/);
  });

  it("meldet question_pool ohne final_exam: true (Konsistenz)", async () => {
    const files = buildFiles({
      "01-einleitung/02-abschlusstest.mdx": [
        "---",
        'title: "Abschlusstest"',
        'type: "quiz"',
        'question_pool: ["frage-a", "frage-b"]',
        "questions_per_attempt: 1",
        "passing_score: 0.7",
        "---",
        "",
        "# Abschlusstest",
      ].join("\n"),
    });

    const findings = await validateBundleFiles("mini-kurs", files);
    const messages = findings.map((f) => f.message).join(" | ");
    expect(messages).toMatch(/final_exam/);
  });
});
