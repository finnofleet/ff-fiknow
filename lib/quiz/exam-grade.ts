/**
 * Reiner, I/O-freier Kern fuer server-seitiges Abschlusstest-Grading
 * (ADR 0005, Phase 7a).
 *
 * Hintergrund: Ein Abschlusstest ist eine Quiz-Lesson; die Fragen stehen als
 * MDX im Lesson-`body` (`<Question prompt="..." type="single"|"multi">` mit
 * Kindern `<Option correct={true}>Label</Option>`). Der CLIENT berechnet
 * heute score/passed selbst und schickt sie an den Server — fuer einen
 * verbindlichen Compliance-Nachweis muss der Server die korrekten Antworten
 * SELBST aus dem MDX ableiten und NUR die vom User gewaehlten Indizes
 * bewerten. Client-gemeldete `correct`/`isCorrect`/`score`-Felder werden
 * hier bewusst ignoriert (Integritaet) — siehe `gradeExam`.
 *
 * Bewusst ohne React/DOM/Payload: nur MDX-Text rein, Grading-Ergebnis raus.
 * Nutzt dieselbe Bewertungssemantik wie der Client (`isAnswerCorrect` aus
 * `lib/quiz/grade.ts`, exakter Set-Match), damit Server und Client bei
 * identischen Eingaben identisch urteilen.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";

import { isAnswerCorrect } from "./grade";

export type ExtractedExamQuestion = {
  prompt: string;
  type: "single" | "multi";
  /** Indizes der korrekten Optionen, in MDX-Reihenfolge. */
  correctIndices: number[];
  /** Anzahl Optionen (fuer Validierung/Grading). */
  optionCount: number;
};

