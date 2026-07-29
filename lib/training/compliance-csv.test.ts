import { describe, expect, it } from "vitest";

import { buildComplianceCsv } from "./compliance-csv";
import type { CourseCompliance, Participant } from "./compliance-compute";

function participantFixture(over: Partial<Participant> = {}): Participant {
  return {
    userId: "u-1",
    displayName: "Test User",
    status: "nicht_gestartet",
    startedAt: null,
    completedAt: null,
    courseVersionSnapshot: null,
    cycle: 1,
    evidence: null,
    ...over,
  };
}

function courseFixture(over: Partial<CourseCompliance> = {}): CourseCompliance {
  return {
    courseSlug: "c1",
    title: "Kurs",
    drivers: [],
    estimatedMinutes: null,
    assigned: 0,
    started: 0,
    completed: 0,
    notStarted: 0,
    pct: 0,
    participants: [],
    ...over,
  };
}

describe("buildComplianceCsv", () => {
  it("beginnt mit UTF-8-BOM + Kopfzeile", () => {
    const csv = buildComplianceCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header] = csv.slice(1).split("\r\n");
    expect(header).toBe(
      "Teilnehmer,Kurs,Treiber,Umfang_Minuten,Status,Startdatum,Abschlussdatum,Kursversion,Zyklus,Pruefung",
    );
  });

  it("eine Zeile pro Teilnehmer x Kurs (Audit-Detailtiefe, kein Aggregat)", () => {
    const courses: CourseCompliance[] = [
      courseFixture({
        courseSlug: "c1",
        title: "Kurs A",
        drivers: ["eu_ai_act"],
        estimatedMinutes: 60,
        participants: [
          participantFixture({ userId: "u-1", displayName: "Anna" }),
          participantFixture({ userId: "u-2", displayName: "Ben" }),
        ],
      }),
    ];
    const csv = buildComplianceCsv(courses);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(3); // Header + 2 Teilnehmer
  });

  it("Treiber semikolon-getrennt, Umfang aus evidence bevorzugt vor Kurs-Live-Wert", () => {
    const completedAt = new Date("2026-03-01T00:00:00Z");
    const startedAt = new Date("2026-02-01T00:00:00Z");
    const courses: CourseCompliance[] = [
      courseFixture({
        title: "KI-Kompetenz",
        drivers: ["eu_ai_act", "iso_42001"],
        estimatedMinutes: 60, // live Kurs-Wert
        participants: [
          participantFixture({
            displayName: "Anna",
            status: "abgeschlossen",
            startedAt,
            completedAt,
            courseVersionSnapshot: "v2",
            cycle: 1,
            evidence: { type: "all_lessons", estimatedMinutes: 45 }, // eingefroren, weicht ab
          }),
        ],
      }),
    ];
    const csv = buildComplianceCsv(courses);
    const [, row] = csv.slice(1).trimEnd().split("\r\n");
    expect(row).toBe(
      "Anna,KI-Kompetenz,eu_ai_act;iso_42001,45,abgeschlossen,2026-02-01,2026-03-01,v2,1,–",
    );
  });

  it("Umfang fällt auf den Kurs-Live-Wert zurück, wenn evidence fehlt (noch nicht abgeschlossen)", () => {
    const courses: CourseCompliance[] = [
      courseFixture({
        estimatedMinutes: 90,
        participants: [participantFixture({ evidence: null })],
      }),
    ];
    const csv = buildComplianceCsv(courses);
    const [, row] = csv.slice(1).trimEnd().split("\r\n");
    const fields = row.split(",");
    expect(fields[3]).toBe("90");
  });

  it("Pruefung = bestanden nur wenn evidence.assessment vorhanden ist", () => {
    const courses: CourseCompliance[] = [
      courseFixture({
        participants: [
          participantFixture({
            userId: "u-pass",
            evidence: {
              type: "all_lessons_and_assessment",
              assessment: { quizzes: [{ sectionSlug: "s1", lessonSlug: "l1" }] },
            },
          }),
          participantFixture({ userId: "u-none", evidence: null }),
        ],
      }),
    ];
    const csv = buildComplianceCsv(courses);
    const rows = csv.slice(1).trimEnd().split("\r\n").slice(1);
    expect(rows[0].endsWith(",bestanden")).toBe(true);
    expect(rows[1].endsWith(",–")).toBe(true);
  });

  it("RFC-4180-Escaping: Komma/Anführungszeichen/Zeilenumbruch im Namen werden gequotet", () => {
    const courses: CourseCompliance[] = [
      courseFixture({
        title: 'Kurs "Spezial", mit Komma',
        participants: [participantFixture({ displayName: 'Mai, "Anna"' })],
      }),
    ];
    const csv = buildComplianceCsv(courses);
    const [, row] = csv.slice(1).trimEnd().split("\r\n");
    expect(row.startsWith('"Mai, ""Anna""",')).toBe(true);
    expect(row).toContain('"Kurs ""Spezial"", mit Komma"');
  });

  it("leere Kursliste -> nur BOM + Kopfzeile, kein Crash", () => {
    const csv = buildComplianceCsv([]);
    expect(csv.slice(1).trimEnd()).toBe(
      "Teilnehmer,Kurs,Treiber,Umfang_Minuten,Status,Startdatum,Abschlussdatum,Kursversion,Zyklus,Pruefung",
    );
  });
});
