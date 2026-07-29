import { describe, it, expect } from "vitest";

import { parseQuestionBlock } from "./question-parse";

describe("parseQuestionBlock", () => {
  it("parst eine Single-Frage mit Prompt/Explanation/Optionen", () => {
    const mdx = `
<Question prompt="Was ist 1+1?" type="single" explanation="Grundrechenart">
  <Option correct={true}>2</Option>
  <Option>3</Option>
  <Option>4</Option>
</Question>
`;
    const result = parseQuestionBlock(mdx);
    expect(result).toEqual({
      prompt: "Was ist 1+1?",
      type: "single",
      explanation: "Grundrechenart",
      options: [
        { label: "2", correct: true },
        { label: "3", correct: false },
        { label: "4", correct: false },
      ],
    });
  });

  it("parst eine Multi-Frage mit mehreren korrekten Optionen", () => {
    const mdx = `
<Question prompt="Welche sind Primzahlen?" type="multi">
  <Option correct={true}>2</Option>
  <Option>4</Option>
  <Option correct={true}>3</Option>
  <Option>6</Option>
</Question>
`;
    const result = parseQuestionBlock(mdx);
    expect(result?.type).toBe("multi");
    expect(result?.options.map((o) => o.correct)).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it("erkennt alle drei correct-Schreibweisen (Shorthand, ={true}, ={false})", () => {
    const mdx = `
<Question prompt="Formate" type="multi">
  <Option correct>Shorthand richtig</Option>
  <Option correct={true}>Explizit richtig</Option>
  <Option correct={false}>Explizit falsch</Option>
  <Option>Implizit falsch</Option>
</Question>
`;
    const result = parseQuestionBlock(mdx);
    expect(result?.options.map((o) => o.correct)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("behaelt die Options-Reihenfolge aus dem Dokument", () => {
    const mdx = `
<Question prompt="Reihenfolge" type="single">
  <Option>Erste</Option>
  <Option correct>Zweite</Option>
  <Option>Dritte</Option>
</Question>
`;
    const result = parseQuestionBlock(mdx);
    expect(result?.options.map((o) => o.label)).toEqual([
      "Erste",
      "Zweite",
      "Dritte",
    ]);
    expect(result?.options.map((o) => o.correct)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("erhaelt Plaintext-Labels unveraendert", () => {
    const mdx = `
<Question prompt="Plaintext" type="single">
  <Option correct>Ein einfaches Label</Option>
  <Option>Ein anderes</Option>
</Question>
`;
    const result = parseQuestionBlock(mdx);
    expect(result?.options[0].label).toBe("Ein einfaches Label");
  });

  it("serialisiert rich-Option-Inhalt (fett) als Markdown zurueck", () => {
    const mdx = `
<Question prompt="Rich-Option" type="single">
  <Option correct>**fett** und normal</Option>
  <Option>Mit [Link](https://example.com)</Option>
</Question>
`;
    const result = parseQuestionBlock(mdx);
    // Label-Serialisierung nutzt mdast-util-to-markdown + mdxToMarkdown()
    // (siehe Kommentar in question-parse.ts) -- rich-Markdown bleibt erhalten
    // statt auf reinen Text reduziert zu werden.
    expect(result?.options[0].label).toBe("**fett** und normal");
    expect(result?.options[1].label).toBe("Mit [Link](https://example.com)");
  });

  it("liefert null, wenn kein <Question> im Body vorkommt", () => {
    const mdx = `
# Nur eine Ueberschrift

Ein Absatz ohne Frage.
`;
    expect(parseQuestionBlock(mdx)).toBeNull();
  });

  it("liefert null fuer leeren Body", () => {
    expect(parseQuestionBlock("")).toBeNull();
    expect(parseQuestionBlock("   \n  ")).toBeNull();
  });

  it("default-typed 'single', wenn type-Attribut fehlt", () => {
    const mdx = `
<Question prompt="Ohne Typ">
  <Option correct>A</Option>
  <Option>B</Option>
</Question>
`;
    const result = parseQuestionBlock(mdx);
    expect(result?.type).toBe("single");
  });

  it("explanation ist null, wenn das Attribut fehlt", () => {
    const mdx = `
<Question prompt="Ohne Erklaerung" type="single">
  <Option correct>A</Option>
  <Option>B</Option>
</Question>
`;
    const result = parseQuestionBlock(mdx);
    expect(result?.explanation).toBeNull();
  });
});
