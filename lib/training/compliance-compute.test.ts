import { describe, expect, it } from "vitest";

import { computeCompliance, type ComputeComplianceInput } from "./compliance-compute";

function baseInput(
  over: Partial<ComputeComplianceInput> = {},
): ComputeComplianceInput {
  return {
    assignments: [],
    startedAt: new Map(),
    hasProgress: new Set(),
    displayNames: new Map(),
    titles: new Map(),
    ...over,
  };
}

describe("computeCompliance", () => {
  it("berechnet die drei Zustände + Quote für einen Kurs mit 4 Usern", () => {
    const now = new Date("2026-01-01T00:00:00Z");

    const r = computeCompliance(
      baseInput({
        assignments: [
          { userId: "u-done", courseSlug: "ai-act-basics", completedAt: now },
          { userId: "u-enrolled", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u-progress-only", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u-untouched", courseSlug: "ai-act-basics", completedAt: null },
        ],
        startedAt: new Map([["u-enrolled::ai-act-basics", now]]),
        hasProgress: new Set(["u-progress-only::ai-act-basics"]),
        displayNames: new Map([
          ["u-done", "Done User"],
          ["u-enrolled", "Enrolled User"],
          ["u-progress-only", "Progress User"],
          ["u-untouched", "Untouched User"],
        ]),
        titles: new Map([["ai-act-basics", "AI Act Basics"]]),
      }),
    );

    expect(r).toHaveLength(1);
    const course = r[0];
    expect(course.courseSlug).toBe("ai-act-basics");
    expect(course.title).toBe("AI Act Basics");
    expect(course.assigned).toBe(4);
    expect(course.completed).toBe(1);
    expect(course.started).toBe(2);
    expect(course.notStarted).toBe(1);
    expect(course.pct).toBe(25);
    expect(course.assigned).toBe(course.completed + course.started + course.notStarted);

    const byId = new Map(course.participants.map((p) => [p.userId, p]));
    expect(byId.get("u-done")?.status).toBe("abgeschlossen");
    expect(byId.get("u-done")?.completedAt).toEqual(now);
    expect(byId.get("u-enrolled")?.status).toBe("gestartet");
    expect(byId.get("u-enrolled")?.startedAt).toEqual(now);
    expect(byId.get("u-progress-only")?.status).toBe("gestartet");
    expect(byId.get("u-progress-only")?.startedAt).toBeNull();
    expect(byId.get("u-untouched")?.status).toBe("nicht_gestartet");
  });

  it("dedupliziert einen User mit zwei Assignments (Toggle+Requirement) für denselben Kurs", () => {
    const earlier = new Date("2026-01-01T00:00:00Z");
    const later = new Date("2026-02-01T00:00:00Z");

    const r = computeCompliance(
      baseInput({
        assignments: [
          // Toggle-Assignment (course_mandatory): nicht abgeschlossen.
          { userId: "u-1", courseSlug: "safety-101", completedAt: null },
          // Requirement-Assignment: abgeschlossen.
          { userId: "u-1", courseSlug: "safety-101", completedAt: later },
        ],
        displayNames: new Map([["u-1", "Solo User"]]),
        titles: new Map([["safety-101", "Safety 101"]]),
      }),
    );

    const course = r[0];
    expect(course.assigned).toBe(1); // genau EINMAL gezählt, nicht 2
    expect(course.completed).toBe(1);
    expect(course.started).toBe(0);
    expect(course.notStarted).toBe(0);
    expect(course.pct).toBe(100);
    expect(course.participants).toHaveLength(1);
    expect(course.participants[0].status).toBe("abgeschlossen");
    expect(course.participants[0].completedAt).toEqual(later);

    // Frühester Abschluss-Zeitstempel wird angezeigt, falls mehrere completed.
    const r2 = computeCompliance(
      baseInput({
        assignments: [
          { userId: "u-1", courseSlug: "safety-101", completedAt: later },
          { userId: "u-1", courseSlug: "safety-101", completedAt: earlier },
        ],
      }),
    );
    expect(r2[0].participants[0].completedAt).toEqual(earlier);
  });

  it("assigned=0 (keine Assignments): leeres Ergebnis, kein Crash", () => {
    const r = computeCompliance(baseInput());
    expect(r).toEqual([]);
  });

  it("Fallback: fehlender displayName -> userId, fehlender Titel -> courseSlug", () => {
    const r = computeCompliance(
      baseInput({
        assignments: [{ userId: "u-x", courseSlug: "unknown-course", completedAt: null }],
      }),
    );
    expect(r[0].title).toBe("unknown-course");
    expect(r[0].participants[0].displayName).toBe("u-x");
  });

  it("sortiert Kurse nach pct aufsteigend (schlechteste Erfüllung zuerst), dann Titel", () => {
    const r = computeCompliance(
      baseInput({
        assignments: [
          // 100% erfüllt
          { userId: "u-a", courseSlug: "course-full", completedAt: new Date() },
          // 0% erfüllt
          { userId: "u-b", courseSlug: "course-empty", completedAt: null },
          // 50% erfüllt
          { userId: "u-c", courseSlug: "course-half", completedAt: new Date() },
          { userId: "u-d", courseSlug: "course-half", completedAt: null },
        ],
        titles: new Map([
          ["course-full", "Full"],
          ["course-empty", "Empty"],
          ["course-half", "Half"],
        ]),
      }),
    );

    expect(r.map((c) => c.courseSlug)).toEqual([
      "course-empty",
      "course-half",
      "course-full",
    ]);
  });

  it("sortiert Teilnehmer nach Status-Rang, dann displayName", () => {
    const r = computeCompliance(
      baseInput({
        assignments: [
          { userId: "u-z", courseSlug: "c", completedAt: new Date() },
          { userId: "u-a", courseSlug: "c", completedAt: null },
          { userId: "u-m", courseSlug: "c", completedAt: null },
        ],
        hasProgress: new Set(["u-m::c"]),
        displayNames: new Map([
          ["u-z", "Zed Abgeschlossen"],
          ["u-a", "Anna Nichtgestartet"],
          ["u-m", "Mona Gestartet"],
        ]),
      }),
    );

    expect(r[0].participants.map((p) => p.displayName)).toEqual([
      "Anna Nichtgestartet",
      "Mona Gestartet",
      "Zed Abgeschlossen",
    ]);
  });
});
