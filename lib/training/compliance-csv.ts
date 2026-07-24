/**
 * Reiner CSV-Bauer für den Pflichtkurse-Audit-Export (ADR 0005 §6, Phase 6d
 * — „entparkte" Phase 5) — KEIN I/O.
 *
 * Nimmt die bereits geladene/gefilterte Compliance-Übersicht entgegen und
 * baut eine RFC-4180-konforme CSV-Zeichenkette: eine Zeile pro
 * Teilnehmer × Kurs (Audit-Detailtiefe, kein Aggregat). Bewusst ein
 * Leaf-Modul (`import type` only), analog compliance-compute.ts — isoliert
 * per Vitest verifizierbar, die Route (app/.../export/route.ts) hängt nur
 * das Access-Gate + den HTTP-Response davor.
 *
 * Excel-Kompatibilität: UTF-8-BOM vorangestellt (sonst zeigt Excel Umlaute
 * falsch), CRLF-Zeilenenden (RFC 4180).
 */
import type { CourseCompliance } from "./compliance-compute";

const CSV_HEADER = [
  "Teilnehmer",
  "Kurs",
  "Treiber",
  "Umfang_Minuten",
  "Status",
  "Startdatum",
  "Abschlussdatum",
  "Kursversion",
  "Zyklus",
  "Pruefung",
] as const;

/**
 * RFC 4180 §2.5–2.7: Felder mit Komma, Anführungszeichen oder Zeilenumbruch
 * werden in `"` gequotet; ein enthaltenes `"` wird zu `""` verdoppelt.
 */
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toRow(fields: readonly string[]): string {
  return fields.map(escapeCsvField).join(",");
}

/** `YYYY-MM-DD` — eindeutig, lokalisierungsfrei, Excel-/Audit-tauglich. */
function formatDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Baut die vollständige CSV (inkl. UTF-8-BOM + Kopfzeile) aus der
 * Compliance-Übersicht. `courses` sollte bereits mit demselben `?driver=`-
 * Filter wie das Dashboard aufbereitet sein (siehe `filterCoursesByDriver`).
 */
export function buildComplianceCsv(courses: readonly CourseCompliance[]): string {
  const lines: string[] = [toRow(CSV_HEADER)];

  for (const course of courses) {
    const driversField = course.drivers.join(";");

    for (const participant of course.participants) {
      // Umfang: bevorzugt der beim Abschluss eingefrorene Nachweis-Wert
      // (Art.-4-Snapshot), sonst der aktuelle Kurs-Live-Wert als Planangabe
      // für noch nicht abgeschlossene Teilnehmer.
      const estimatedMinutes =
        participant.evidence?.estimatedMinutes ?? course.estimatedMinutes ?? null;
      // "Pruefung": nur gesetzt, wenn das Lernkontroll-Gate griff UND bestanden
      // wurde (decideCourseCompletion befüllt `assessment` nur in diesem Fall).
      const pruefung = participant.evidence?.assessment ? "bestanden" : "–";

      lines.push(
        toRow([
          participant.displayName,
          course.title,
          driversField,
          estimatedMinutes != null ? String(estimatedMinutes) : "",
          participant.status,
          formatDate(participant.startedAt),
          formatDate(participant.completedAt),
          participant.courseVersionSnapshot ?? "",
          String(participant.cycle),
          pruefung,
        ]),
      );
    }
  }

  const BOM = "\uFEFF";
  return BOM + lines.join("\r\n") + "\r\n";
}
