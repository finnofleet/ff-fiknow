/**
 * Tutor-Endpoint — „Erklär diese Selektion" (ADR 0002 · RAG-Retrieval ADR 0003).
 *
 *   POST /api/tutor/explain
 *     Auth:  GoTrue-Session (Lerner+)
 *     Body:  { courseSlug, sectionSlug, lessonSlug, selection, question?, mode? }
 *
 * Grounding (ADR 0003, Phase 2 + Nachtrag „Allgemeinwissen-Button"):
 *   - DEFAULT (mode ≠ "general"): aus dem Kurs grounden. Die Frage wird embedded
 *     und per App-Cosine gegen den Kurs-Index gesucht; hinreichend relevante
 *     Chunks gehen als Kontext in den Prompt (`grounded: true` + `sources`). Die
 *     Schwelle ist nur ein Rausch-Filter, KEIN Scope-Router. Ohne Treffer / ohne
 *     Retrieval (kein Key / nicht indexiert / Embed-Fehler) → Fallback auf die
 *     aktuelle Lektion (weiterhin `grounded: true`).
 *   - mode = "general": bewusste Lerner-Aktion „Allgemeinwissen ergänzen" →
 *     ungegroundete Antwort aus Allgemeinwissen, sichtbar markiert + vorsichtig
 *     (`grounded: false`). Ersetzt den früheren automatischen Out-of-Scope-Router
 *     (der wegen Self-Match der Selektion kaum je feuerte).
 * Quiz-Guardrail (c): trifft die Selektion eine `<Question>`, verweigert der
 * Tutor die Lösung (Konzept/Sokratik statt richtiger Option) — in BEIDEN Modi.
 *
 *   Response 200: { ok, answer (Markdown), model, bundleVersion, grounded, sources }
 *   Response 401: nicht eingeloggt
 *   Response 403: Kurs hat keinen Tutor (Gating) / keine Lern-Berechtigung
 *   Response 404: Lesson existiert nicht
 *   Response 400: ungültige Eingabe
 *   Response 429: rate-limited (User oder Provider)
 *   Response 503: Tutor für dieses Deployment nicht konfiguriert
 *
 * Sicherheits-Fläche (ADR §Sicherheit): untrusted User-Input → LLM.
 *   1. Prompt-Injection: System-Prompt grenzt Selektion/Frage als DATEN ab
 *      (siehe lib/tutor/prompt.ts) — hier kommt nur die Abgrenzung der Eingabe.
 *   2. Output untrusted: Antwort ist Markdown, wird clientseitig sanitisiert
 *      gerendert (kein rohes HTML/JS).
 *   3. Kosten: Rate-Limit/User + max_tokens-Cap (Config) + Account-Limit (extern).
 *   4. PII: Selektion/Frage/Antwort werden NICHT geloggt.
 *   5. Gating: nur Kurse mit tutorEnabled.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser, viewerCanSeeDrafts } from "@/lib/auth/session";
import { canLearn } from "@/lib/auth/roles";
import { getCourse, getLesson, type Course } from "@/lib/content";
import {
  getCompletionProvider,
  getLlmConfig,
  isTutorConfigured,
  LlmError,
} from "@/lib/llm";
import {
  buildExplainRequest,
  MAX_SELECTION_CHARS,
  type GroundingChunk,
  type TutorGrounding,
} from "@/lib/tutor/prompt";
import { selectionHitsQuiz } from "@/lib/rag/chunking";
import {
  canRetrieve,
  getCourseIndexStatus,
  retrieveForQuery,
  DEFAULT_TOP_K,
  RELEVANCE_THRESHOLD,
  type RetrievedChunk,
} from "@/lib/rag/retrieval";
import { rateLimit } from "@/lib/rate-limit";

// Kosten-Hebel (ADR §5): Frequenz pro User. Bewusst pro Stunde, weil jeder
// Request einen bezahlten LLM-Call auslöst.
const TUTOR_RATE_LIMIT = 20;
const TUTOR_RATE_WINDOW_MS = 60 * 60_000;

export async function POST(request: NextRequest) {
  // 1. Auth — Lerner+
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "unauthorized");
  if (!canLearn(user.role)) return jsonError(403, "forbidden");

  // 2. Feature aktiviert? (Kein Key → Tutor deploymentweit aus.)
  if (!isTutorConfigured()) return jsonError(503, "tutor_unavailable");

  // 3. Rate-Limit pro User
  const rl = rateLimit(
    `tutor:explain:${user.id}`,
    TUTOR_RATE_LIMIT,
    TUTOR_RATE_WINDOW_MS,
  );
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // 4. Body parsen + validieren
  let body: {
    courseSlug?: unknown;
    sectionSlug?: unknown;
    lessonSlug?: unknown;
    selection?: unknown;
    question?: unknown;
    mode?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "invalid_json");
  }

  // "general" = der Lerner hat bewusst „Allgemeinwissen ergänzen" geklickt →
  // ungegroundete Allgemein-Antwort. Default (alles andere) = aus dem Kurs.
  const generalMode = body.mode === "general";

  const courseSlug = asSlug(body.courseSlug);
  const sectionSlug = asSlug(body.sectionSlug);
  const lessonSlug = asSlug(body.lessonSlug);
  if (!courseSlug || !sectionSlug || !lessonSlug) {
    return jsonError(400, "invalid_lesson_ref");
  }

  const selection =
    typeof body.selection === "string" ? body.selection.trim() : "";
  if (!selection) return jsonError(400, "empty_selection");
  if (selection.length > MAX_SELECTION_CHARS) {
    return jsonError(400, "selection_too_long");
  }
  const question =
    typeof body.question === "string" ? body.question.trim() : undefined;

  // 5. Gating: Kurs muss tutorEnabled sein. Draft-Sichtbarkeit MUSS der
  //    Lektionsseite entsprechen (die mit includeDrafts rendert) — sonst
  //    findet ein Autor seine Draft-Lektion auf der Seite, der Tutor aber
  //    nicht (published-only) → fälschliches lesson_not_found. Lerner haben
  //    viewerCanSeeDrafts()=false → unverändert published-only.
  const includeDrafts = await viewerCanSeeDrafts();
  const course = await getCourse(courseSlug, { includeDrafts });
  if (!course) return jsonError(404, "course_not_found");
  if (!course.frontmatter.tutor_enabled) {
    return jsonError(403, "tutor_disabled_for_course");
  }

  // 6. Aktuelle Lektion laden — für Quiz-Erkennung (Guardrail c) und als
  //    Retrieval-Fallback (statische Injektion, wenn kein Retrieval möglich).
  const lesson = await getLesson(courseSlug, sectionSlug, lessonSlug, {
    includeDrafts,
  });
  if (!lesson) return jsonError(404, "lesson_not_found");

  // Guardrail (c): markiert der Lerner eine Quiz-Frage → Lösung verweigern.
  const quizRefusal = selectionHitsQuiz(lesson.body, selection);

  // 7. Grounding bestimmen: Retrieval (Scope-Router) mit Fallback auf die
  //    aktuelle Lektion. `grounded`/`sources` gehen zur Vertrauens-Anzeige an die UI.
  const courseTitle = course.frontmatter.title;
  const lessonFallback: TutorGrounding = {
    mode: "lesson",
    courseTitle,
    sectionTitle: lesson.section.frontmatter.title,
    lessonTitle: lesson.frontmatter.title,
    lessonBody: lesson.body,
  };

  let grounding: TutorGrounding;
  let grounded: boolean;
  let sources: SourceRef[] = [];

  if (generalMode) {
    // Bewusste Lerner-Aktion: Wissen außerhalb des Kurses ergänzen. Kein
    // Retrieval, ungegroundete (sichtbar markierte, vorsichtige) Antwort.
    grounding = { mode: "ungrounded", courseTitle };
    grounded = false;
  } else {
    // Default: aus dem Kurs grounden. KEIN automatischer Scope-Router mehr —
    // der Allgemein-Pfad ist rein user-initiiert (Button „Allgemeinwissen
    // ergänzen"). Retrieval ist best-effort: JEDER Fehler degradiert auf die
    // Lektions-Injektion und darf den Tutor nie 500en.
    grounding = lessonFallback;
    grounded = true;
    try {
      const indexStatus = await getCourseIndexStatus(courseSlug);
      if (canRetrieve(indexStatus)) {
        const query = question ? `${selection}\n\n${question}` : selection;
        const { chunks } = await retrieveForQuery(courseSlug, query, DEFAULT_TOP_K);
        // Schwelle ist jetzt ein Rausch-Filter (nur hinreichend relevante Chunks
        // injizieren), KEIN gegroundet/ungegroundet-Router. Bleibt nichts übrig
        // → Lektions-Fallback (immer noch Kursmaterial → grounded).
        const relevant = chunks.filter((c) => c.score >= RELEVANCE_THRESHOLD);
        if (relevant.length > 0) {
          grounding = {
            mode: "grounded",
            courseTitle,
            chunks: relevant.map(
              (c): GroundingChunk => ({
                sourceLabel: sourceLabel(course, c),
                content: c.content,
              }),
            ),
          };
          sources = dedupeSources(relevant.map((c) => sourceRef(course, c)));
        }
      }
    } catch (err) {
      // Retrieval nicht verfügbar → Lektions-Injektion (gegroundet). Nur loggen.
      console.error("[tutor] Retrieval fehlgeschlagen, Fallback auf Lektion:", (err as Error)?.message);
      grounding = lessonFallback;
    }
  }

  // 8. Request bauen + Provider rufen
  const config = getLlmConfig();
  const req = buildExplainRequest({
    grounding,
    ask: { selection, question },
    quizRefusal,
    maxTokens: config.maxTokens,
  });

  try {
    const provider = getCompletionProvider();
    const result = await provider.complete(req);
    return NextResponse.json({
      ok: true,
      answer: result.text,
      model: provider.model,
      bundleVersion: course.frontmatter.version ?? null,
      grounded,
      sources,
    });
  } catch (err) {
    return handleLlmError(err);
  }
}

/** Quellen-Referenz für die UI-Vertrauensanzeige (welche Lektionen). */
interface SourceRef {
  sectionSlug: string;
  lessonSlug: string;
  sectionTitle: string;
  lessonTitle: string;
}

