import { describe, expect, it } from "vitest";

import { pickCourseRepresentatives, type AssignmentRow } from "./dedupe-assignments";

function row(over: Partial<AssignmentRow>): AssignmentRow {
  return {
    courseSlug: "kurs-a",
    courseTitleSnapshot: null,
    dueDate: null,
    completedAt: null,
    cycle: 1,
    ...over,
  };
}

const D = (iso: string) => new Date(iso);

describe("pickCourseRepresentatives", () => {
  it("dedupliziert Toggle+Requirement desselben Kurses auf eine Zeile", () => {
    const reps = pickCourseRepresentatives([
      row({ courseSlug: "a", completedAt: null, dueDate: null }), // Toggle, offen, keine Frist
      row({ courseSlug: "a", completedAt: null, dueDate: D("2026-08-01") }), // Requirement, offen, mit Frist
    ]);
    expect(reps).toHaveLength(1);
    // dringlichste offene = die MIT Frist
    expect(reps[0].dueDate).toEqual(D("2026-08-01"));
  });

  it("wählt bei mehreren offenen die früheste Frist", () => {
    const reps = pickCourseRepresentatives([
      row({ dueDate: D("2026-09-01") }),
      row({ dueDate: D("2026-07-15") }),
      row({ dueDate: D("2026-08-01") }),
    ]);
    expect(reps).toHaveLength(1);
    expect(reps[0].dueDate).toEqual(D("2026-07-15"));
  });

  it("offen schlägt erledigt (aktive Pflicht zählt, z. B. Rezert-Zyklus)", () => {
    const reps = pickCourseRepresentatives([
      row({ cycle: 1, completedAt: D("2024-01-01") }), // alter Zyklus erledigt
      row({ cycle: 2, completedAt: null, dueDate: D("2026-07-20") }), // Rezert offen
    ]);
    expect(reps).toHaveLength(1);
    expect(reps[0].completedAt).toBeNull();
    expect(reps[0].cycle).toBe(2);
  });

  it("sind alle erledigt, gewinnt die zuletzt erledigte", () => {
    const reps = pickCourseRepresentatives([
      row({ completedAt: D("2024-01-01") }),
      row({ completedAt: D("2026-07-03") }),
    ]);
    expect(reps).toHaveLength(1);
    expect(reps[0].completedAt).toEqual(D("2026-07-03"));
  });

  it("bei gleicher Frist gewinnt der höhere Zyklus", () => {
    const reps = pickCourseRepresentatives([
      row({ cycle: 1, dueDate: D("2026-07-20") }),
      row({ cycle: 3, dueDate: D("2026-07-20") }),
    ]);
    expect(reps[0].cycle).toBe(3);
  });

  it("hält verschiedene Kurse getrennt", () => {
    const reps = pickCourseRepresentatives([
      row({ courseSlug: "a" }),
      row({ courseSlug: "b" }),
      row({ courseSlug: "a" }),
    ]);
    expect(new Set(reps.map((r) => r.courseSlug))).toEqual(new Set(["a", "b"]));
    expect(reps).toHaveLength(2);
  });

  it("leere Eingabe → leer", () => {
    expect(pickCourseRepresentatives([])).toEqual([]);
  });
});
