"use client";

import { useState, useRef } from "react";
import { Check, AlertCircle, Upload } from "lucide-react";

import styles from "./page.module.css";

type PublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "done"; children: { sections: number; lessons: number } }
  | { kind: "error"; detail?: string };

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string }
  | { kind: "success"; summary: ImportSummary; publish: PublishState }
  | { kind: "error"; status: number; code: string; detail?: string };

// Spiegelung von lib/authoring/types.ts — bewusst dupliziert, damit Client-
// Bundle nicht das ganze authoring-Modul (mit Payload-Imports!) ziehen muss.
type ImportSummary = {
  courseId: number;
  courseSlug: string;
  course: "created" | "updated";
  sections: Array<{
    slug: string;
    action: "created" | "updated";
    lessons: Array<{ slug: string; action: "created" | "updated" }>;
  }>;
  assets: Array<{ relativePath: string; action: "created" | "updated" }>;
};

export function ImportForm() {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    // Slug ableiten: top-level Folder im ZIP. Wir lassen das aber den
    // Server machen (er hat AdmZip eh schon). Hier schicken wir nur den
    // ZIP-Filename ohne Extension als Hint — der Endpoint validiert/
    // überschreibt das anhand des ZIP-Inhalts.
    const slugHint = file.name.replace(/\.zip$/i, "").toLowerCase();

    if (!/^[a-z0-9-]+$/.test(slugHint)) {
      setState({
        kind: "error",
        status: 0,
        code: "invalid_filename",
        detail: `ZIP-Dateiname muss dem Slug-Format entsprechen (a-z, 0-9, -). Aktuell: "${file.name}"`,
      });
      return;
    }

    setState({ kind: "uploading", filename: file.name });

    const fd = new FormData();
    fd.append("courseSlug", slugHint);
    fd.append("bundle", file);

    try {
      const res = await fetch("/api/authoring/import", {
        method: "POST",
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) {
        setState({
          kind: "error",
          status: res.status,
          code: body.error ?? "unknown_error",
          detail: body.detail,
        });
        return;
      }
      setState({ kind: "success", summary: body.summary, publish: { kind: "idle" } });
    } catch (err) {
      setState({
        kind: "error",
        status: 0,
        code: "network_error",
        detail: (err as Error).message,
      });
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function reset() {
    setState({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function publishNow() {
    if (state.kind !== "success") return;
    setState({ ...state, publish: { kind: "publishing" } });
    try {
      const res = await fetch("/api/authoring/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: state.summary.courseId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({
          ...state,
          publish: { kind: "error", detail: body.error ?? "Publish fehlgeschlagen" },
        });
        return;
      }
      setState({
        ...state,
        publish: { kind: "done", children: body.children ?? { sections: 0, lessons: 0 } },
      });
    } catch (err) {
      setState({
        ...state,
        publish: { kind: "error", detail: (err as Error).message },
      });
    }
  }

  return (
    <div className={styles.formWrap}>
      <div
        className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="ZIP-Datei hier ablegen oder auswählen"
      >
        <Upload size={32} strokeWidth={1.5} className={styles.dropIcon} />
        <div className={styles.dropPrimary}>
          ZIP hier ablegen oder klicken zum Auswählen
        </div>
        <div className={styles.dropSecondary}>
          Format: <code>&lt;slug&gt;.zip</code> mit course.mdx + Sektionen + Lessons
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          onChange={onSelect}
          style={{ display: "none" }}
        />
      </div>

      {state.kind === "uploading" && (
        <div className={styles.statusBox}>
          Lade hoch: <strong>{state.filename}</strong> …
        </div>
      )}

      {state.kind === "success" && (
        <div className={`${styles.statusBox} ${styles.statusSuccess}`}>
          <div className={styles.statusHead}>
            <Check size={18} />
            Erfolgreich importiert
          </div>
          <SummaryView summary={state.summary} />

          <div className={styles.draftNote}>
            <strong>Status: Draft.</strong> Der Kurs ist noch nicht öffentlich
            sichtbar. Du kannst ihn im Payload-Admin reviewen und dann hier
            unten freischalten.
          </div>

          {state.publish.kind === "idle" && (
            <div className={styles.statusActions}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={publishNow}
              >
                Jetzt veröffentlichen
              </button>
              <a
                href={`/admin/collections/courses/${state.summary.courseId}`}
                className="btn btn-ghost"
                target="_blank"
                rel="noopener noreferrer"
              >
                Im Payload-Admin öffnen ↗
              </a>
              <button type="button" className="btn btn-ghost" onClick={reset}>
                Weiteres Bundle hochladen
              </button>
            </div>
          )}

          {state.publish.kind === "publishing" && (
            <div className={styles.statusActions}>
              <button type="button" className="btn btn-primary" disabled>
                Veröffentliche …
              </button>
            </div>
          )}

          {state.publish.kind === "done" && (
            <>
              <div className={styles.publishedNote}>
                <Check size={16} />
                Live: Course + {state.publish.children.sections} Sektionen
                + {state.publish.children.lessons} Lektionen veröffentlicht.
              </div>
              <div className={styles.statusActions}>
                <a
                  href={`/courses/${state.summary.courseSlug}`}
                  className="btn btn-primary"
                >
                  Zum Kurs
                </a>
                <button type="button" className="btn btn-ghost" onClick={reset}>
                  Weiteres Bundle hochladen
                </button>
              </div>
            </>
          )}

          {state.publish.kind === "error" && (
            <>
              <div className={styles.errorDetail}>
                {state.publish.detail ?? "Publish fehlgeschlagen"}
              </div>
              <div className={styles.statusActions}>
                <button type="button" className="btn btn-primary" onClick={publishNow}>
                  Nochmal versuchen
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {state.kind === "error" && (
        <div className={`${styles.statusBox} ${styles.statusError}`}>
          <div className={styles.statusHead}>
            <AlertCircle size={18} />
            Upload fehlgeschlagen
          </div>
          <div>
            <code>{state.code}</code>
            {state.status > 0 && ` (HTTP ${state.status})`}
          </div>
          {state.detail && <div className={styles.errorDetail}>{state.detail}</div>}
          <div className={styles.statusActions}>
            <button type="button" className="btn btn-primary" onClick={reset}>
              Neu versuchen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryView({ summary }: { summary: ImportSummary }) {
  const sectionsCreated = summary.sections.filter((s) => s.action === "created").length;
  const sectionsUpdated = summary.sections.length - sectionsCreated;
  const lessonsTotal = summary.sections.reduce((n, s) => n + s.lessons.length, 0);
  const lessonsCreated = summary.sections.reduce(
    (n, s) => n + s.lessons.filter((l) => l.action === "created").length,
    0,
  );
  const lessonsUpdated = lessonsTotal - lessonsCreated;
  const assetsTotal = summary.assets.length;

  return (
    <dl className={styles.summary}>
      <div>
        <dt>Kurs</dt>
        <dd>
          <code>{summary.courseSlug}</code>{" "}
          <span className={styles.tag}>{summary.course}</span>
        </dd>
      </div>
      <div>
        <dt>Sektionen</dt>
        <dd>
          {summary.sections.length} ({sectionsCreated} neu, {sectionsUpdated} aktualisiert)
        </dd>
      </div>
      <div>
        <dt>Lektionen</dt>
        <dd>
          {lessonsTotal} ({lessonsCreated} neu, {lessonsUpdated} aktualisiert)
        </dd>
      </div>
      {assetsTotal > 0 && (
        <div>
          <dt>Assets</dt>
          <dd>{assetsTotal} hochgeladen / aktualisiert</dd>
        </div>
      )}
    </dl>
  );
}
