/**
 * Lesson-MDX → Retrieval-Chunks (ADR 0003, Entscheidung 5).
 *
 * Chunking pro Lektions-Abschnitt (Heading), mit Zeichen-Cap + kleinem Overlap.
 * Figure-Alt/Caption bleiben als Text drin (didaktisch relevant).
 *
 * PFLICHT-GUARDRAIL (a) — Quiz-Integrität: Der Tutor darf in KEINE Richtung zum
 * Quiz-Löser werden. Deshalb werden `<Question>`-Lösungen VOR dem Chunking aus
 * dem Text entfernt:
 *   - alle `<Option>`-Children (korrekte UND falsche) → kein Antwortschlüssel,
 *     auch nicht ableitbar daraus, welche Option markiert war;
 *   - das `explanation`-Attribut (die Auflösung).
 * Der `prompt`-Text der Frage bleibt als reines Topic-Signal erhalten — er ist
 * Lerninhalt, keine Lösung. Defense-in-Depth: lieber den ganzen Options-Block
 * droppen als nur den `correct`-Marker, dann kann nichts durchsickern.
 *
 * Bewusst regex-basiert statt voller MDX-AST-Parse: das Bundle-Format ist eng
 * (validiert via assertSafeMdx, Komponenten wohlgeformt, keine verschachtelten
 * Quotes in Attributen — siehe docs/CONTENT_STYLE.md), und der Guardrail soll
 * simpel und offensichtlich korrekt sein.
 */

export interface LessonChunk {
  chunkIndex: number;
  /** Heading des Abschnitts (ohne `#`-Präfix), null für Pre-Heading-Inhalt. */
  heading: string | null;
  content: string;
}

// ~450 Tokens bei der groben 4-Zeichen/Token-Heuristik. Klein genug für
// präzises Retrieval, groß genug, dass ein Abschnitt selten zerfällt.
const MAX_CHARS = 1800;
// Overlap zwischen Sub-Chunks eines übergroßen Abschnitts (Kontext-Brücke).
const OVERLAP_CHARS = 200;
// Chunks unter dieser Länge sind Rauschen (leere Heading-Zeile o. Ä.).
const MIN_CHARS = 24;

/**
 * Entfernt Quiz-Lösungen aus einem MDX-Body (Guardrail a). Ersetzt jeden
 * `<Question …>…</Question>`-Block durch eine reine „Quizfrage: <prompt>"-Zeile.
 */
export function stripQuizSolutions(mdx: string): string {
  // Block- und self-closing-Form. `[\s\S]*?` = non-greedy über Zeilen.
  const questionBlock = /<Question\b[\s\S]*?(?:\/>|<\/Question>)/g;
  return mdx.replace(questionBlock, (block) => {
    const prompt = extractAttr(block, "prompt");
    return prompt ? `Quizfrage: ${prompt}` : "";
  });
}

/**
 * Guardrail (c) — Quiz-Erkennung: trifft die Lerner-Selektion eine `<Question>`?
 *
 * Wenn der Lerner Text markiert, der INNERHALB eines `<Question>`-Blocks der
 * Lektion liegt (Frage-Prompt oder eine Antwort-Option), darf der Tutor nicht
 * zum Quiz-Löser werden → der Endpoint schaltet auf Refusal-Modus (Konzept
 * erklären, nicht die richtige Option nennen).
 *
 * Heuristik: normalisierte Selektion gegen den normalisierten Inhalt jedes
 * `<Question>`-Blocks der ROHEN (noch nicht gestrippten) Lektion prüfen. Bewusst
 * konservativ — lieber einmal zu oft in den Refusal-Modus als ein durchgereichter
 * Antwortschlüssel. Sehr kurze Selektionen (< MIN_QUIZ_MATCH_CHARS) werden
 * ignoriert, sonst triggert ein Allerweltswort im Frage-Text false positives.
 */
const MIN_QUIZ_MATCH_CHARS = 12;

export function selectionHitsQuiz(lessonBody: string, selection: string): boolean {
  const needle = normalizeForMatch(selection);
  if (needle.length < MIN_QUIZ_MATCH_CHARS) return false;

  const questionBlock = /<Question\b[\s\S]*?(?:\/>|<\/Question>)/g;
  const blocks = lessonBody.match(questionBlock);
  if (!blocks) return false;

  return blocks.some((block) => normalizeForMatch(block).includes(needle));
}

/** Whitespace kollabieren + lowercasen — robust gegen Re-Wrapping der Selektion. */
function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Liest `name="…"` oder `name='…'` aus einem Tag-String (erstes Vorkommen). */
function extractAttr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`);
  const m = re.exec(tag);
  if (!m) return null;
  return (m[2] ?? m[3] ?? "").trim() || null;
}

/**
 * Zerlegt einen Lesson-Body in Retrieval-Chunks. Erst Quiz-Lösungen strippen
 * (Guardrail a), dann pro Heading-Abschnitt teilen, übergroße Abschnitte mit
 * Overlap nachsplitten.
 */
export function chunkLessonBody(body: string): LessonChunk[] {
  const sanitized = stripQuizSolutions(body);
  const sections = splitByHeading(sanitized);

  const chunks: LessonChunk[] = [];
  for (const section of sections) {
    for (const piece of splitOversized(section.text)) {
      const content = piece.trim();
      if (content.length < MIN_CHARS) continue;
      chunks.push({
        chunkIndex: chunks.length,
        heading: section.heading,
        content,
      });
    }
  }
  return chunks;
}

interface Section {
  heading: string | null;
  text: string; // inkl. Heading-Zeile als Kontext im Chunk
}

/**
 * Splittet an Markdown-Headings (H1–H3). Die Heading-Zeile bleibt im
 * jeweiligen Abschnitts-Text (gibt dem Chunk Kontext), der reine
 * Heading-Titel wird zusätzlich strukturiert mitgeführt.
 */
function splitByHeading(body: string): Section[] {
  const lines = body.split("\n");
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      if (current) sections.push(current);
      current = { heading: m[2].trim() || null, text: line };
    } else {
      if (!current) current = { heading: null, text: "" };
      current.text += (current.text ? "\n" : "") + line;
    }
  }
  if (current) sections.push(current);
  return sections;
}

/**
 * Teilt einen zu langen Abschnitt entlang Absatzgrenzen (Leerzeilen) in
 * Stücke ≤ MAX_CHARS, mit OVERLAP_CHARS Überlappung zwischen aufeinander-
 * folgenden Stücken. Passt der Abschnitt, kommt er als ein Stück zurück.
 */
function splitOversized(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];

  const paragraphs = text.split(/\n{2,}/);
  const pieces: string[] = [];
  let buf = "";

  for (const para of paragraphs) {
    const candidate = buf ? `${buf}\n\n${para}` : para;
    if (candidate.length > MAX_CHARS && buf) {
      pieces.push(buf);
      // Overlap: das Ende des bisherigen Stücks dem nächsten voranstellen.
      const tail = buf.slice(-OVERLAP_CHARS);
      buf = `${tail}\n\n${para}`;
    } else {
      buf = candidate;
    }
  }
  if (buf.trim()) pieces.push(buf);

  // Ein einzelner Absatz kann selbst > MAX_CHARS sein → hart nachschneiden.
  return pieces.flatMap((p) =>
    p.length <= MAX_CHARS ? [p] : hardWrap(p, MAX_CHARS, OVERLAP_CHARS),
  );
}

function hardWrap(text: string, max: number, overlap: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + max));
    i += max - overlap;
  }
  return out;
}