/** Menschliche Quellenangabe „Lektion › Heading" für den Prompt-Kontext. */
function sourceLabel(course: Course, chunk: RetrievedChunk): string {
  const { lessonTitle } = resolveTitles(course, chunk);
  return chunk.heading ? `${lessonTitle} › ${chunk.heading}` : lessonTitle;
}

function sourceRef(course: Course, chunk: RetrievedChunk): SourceRef {
  const { sectionTitle, lessonTitle } = resolveTitles(course, chunk);
  return {
    sectionSlug: chunk.sectionSlug,
    lessonSlug: chunk.lessonSlug,
    sectionTitle,
    lessonTitle,
  };
}

/** Löst section/lesson-Slugs eines Chunks auf Titel auf (Fallback: Slug). */
function resolveTitles(
  course: Course,
  chunk: RetrievedChunk,
): { sectionTitle: string; lessonTitle: string } {
  const section = course.sections.find((s) => s.slug === chunk.sectionSlug);
  const lessonItem = section?.lessons.find((l) => l.slug === chunk.lessonSlug);
  return {
    sectionTitle: section?.frontmatter.title ?? chunk.sectionSlug,
    lessonTitle: lessonItem?.frontmatter.title ?? chunk.lessonSlug,
  };
}

/** Eindeutige Lektionen, max. 4 — die UI listet nur „behandelt in …". */
function dedupeSources(refs: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const r of refs) {
    const key = `${r.sectionSlug}/${r.lessonSlug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= 4) break;
  }
  return out;
}

function handleLlmError(err: unknown): NextResponse {
  if (err instanceof LlmError) {
    switch (err.code) {
      case "not_configured":
        return jsonError(503, "tutor_unavailable");
      case "refused":
        return jsonError(422, "refused");
      case "upstream_rate_limited":
        return jsonError(429, "upstream_busy");
      case "upstream_overloaded":
      case "timeout":
        return jsonError(503, "upstream_busy");
      case "upstream_auth":
        // Deployment-Fehlkonfig — generischer 502, Details nur im Server-Log.
        console.error("[tutor] LLM-Auth abgelehnt — LLM_API_KEY/LLM_BASE_URL prüfen");
        return jsonError(502, "tutor_misconfigured");
      default:
        return jsonError(502, "upstream_error");
    }
  }
  console.error("[tutor] unerwarteter Fehler:", (err as Error)?.message);
  return jsonError(500, "internal_error");
}

/** Akzeptiert nur einfache slug-Strings (kein Pfad-Injection-Vektor). */
function asSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return /^[a-z0-9][a-z0-9-]{0,127}$/.test(v) ? v : null;
}

function jsonError(status: number, code: string): NextResponse {
  return NextResponse.json({ ok: false, error: code }, { status });
}
