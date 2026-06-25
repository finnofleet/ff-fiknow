"use client";

/**
 * Lern-Companion im rechten Rail (ADR 0002, UI-Surface §6).
 *
 * Sitzt auf der geteilten Annotations-Schicht und ist deren erster Konsument:
 *   - Selektion im Lesson-Text → schwebendes Kontextmenü (Markieren · Notiz ·
 *     „Erklär das"). „Erklär das" erscheint nur, wenn der Kurs tutorEnabled ist.
 *   - Markierungen/Notizen funktionieren OHNE LLM (lokal, gratis, privat).
 *   - „Erklär das" ruft /api/tutor/explain (in-context gegroundet) und zeigt die
 *     sanitisierte Markdown-Antwort; sie lässt sich als Annotation speichern.
 *
 * Inline-Darstellung der Anker via CSS Custom Highlight API (kein DOM-Mutieren,
 * übersteht Re-Render); fehlt die API, bleiben Annotationen in der Rail-Liste.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Globe,
  Highlighter,
  NotebookPen,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import type { AnnotationDTO } from "@/lib/annotations";
import { computeAnchor, locateAnchor, type Anchor } from "./anchoring";
import { SafeMarkdown } from "./safe-markdown";
import styles from "./lesson-companion.module.css";

type Props = {
  courseSlug: string;
  sectionSlug: string;
  lessonSlug: string;
  bundleVersion: string | null;
  tutorEnabled: boolean;
  /** CSS-Selektor des Lesson-Text-Containers. */
  proseSelector?: string;
};

const HIGHLIGHT_COLORS = [
  { key: "yellow", label: "Gelb" },
  { key: "green", label: "Grün" },
  { key: "pink", label: "Pink" },
  { key: "blue", label: "Blau" },
] as const;

const ALL_HL_NAMES = [
  ...HIGHLIGHT_COLORS.map((c) => `anno-${c.key}`),
  "anno-note",
  "anno-tutor",
];

type Toolbar = { x: number; y: number; anchor: Anchor } | null;

/** Quellen-Referenz (Spiegel von SourceRef im Tutor-Endpoint). */
type TutorSource = {
  sectionSlug: string;
  lessonSlug: string;
  sectionTitle: string;
  lessonTitle: string;
};

/** Optionale „Allgemeinwissen ergänzen"-Erweiterung unter der Kurs-Antwort. */
type GeneralExt =
  | { status: "loading" }
  | { status: "done"; text: string }
  | { status: "error"; message: string };

type Panel =
  | { mode: "idle" }
  | { mode: "note"; anchor: Anchor; draft: string }
  | { mode: "tutor-loading"; anchor: Anchor }
  | {
      mode: "tutor-answer";
      anchor: Anchor;
      answer: string;
      saved: boolean;
      grounded: boolean;
      sources: TutorSource[];
      /** Vom Button „Allgemeinwissen ergänzen" nachgeladen (anhängen, nicht ersetzen). */
      general?: GeneralExt;
    }
  | { mode: "tutor-error"; anchor: Anchor; message: string };

