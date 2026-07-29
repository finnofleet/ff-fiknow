/**
 * Rekonstruktions-Util (ADR 0009, D2-ii-a): baut aus strukturierten
 * Pool-Fragen (`PoolQuestion` — Ergebnis von `getPoolQuestions`, siehe
 * `lib/quiz/pool-loader.ts`) wieder einen MDX-Body im SELBEN
 * `<Question>`/`<Option>`-Vokabular wie inline-Abschlusstests (Phase 7a), den
 * `MDXRemote` mit der gehaerteten Pipeline (`hardenedRscOptions`) rendern kann.
 *
 * WICHTIG — Haertungs-Konformitaet (ADR 0001, `lib/mdx/remark-reject-unsafe.ts`):
 * die Render-Haertung erlaubt an JSX-Attributen NUR statische Literal-
 * Ausdruecke (`assertStaticExpression` prueft: Literal/Unary/Array/Object aus
 * Literalen — KEIN Funktionsaufruf, kein Identifier). Deshalb wird
 * `JSON.stringify` HIER im TS-Renderer-Code aufgerufen (nicht im erzeugten
 * MDX-Text!) und liefert bereits fertig JS-escapten String-Literal-Text
 * (Anfuehrungszeichen etc. sind darin per Backslash escaped). Dieser Text
 * wird direkt zwischen die geschweiften Klammern gesetzt, z. B.
 * `prompt={"Was ist \"X\"?"}` — im mdast/estree ist das ein einfaches
 * `Literal`-Attribut-Value-Expression, das die Haertung zulaesst. Ein Aufruf
 * wie `prompt={JSON.stringify(x)}` INNERHALB des MDX waere dagegen eine
 * CallExpression und wuerde von der Haertung abgelehnt.
 *
 * Option-Label ist bereits Markdown (aus dem `questions`-Index, siehe
 * `lib/quiz/question-parse.ts` `serializeLabel`) und wird 1:1 als Kind von
 * `<Option>` eingesetzt (rich Markdown wie `**fett**`/Links bleibt erhalten,
 * analog `question-parse.test.ts`: einzeiliges JSX mit Markdown-Kindern wird
 * von remark-mdx inline geparst).
 *
 * Fragen werden durch eine Leerzeile getrennt, damit remark sie als separate
 * Bloecke sieht (gleiches Muster wie bei inline-Abschlusstests, siehe
 * `lib/quiz/exam-grade.test.ts`).
 */
import type { PoolQuestion } from "./pool";

/**
 * Baut ein einzelnes statisches Literal-Attribut: `name={"escaped value"}`.
 * `JSON.stringify` liefert den fertigen, in JS-String-Literal-Syntax
 * escapten Text (inkl. der umschliessenden Anfuehrungszeichen) — kein
 * Ausdruck im MDX, nur dessen fertiger Text.
 */
function literalAttr(name: string, value: string): string {
  return `${name}={${JSON.stringify(value)}}`;
}

function renderOption(option: { label: string; correct: boolean }): string {
  return `<Option correct={${option.correct ? "true" : "false"}}>${option.label}</Option>`;
}

function renderQuestion(question: PoolQuestion): string {
  const attrs = [
    literalAttr("prompt", question.prompt),
    literalAttr("type", question.type),
  ];
  if (question.explanation != null) {
    attrs.push(literalAttr("explanation", question.explanation));
  }
  const options = question.options.map(renderOption).join("\n");
  return `<Question ${attrs.join(" ")}>\n${options}\n</Question>`;
}

/**
 * Rendert eine Liste gezogener Pool-Fragen zu einem MDX-Body-String, den
 * `MDXRemote` (mit `hardenedRscOptions`) direkt rendern kann — die Render-
 * Haertung (`remarkRejectUnsafe`) MUSS diesen Output akzeptieren (siehe
 * `pool-render.test.ts`, das dies gegen `assertSafeMdx` prueft).
 */
export function renderPoolQuestionsToMdx(questions: PoolQuestion[]): string {
  return questions.map(renderQuestion).join("\n\n");
}
