/**
 * Reiner, I/O-freier Extraktor fuer Frage-Block-Bodies (ADR 0009, Phase D1) —
 * Analogon zu `lib/quiz/exam-grade.ts` (dessen mdast-Walk-Muster hier
 * wiederverwendet wird), aber mit einem wichtigen Unterschied: hier zaehlen
 * nicht nur die `correct`-Flags, sondern auch die Option-LABELS (ihr Inhalt),
 * weil ein Frage-Block (`questions/<slug>.mdx`) genau EINE Frage vollstaendig
 * strukturiert im Index (`questions`-Tabelle) landen muss — nicht nur zum
 * Bewerten, sondern auch zum spaeteren Rendern per Referenz (D2, hier noch
 * NICHT konsumiert).
 *
 * Bewusst ohne React/DOM/Payload: nur MDX-Text rein, strukturierte Frage raus.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { toMarkdown } from "mdast-util-to-markdown";
import { mdxToMarkdown } from "mdast-util-mdx";

export type ParsedQuestionBlock = {
  prompt: string;
  type: "single" | "multi";
  explanation: string | null;
  /** label = Options-Inhalt, als Markdown-String serialisiert (siehe serializeLabel). */
  options: { label: string; correct: boolean }[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MdastNode = any;

/**
 * Liest ein String-Attribut (mdxJsxAttribute mit reinem String-Wert, z. B.
 * `prompt="..."`). Ausdruecke ({...}) oder fehlendes Attribut liefern
 * `undefined`. (Identisch zu exam-grade.ts.)
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
 * Wirft nie — unerwartete Formen fallen auf false zurueck. (Identisch zu
 * exam-grade.ts.)
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
 * Findet das ERSTE <Question>-Element im Baum (Flow- oder Text-Variante,
 * Dokument-Reihenfolge, Tiefensuche). Ein Frage-Block-File enthaelt per
 * Format-Vertrag genau eine Frage — spaetere <Question>-Vorkommen (sollte es
 * sie geben) werden ignoriert.
 */
function findQuestionNode(node: MdastNode): MdastNode | null {
  if (isJsxElementNamed(node, "Question")) return node;
  const children = node?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findQuestionNode(child);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Sammelt alle <Option>-Kinder einer <Question> in Dokument-Reihenfolge.
 * Siehe exam-grade.ts fuer die ausfuehrliche Begruendung: remark buendelt
 * mehrzeilige <Option>-Listen (mangels Leerzeilen) in einen umschliessenden
 * "paragraph"-Knoten und die Optionen selbst werden dabei zu
 * mdxJsxTextElement statt mdxJsxFlowElement — deshalb steigt dieser Walker
 * rekursiv durch Nicht-Option-Knoten ab. In die Kinder EINER gefundenen
 * Option wird nicht weiter abgestiegen (keine verschachtelten Optionen).
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
 * Serialisiert die Kinder einer <Option> (ihr Label-Inhalt) zurueck zu einem
 * Markdown-String.
 *
 * Wahl: `mdast-util-to-markdown` + die `mdxToMarkdown()`-Erweiterung aus
 * `mdast-util-mdx` (bereits transitiv vorhanden ueber remark-mdx, wie
 * `unified`/`remark-parse`/`remark-mdx` selbst in exam-grade.ts). Das
 * roundtrippt rich-Markdown (`**fett**`, Links, Listen, ...) UND — falls je
 * vorhanden — verschachteltes JSX innerhalb eines Labels verlustfrei, statt
 * nur den reinen Text zu behalten. Ein simpler Plaintext-Extract (nur
 * `.value`-Konkatenation) haette rich-Formatierung stillschweigend verworfen;
 * das waere fuer spaeteres Referenz-Rendering (D2) ein Datenverlust im Index
 * gewesen, den man nicht mehr rueckgaengig machen kann. Ergebnis wird
 * getrimmt (toMarkdown haengt einen Trailing-Newline an).
 */
function serializeLabel(children: MdastNode[]): string {
  // `as MdastNode` (= any): der echte `Root`-Typ aus `mdast` erwartet ein
  // enges Kind-Element-Union (u.a. kein rohes JSX), das unser dynamisch
  // gesammeltes `children`-Array (Text/Strong/Link/mdxJsxTextElement/...)
  // nicht ohne Weiteres erfuellt. `toMarkdown` selbst pruft zur Laufzeit nur
  // `node.type`, daher ist der lockere Typ hier sicher.
  const root: MdastNode = { type: "root", children };
  return toMarkdown(root, { extensions: [mdxToMarkdown()] }).trim();
}

/**
 * Parst genau EINEN Frage-Block-Body (`questions/<slug>.mdx`, MDX nach
 * Frontmatter). Erwartet genau ein `<Question prompt type explanation>` mit
 * `<Option correct={...}>Label</Option>`-Kindern — dasselbe gehaertete
 * Vokabular wie inline (`components/mdx/question.tsx`).
 *
 * Robust gegen kaputtes/leeres MDX oder ein fehlendes <Question> — wirft nie,
 * liefert im Zweifel `null` (der Aufrufer/Validator entscheidet, ob das ein
 * Fehler ist).
 */
export function parseQuestionBlock(mdxBody: string): ParsedQuestionBlock | null {
  if (!mdxBody || mdxBody.trim().length === 0) return null;

  let tree: MdastNode;
  try {
    tree = unified().use(remarkParse).use(remarkMdx).parse(mdxBody);
  } catch {
    return null;
  }

  const questionNode = findQuestionNode(tree);
  if (!questionNode) return null;

  const attributes: MdastNode[] = questionNode.attributes ?? [];
  const prompt = getStringAttr(attributes, "prompt") ?? "";
  const rawType = getStringAttr(attributes, "type");
  const type: "single" | "multi" = rawType === "multi" ? "multi" : "single";
  const explanation = getStringAttr(attributes, "explanation") ?? null;

  const optionNodes: MdastNode[] = [];
  collectOptionNodes(questionNode, optionNodes);

  const options = optionNodes.map((optionNode) => {
    const optionAttrs: MdastNode[] = optionNode.attributes ?? [];
    const correct = getBooleanAttr(optionAttrs, "correct");
    const label = serializeLabel(optionNode.children ?? []);
    return { label, correct };
  });

  return { prompt, type, explanation, options };
}