export function LessonCompanion({
  courseSlug,
  sectionSlug,
  lessonSlug,
  bundleVersion,
  tutorEnabled,
  proseSelector = "[data-tutor-prose]",
}: Props) {
  const [annotations, setAnnotations] = useState<AnnotationDTO[]>([]);
  const [toolbar, setToolbar] = useState<Toolbar>(null);
  const [panel, setPanel] = useState<Panel>({ mode: "idle" });
  const containerRef = useRef<HTMLElement | null>(null);

  const lessonRef = { courseSlug, sectionSlug, lessonSlug };

  // Container einmalig auflösen + initiale Annotationen laden.
  useEffect(() => {
    containerRef.current = document.querySelector<HTMLElement>(proseSelector);
    let active = true;
    const params = new URLSearchParams({ courseSlug, sectionSlug, lessonSlug });
    fetch(`/api/annotations?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.ok) setAnnotations(data.annotations as AnnotationDTO[]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [courseSlug, sectionSlug, lessonSlug, proseSelector]);

  // Inline-Highlights neu aufbauen, wenn sich Annotationen ändern.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    rebuildHighlights(container, annotations);
    return () => clearHighlights();
  }, [annotations]);

  // Selektion erfassen → Toolbar positionieren.
  useEffect(() => {
    function onMouseUp() {
      const container = containerRef.current;
      if (!container) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setToolbar(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const anchor = computeAnchor(container, range);
      if (!anchor) {
        setToolbar(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setToolbar({
        x: rect.left + rect.width / 2,
        y: rect.top,
        anchor,
      });
    }
    function onScrollOrDown(e: Event) {
      if (e.type === "mousedown") {
        const t = e.target as HTMLElement;
        if (t.closest(`.${styles.toolbar}`)) return;
      }
      setToolbar(null);
    }
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousedown", onScrollOrDown);
    window.addEventListener("scroll", onScrollOrDown, true);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousedown", onScrollOrDown);
      window.removeEventListener("scroll", onScrollOrDown, true);
    };
  }, []);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }, []);

  const persist = useCallback(
    async (payload: Record<string, unknown>): Promise<AnnotationDTO | null> => {
      try {
        const res = await fetch("/api/annotations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...lessonRef, bundleVersion, ...payload }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const created = data.annotation as AnnotationDTO;
        setAnnotations((prev) => [...prev, created]);
        return created;
      } catch {
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseSlug, sectionSlug, lessonSlug, bundleVersion],
  );

  const remove = useCallback(async (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/annotations?id=${id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  // --- Toolbar-Aktionen ---------------------------------------------------

  const onHighlight = useCallback(
    (anchor: Anchor, color: string) => {
      void persist({ type: "highlight", color, ...anchorFields(anchor) });
      clearSelection();
    },
    [persist, clearSelection],
  );

  const onNote = useCallback(
    (anchor: Anchor) => {
      setPanel({ mode: "note", anchor, draft: "" });
      clearSelection();
    },
    [clearSelection],
  );

  const onExplain = useCallback(
    async (anchor: Anchor, question?: string) => {
      setPanel({ mode: "tutor-loading", anchor });
      clearSelection();
      try {
        const res = await fetch("/api/tutor/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...lessonRef,
            selection: anchor.quote,
            ...(question ? { question } : {}),
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          setPanel({
            mode: "tutor-error",
            anchor,
            message: tutorErrorMessage(res.status, data?.error),
          });
          return;
        }
        setPanel({
          mode: "tutor-answer",
          anchor,
          answer: data.answer as string,
          saved: false,
          grounded: data.grounded !== false,
          sources: Array.isArray(data.sources)
            ? (data.sources as TutorSource[])
            : [],
        });
      } catch {
        setPanel({
          mode: "tutor-error",
          anchor,
          message: "Verbindung zum Tutor fehlgeschlagen.",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearSelection, courseSlug, sectionSlug, lessonSlug],
  );

  // „Allgemeinwissen ergänzen": gleiche Selektion mit mode="general" → die
  // ungegroundete Antwort wird UNTER der Kurs-Antwort angehängt (nicht ersetzt).
  const onExtendGeneral = useCallback(
    async (anchor: Anchor) => {
      setPanel((p) =>
        p.mode === "tutor-answer" ? { ...p, general: { status: "loading" } } : p,
      );
      try {
        const res = await fetch("/api/tutor/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...lessonRef,
            selection: anchor.quote,
            mode: "general",
          }),
        });
        const data = await res.json().catch(() => null);
        const general: GeneralExt =
          res.ok && data?.ok
            ? { status: "done", text: data.answer as string }
            : { status: "error", message: tutorErrorMessage(res.status, data?.error) };
        setPanel((p) => (p.mode === "tutor-answer" ? { ...p, general } : p));
      } catch {
        setPanel((p) =>
          p.mode === "tutor-answer"
            ? { ...p, general: { status: "error", message: "Verbindung zum Tutor fehlgeschlagen." } }
            : p,
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseSlug, sectionSlug, lessonSlug],
  );

  // --- Render -------------------------------------------------------------

  return (
    <>
      {toolbar &&
        createPortal(
          <div
            className={styles.toolbar}
            style={{ left: toolbar.x, top: toolbar.y }}
            role="toolbar"
            aria-label="Auswahl-Werkzeuge"
          >
            <div className={styles.swatches}>
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`${styles.swatch} ${styles[`sw_${c.key}`] ?? ""}`}
                  aria-label={`Markieren ${c.label}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onHighlight(toolbar.anchor, c.key)}
                />
              ))}
            </div>
            <button
              type="button"
              className={styles.tbBtn}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onNote(toolbar.anchor)}
            >
              <NotebookPen size={13} strokeWidth={1.75} />
              Notiz
            </button>
            {tutorEnabled && (
              <button
                type="button"
                className={`${styles.tbBtn} ${styles.tbTutor}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onExplain(toolbar.anchor)}
              >
                <Sparkles size={13} strokeWidth={1.75} />
                Erklär das
              </button>
            )}
          </div>,
          document.body,
        )}

      <aside className={styles.rail} aria-label="Lern-Companion">
        <h5 className={styles.heading}>
          {tutorEnabled ? "KI-Tutor & Notizen" : "Notizen & Markierungen"}
        </h5>

        <PanelView
          panel={panel}
          tutorEnabled={tutorEnabled}
          onClose={() => setPanel({ mode: "idle" })}
          onNoteChange={(draft) =>
            setPanel((p) => (p.mode === "note" ? { ...p, draft } : p))
          }
          onNoteSave={async (anchor, draft) => {
            const body = draft.trim();
            if (!body) return;
            await persist({ type: "note", body, ...anchorFields(anchor) });
            setPanel({ mode: "idle" });
          }}
          onSaveExplanation={async (anchor, answer) => {
            await persist({
              type: "tutor_explanation",
              body: answer,
              ...anchorFields(anchor),
            });
            setPanel((p) =>
              p.mode === "tutor-answer" ? { ...p, saved: true } : p,
            );
          }}
          onRetry={onExplain}
          onExtendGeneral={onExtendGeneral}
          onFollowup={onExplain}
        />

        <AnnotationList annotations={annotations} onDelete={remove} />
      </aside>
    </>
  );
}

// --- Subkomponenten --------------------------------------------------------

function PanelView({
  panel,
  onClose,
  onNoteChange,
  onNoteSave,
  onSaveExplanation,
  onRetry,
  onExtendGeneral,
  onFollowup,
}: {
  panel: Panel;
  tutorEnabled: boolean;
  onClose: () => void;
  onNoteChange: (draft: string) => void;
  onNoteSave: (anchor: Anchor, draft: string) => void;
  onSaveExplanation: (anchor: Anchor, answer: string) => void;
  onRetry: (anchor: Anchor) => void;
  onExtendGeneral: (anchor: Anchor) => void;
  onFollowup: (anchor: Anchor, question: string) => void;
}) {
  if (panel.mode === "idle") return null;

  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.panelClose}
        aria-label="Schließen"
        onClick={onClose}
      >
        <X size={14} strokeWidth={1.75} />
      </button>

      <blockquote className={styles.quote}>{panel.anchor.quote}</blockquote>

      {panel.mode === "note" && (
        <>
          <textarea
            className={styles.noteInput}
            placeholder="Deine Notiz …"
            value={panel.draft}
            autoFocus
            onChange={(e) => onNoteChange(e.target.value)}
          />
          <div className={styles.panelActions}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!panel.draft.trim()}
              onClick={() => onNoteSave(panel.anchor, panel.draft)}
            >
              Speichern
            </button>
          </div>
        </>
      )}

      {panel.mode === "tutor-loading" && (
        <p className={styles.loading}>Der Tutor denkt nach …</p>
      )}

      {panel.mode === "tutor-answer" && (
        <>
          {panel.grounded ? (
            <div className={`${styles.scopeBadge} ${styles.scopeGrounded}`}>
              <BookOpen size={12} strokeWidth={2} />
              Aus dem Kursinhalt
            </div>
          ) : (
            <div className={`${styles.scopeBadge} ${styles.scopeGeneral}`}>
              <Globe size={12} strokeWidth={2} />
              Außerhalb des Kurses
            </div>
          )}
          <div className={styles.answer}>
            <SafeMarkdown source={panel.answer} />
          </div>
          {panel.grounded && panel.sources.length > 0 && (
            <p className={styles.sources}>
              Behandelt in:{" "}
              {panel.sources.map((s, i) => (
                <span key={`${s.sectionSlug}/${s.lessonSlug}`}>
                  {i > 0 && ", "}
                  {s.lessonTitle}
                </span>
              ))}
            </p>
          )}
          <div className={styles.panelActions}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={panel.saved}
              onClick={() => onSaveExplanation(panel.anchor, panel.answer)}
            >
              {panel.saved ? "Gespeichert ✓" : "Als Notiz speichern"}
            </button>
          </div>
          <p className={styles.disclaimer}>
            KI-generiert aus dem Kursinhalt — kann Fehler enthalten.
          </p>

          {/* Nachfragen/präzisieren — schickt Selektion + Frage erneut. */}
          <FollowupForm anchor={panel.anchor} onSubmit={onFollowup} />

          {/* „Allgemeinwissen ergänzen" — hängt eine ungegroundete Antwort UNTER
              die Kurs-Antwort, ersetzt sie nicht. Nur bei einer Kurs-Antwort. */}
          {panel.grounded && (
            <div className={styles.extend}>
              {!panel.general && (
                <button
                  type="button"
                  className={styles.extendBtn}
                  onClick={() => onExtendGeneral(panel.anchor)}
                >
                  <Globe size={13} strokeWidth={1.75} />
                  Allgemeinwissen ergänzen
                </button>
              )}

              {panel.general?.status === "loading" && (
                <p className={styles.loading}>Allgemeinwissen wird ergänzt …</p>
              )}

              {panel.general && panel.general.status === "done" && (
                <div className={styles.generalExt}>
                  <div className={`${styles.scopeBadge} ${styles.scopeGeneral}`}>
                    <Globe size={12} strokeWidth={2} />
                    Außerhalb des Kurses
                  </div>
                  <div className={styles.answer}>
                    <SafeMarkdown source={panel.general.text} />
                  </div>
                  <p className={styles.disclaimer}>
                    KI-Allgemeinwissen, nicht aus dem Kurs — kann veraltet oder
                    ungenau sein. Für Prüfungsstoff gilt das Kursmaterial.
                  </p>
                </div>
              )}

              {panel.general && panel.general.status === "error" && (
                <>
                  <p className={styles.error}>{panel.general.message}</p>
                  <div className={styles.panelActions}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onExtendGeneral(panel.anchor)}
                    >
                      Nochmal versuchen
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {panel.mode === "tutor-error" && (
        <>
          <p className={styles.error}>{panel.message}</p>
          <div className={styles.panelActions}>
            <button
              type="button"
              className="btn"
              onClick={() => onRetry(panel.anchor)}
            >
              Nochmal versuchen
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Optionales Nachfrage-Feld unter der Antwort — präzisiert dieselbe Selektion. */
function FollowupForm({
  anchor,
  onSubmit,
}: {
  anchor: Anchor;
  onSubmit: (anchor: Anchor, question: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const q = draft.trim();
  return (
    <div className={styles.followupWrap}>
      <p className={styles.followupLabel}>
        Noch unklar? Frag zu dieser Erklärung nach:
      </p>
      <form
        className={styles.followup}
        onSubmit={(e) => {
          e.preventDefault();
          if (q) onSubmit(anchor, q);
        }}
      >
        <input
          type="text"
          className={styles.followupInput}
          placeholder="z. B. einfacher erklären oder mit Beispiel …"
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          className={styles.followupBtn}
          disabled={!q}
          aria-label="Nachfrage senden"
        >
          <Send size={14} strokeWidth={1.75} />
        </button>
      </form>
    </div>
  );
}

function AnnotationList({
  annotations,
  onDelete,
}: {
  annotations: AnnotationDTO[];
  onDelete: (id: string) => void;
}) {
  if (annotations.length === 0) {
    return (
      <p className={styles.empty}>
        Markiere Text in der Lektion, um ihn hervorzuheben, eine Notiz zu machen
        oder ihn dir erklären zu lassen.
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {annotations.map((a) => (
        <li key={a.id} className={styles.item} data-type={a.type}>
          <button
            type="button"
            className={styles.itemDelete}
            aria-label="Löschen"
            onClick={() => onDelete(a.id)}
          >
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
          <div className={styles.itemIcon}>{iconFor(a.type)}</div>
          <div className={styles.itemBody}>
            {a.anchorQuote && (
              <span className={styles.itemQuote}>“{a.anchorQuote}”</span>
            )}
            {a.type === "note" && a.body && (
              <span className={styles.itemNote}>{a.body}</span>
            )}
            {a.type === "tutor_explanation" && a.body && (
              <div className={styles.itemExplanation}>
                <SafeMarkdown source={a.body} />
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function iconFor(type: string) {
  if (type === "note") return <NotebookPen size={13} strokeWidth={1.75} />;
  if (type === "tutor_explanation") return <Sparkles size={13} strokeWidth={1.75} />;
  return <Highlighter size={13} strokeWidth={1.75} />;
}

// --- Helpers ---------------------------------------------------------------

function anchorFields(anchor: Anchor) {
  return {
    anchorQuote: anchor.quote,
    anchorPrefix: anchor.prefix,
    anchorSuffix: anchor.suffix,
    anchorStart: anchor.start,
    anchorEnd: anchor.end,
  };
}

function tutorErrorMessage(status: number, code?: string): string {
  if (status === 429) return "Zu viele Anfragen — bitte kurz warten.";
  if (status === 503) return "Der Tutor ist gerade nicht verfügbar.";
  if (code === "refused")
    return "Der Tutor kann diese Anfrage nicht beantworten.";
  if (code === "tutor_disabled_for_course")
    return "Für diesen Kurs ist der Tutor nicht aktiviert.";
  // 404 → Retry hilft nicht (z. B. unveröffentlichte Lektion in der Vorschau).
  if (code === "lesson_not_found" || code === "course_not_found")
    return "Diese Lektion ist für den Tutor (noch) nicht verfügbar — ist sie veröffentlicht?";
  return "Etwas ist schiefgelaufen. Bitte erneut versuchen.";
}

// --- CSS Custom Highlight API (typ-locker, mit Feature-Detection) -----------

function highlightNameFor(a: AnnotationDTO): string {
  if (a.type === "note") return "anno-note";
  if (a.type === "tutor_explanation") return "anno-tutor";
  const color = a.color ?? "yellow";
  return ALL_HL_NAMES.includes(`anno-${color}`) ? `anno-${color}` : "anno-yellow";
}

function rebuildHighlights(container: HTMLElement, annotations: AnnotationDTO[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cssHighlights = (globalThis.CSS as any)?.highlights;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const HighlightCtor = (globalThis as any).Highlight;
  if (!cssHighlights || typeof HighlightCtor !== "function") return;

  const groups = new Map<string, Range[]>();
  for (const a of annotations) {
    if (!a.anchorQuote) continue;
    const range = locateAnchor(container, {
      quote: a.anchorQuote,
      prefix: a.anchorPrefix,
      suffix: a.anchorSuffix,
      start: a.anchorStart,
      end: a.anchorEnd,
    });
    if (!range) continue; // verwaiste Annotation — nicht inline rendern
    const name = highlightNameFor(a);
    const list = groups.get(name) ?? [];
    list.push(range);
    groups.set(name, list);
  }

  for (const name of ALL_HL_NAMES) cssHighlights.delete(name);
  for (const [name, ranges] of groups) {
    cssHighlights.set(name, new HighlightCtor(...ranges));
  }
}

function clearHighlights() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cssHighlights = (globalThis.CSS as any)?.highlights;
  if (!cssHighlights) return;
  for (const name of ALL_HL_NAMES) cssHighlights.delete(name);
}
