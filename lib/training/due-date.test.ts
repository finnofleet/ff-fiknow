import { describe, expect, it } from "vitest";

import { computeDueDate, isRecertDue } from "./due-date";

describe("computeDueDate", () => {
  describe("ab_zuweisung", () => {
    it("addiert offsetDays auf assignedAt", () => {
      const assignedAt = new Date("2026-01-01T00:00:00Z");
      const due = computeDueDate(
        { type: "ab_zuweisung", offsetDays: 14 },
        { assignedAt },
      );
      expect(due?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    });

    it("offsetDays=0 → Fälligkeit = assignedAt", () => {
      const assignedAt = new Date("2026-01-01T00:00:00Z");
      const due = computeDueDate(
        { type: "ab_zuweisung", offsetDays: 0 },
        { assignedAt },
      );
      expect(due?.toISOString()).toBe(assignedAt.toISOString());
    });

    it("fehlendes offsetDays → null", () => {
      const due = computeDueDate(
        { type: "ab_zuweisung" },
        { assignedAt: new Date("2026-01-01T00:00:00Z") },
      );
      expect(due).toBeNull();
    });

    it("offsetDays=null → null", () => {
      const due = computeDueDate(
        { type: "ab_zuweisung", offsetDays: null },
        { assignedAt: new Date("2026-01-01T00:00:00Z") },
      );
      expect(due).toBeNull();
    });
  });

  describe("ab_start", () => {
    it("addiert offsetDays auf startedAt, wenn gesetzt", () => {
      const startedAt = new Date("2026-02-01T00:00:00Z");
      const due = computeDueDate(
        { type: "ab_start", offsetDays: 7 },
        { assignedAt: new Date("2026-01-01T00:00:00Z"), startedAt },
      );
      expect(due?.toISOString()).toBe("2026-02-08T00:00:00.000Z");
    });

    it("ohne startedAt → null", () => {
      const due = computeDueDate(
        { type: "ab_start", offsetDays: 7 },
        { assignedAt: new Date("2026-01-01T00:00:00Z"), startedAt: null },
      );
      expect(due).toBeNull();
    });

    it("startedAt undefined → null", () => {
      const due = computeDueDate(
        { type: "ab_start", offsetDays: 7 },
        { assignedAt: new Date("2026-01-01T00:00:00Z") },
      );
      expect(due).toBeNull();
    });

    it("startedAt gesetzt, aber offsetDays fehlt → null", () => {
      const due = computeDueDate(
        { type: "ab_start" },
        {
          assignedAt: new Date("2026-01-01T00:00:00Z"),
          startedAt: new Date("2026-02-01T00:00:00Z"),
        },
      );
      expect(due).toBeNull();
    });
  });

  describe("fixes_datum", () => {
    it("übernimmt fixedDate als Date", () => {
      const due = computeDueDate(
        { type: "fixes_datum", fixedDate: "2026-12-31" },
        { assignedAt: new Date("2026-01-01T00:00:00Z") },
      );
      expect(due?.toISOString().slice(0, 10)).toBe("2026-12-31");
    });

    it("fixedDate akzeptiert auch ein Date-Objekt", () => {
      const fixedDate = new Date("2026-06-15T00:00:00Z");
      const due = computeDueDate(
        { type: "fixes_datum", fixedDate },
        { assignedAt: new Date("2026-01-01T00:00:00Z") },
      );
      expect(due?.toISOString()).toBe(fixedDate.toISOString());
    });

    it("fehlendes fixedDate → null", () => {
      const due = computeDueDate(
        { type: "fixes_datum" },
        { assignedAt: new Date("2026-01-01T00:00:00Z") },
      );
      expect(due).toBeNull();
    });
  });
});

describe("isRecertDue", () => {
  it("recurrenceMonths=0 → nie fällig", () => {
    const completedAt = new Date("2020-01-01T00:00:00Z");
    const now = new Date("2030-01-01T00:00:00Z");
    expect(isRecertDue(completedAt, 0, now)).toBe(false);
  });

  it("negative recurrenceMonths → nie fällig", () => {
    const completedAt = new Date("2020-01-01T00:00:00Z");
    const now = new Date("2030-01-01T00:00:00Z");
    expect(isRecertDue(completedAt, -1, now)).toBe(false);
  });

  it("exakt fällig (completedAt + recurrenceMonths === now) → true", () => {
    const completedAt = new Date("2025-01-01T00:00:00Z");
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isRecertDue(completedAt, 12, now)).toBe(true);
  });

  it("knapp nicht fällig (1ms vor Fälligkeit) → false", () => {
    const completedAt = new Date("2025-01-01T00:00:00Z");
    const now = new Date("2025-12-31T23:59:59.999Z");
    expect(isRecertDue(completedAt, 12, now)).toBe(false);
  });

  it("knapp fällig (1ms nach Fälligkeit) → true", () => {
    const completedAt = new Date("2025-01-01T00:00:00Z");
    const now = new Date("2026-01-01T00:00:00.001Z");
    expect(isRecertDue(completedAt, 12, now)).toBe(true);
  });
});