export type ExamGradeResult = {
  total: number; // Anzahl extrahierter Fragen
  correct: number; // korrekt beantwortete
  score: number; // correct/total (0 wenn total 0)
  passed: boolean; // total > 0 && score >= passingScore
  perQuestion: { prompt: string; isCorrect: boolean }[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MdastNode = any;

/**
 * Liest ein String-Attribut (mdxJsxAttribute mit reinem String-Wert, z. B.
 * `prompt="..."`). Ausdruecke ({...}) oder fehlendes Attribut liefern
 * `undefined`.
 */
function getStringAttr(attributes: MdastNode[], name: string): string | undefined {
  const attr = attributes.find(
    (a) => a?.type === "mdxJsxAttribute" && a.name === name,
  );
  if (!attr) return undefined;
  return typeof attr.value === "string" ? attr.value : undefined;
}

/**
 * Liest ein Boolean-Attribut in allen drei MDX-Schreibweisen:
 *   - fehlt ganz                → false
 *   - Shorthand `correct`       → attr.value === null → true
 *   - `correct={true|false}`    → mdxJsxAttributeValueExpression, Wert aus
 *     dem eingebetteten estree-Literal gelesen.
 * Wirft nie — unerwartete Formen fallen auf false zurueck.
 */
function getBooleanAttr(attributes: MdastNode[], name: string): boolean {
  const attr = attributes.find(
    (a) => a?.type === "mdxJsxAttribute" && a.name === name,
  );
  if (!attr) return false;
  if (attr.value === null) return true; // Shorthand: <Option correct>
  const expression = attr.value?.data?.estree?.body?.[0]?.expression;
  if (expression?.type === "Literal") return expression.value === true;
  return false;
}

function isJsxElementNamed(node: MdastNode, name: string): boolean {
  return (
    (node?.type === "mdxJsxFlowElement" || node?.type === "mdxJsxTextElement") &&
    node.name === name
  );
}

/**
 * Sammelt alle <Option>-Kinder einer <Question> in Dokument-Reihenfolge.
 *
 * WICHTIG (Abweichung von der urspruenglichen Annahme): In real erzeugten
 * mdast-Baeumen liegen mehrzeilige <Option>...</Option>-Listen NICHT direkt
 * als mdxJsxFlowElement-Kinder von <Question>, sondern remark buendelt sie
 * (mangels Leerzeilen dazwischen) in einen umschliessenden "paragraph"-Knoten,
 * und die Optionen selbst werden dabei zu mdxJsxTextElement (Inline-Variante)
 * statt mdxJsxFlowElement. Deshalb steigt dieser Walker rekursiv durch
 * Nicht-Option-Knoten (z. B. "paragraph") ab, statt nur eine Ebene direkter
 * Kinder zu pruefen, und akzeptiert Option sowohl als mdxJsxFlowElement als
 * auch als mdxJsxTextElement. In die Kinder EINER gefundenen Option wird
 * nicht weiter abgestiegen (keine verschachtelten Optionen).
 */
function collectOptionNodes(node: MdastNode, out: MdastNode[]): void {
  const children = node?.children;
  if (!Array.isArray(children)) return;
  for (const child of children) {
    if (isJsxElementNamed(child, "Option")) {
      out.push(child);
      continue;
    }
    collectOptionNodes(child, out);
  }
}

/**
 * Extrahiert alle Abschlusstest-Fragen aus einem MDX-Lesson-Body. Robust
 * gegen kaputtes/leeres MDX — wirft nie, liefert im Zweifel `[]`.
 */
export function extractExamQuestions(mdxBody: string): ExtractedExamQuestion[] {
  if (!mdxBody || mdxBody.trim().length === 0) return [];

  let tree: MdastNode;
  try {
    tree = unified().use(remarkParse).use(remarkMdx).parse(mdxBody);
  } catch {
    return [];
  }

  const questions: ExtractedExamQuestion[] = [];

  function walk(node: MdastNode): void {
    if (isJsxElementNamed(node, "Question")) {
      const attributes: MdastNode[] = node.attributes ?? [];
      const prompt = getStringAttr(attributes, "prompt") ?? "";
      const rawType = getStringAttr(attributes, "type");
      const type: "single" | "multi" = rawType === "multi" ? "multi" : "single";

      const optionNodes: MdastNode[] = [];
      collectOptionNodes(node, optionNodes);

      const correctIndices: number[] = [];
      optionNodes.forEach((optionNode, index) => {
        const optionAttrs: MdastNode[] = optionNode.attributes ?? [];
        if (getBooleanAttr(optionAttrs, "correct")) {
          correctIndices.push(index);
        }
      });

      questions.push({
        prompt,
        type,
        correctIndices,
        optionCount: optionNodes.length,
      });
      // Nicht weiter in <Question> hinein absteigen — verschachtelte
      // <Question> sind nicht vorgesehen, und wir haben ihre Optionen
      // bereits vollstaendig eingesammelt.
      return;
    }
    const children = node?.children;
    if (Array.isArray(children)) {
      for (const child of children) walk(child);
    }
  }

  walk(tree);
  return questions;
}

export type ExamSubmission = { prompt: string; selected: number[] };

/**
 * Bewertet einen Abschlusstest server-seitig. NIMMT NUR `selected` aus jeder
 * Submission entgegen — vom Client mitgeschickte `correct`/`isCorrect`/
 * `score`-Felder werden nicht gelesen und haben KEINEN Einfluss auf das
 * Ergebnis (Integritaet: die korrekten Antworten kommen ausschliesslich aus
 * den server-seitig aus dem MDX extrahierten `questions`).
 *
 * Matching Submission -> Frage erfolgt ueber exakten `prompt`-String-Match.
 * Fehlt zu einer Frage eine Submission, gilt sie als nicht beantwortet
 * (isCorrect: false).
 */
export function gradeExam(
  questions: ExtractedExamQuestion[],
  submitted: ExamSubmission[],
  passingScore: number,
): ExamGradeResult {
  const byPrompt = new Map<string, ExamSubmission>();
  for (const s of submitted) {
    byPrompt.set(s.prompt, s);
  }

  const perQuestion = questions.map((question) => {
    const submission = byPrompt.get(question.prompt);
    if (!submission) {
      return { prompt: question.prompt, isCorrect: false };
    }
    const correctFlags = Array.from(
      { length: question.optionCount },
      (_, i) => question.correctIndices.includes(i),
    );
    const isCorrect = isAnswerCorrect(correctFlags, new Set(submission.selected));
    return { prompt: question.prompt, isCorrect };
  });

  const total = questions.length;
  const correct = perQuestion.filter((q) => q.isCorrect).length;
  const score = total > 0 ? correct / total : 0;
  const passed = total > 0 && score >= passingScore;

  return { total, correct, score, passed, perQuestion };
}
