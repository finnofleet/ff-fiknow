import { describe, expect, it } from "vitest";

import {
  computePathProgress,
  type PathCourseInput,
} from "./paths-progress-compute";

function input(over: Partial<PathCourseInput> = {}): PathCourseInput {
  return {
    courseSlug: "c",
    title: "C",
    role: "required",
    totalLessons: 4,
    completedLessons: 0,
    startedLessons: 0,
    ...over,
  };
}

describe("computePathProgress", () => {
  it("zählt abgeschlossene Kurse, nicht Lektions-Mikroprozente", () => {
    const r = computePathProgress([
      input({ courseSlug: "a", totalLessons: 4, completedLessons: 4 }), // fertig
      input({
        courseSlug: "b",
        totalLessons: 5,
        completedLessons: 2,
        startedLessons: 1,
      }), // teils
      input({ courseSlug: "c", totalLessons: 3, completedLessons: 0 }), // offen
    ]);

    expect(r.coursesTotal).toBe(3);
    expect(r.coursesDone).toBe(1);
    expect(r.pct).toBe(33); // round(1/3*100)
    expect(r.nextCourseSlug).toBe("b"); // erster nicht-fertiger
  });

  it("markiert done/started pro Kurs korrekt", () => {
    const r = computePathProgress([
      input({ courseSlug: "a", totalLessons: 4, completedLessons: 4 }),
      input({ courseSlug: "b", totalLessons: 5, completedLessons: 0, startedLessons: 2 }),
      input({ courseSlug: "c", totalLessons: 3, completedLessons: 0, startedLessons: 0 }),
    ]);

    expect(r.perCourse[0].done).toBe(true);
    expect(r.perCourse[1].done).toBe(false);
    expect(r.perCourse[1].started).toBe(true); // nur in_progress reicht
    expect(r.perCourse[2].started).toBe(false);
  });

  it("leerer Pfad: 0 %, kein nächster Kurs", () => {
    const r = computePathProgress([]);
    expect(r.coursesTotal).toBe(0);
    expect(r.coursesDone).toBe(0);
    expect(r.pct).toBe(0);
    expect(r.nextCourseSlug).toBeNull();
  });

  it("alles fertig: 100 %, kein nächster Kurs", () => {
    const r = computePathProgress([
      input({ courseSlug: "x", totalLessons: 2, completedLessons: 2 }),
      input({ courseSlug: "y", totalLessons: 1, completedLessons: 1 }),
    ]);
    expect(r.pct).toBe(100);
    expect(r.coursesDone).toBe(2);
    expect(r.nextCourseSlug).toBeNull();
  });

  it("0-Lektionen-Kurs gilt als vacuously done (blockiert Weiterlernen nicht)", () => {
    const r = computePathProgress([
      input({ courseSlug: "z", totalLessons: 0, completedLessons: 0 }),
    ]);
    expect(r.perCourse[0].done).toBe(true);
    expect(r.pct).toBe(100);
    expect(r.nextCourseSlug).toBeNull();
  });

  it("completed >= total (z. B. nachträglich entfernte Lektion) gilt als done", () => {
    const r = computePathProgress([
      input({ courseSlug: "a", totalLessons: 3, completedLessons: 5 }),
    ]);
    expect(r.perCourse[0].done).toBe(true);
    expect(r.nextCourseSlug).toBeNull();
  });
});
