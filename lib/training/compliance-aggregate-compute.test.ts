import { describe, expect, it } from "vitest";

import {
  computeComplianceAggregate,
  LAND_UNASSIGNED,
  SUPPRESS_BELOW,
  type ComputeAggregateInput,
} from "./compliance-aggregate-compute";

function baseInput(
  over: Partial<ComputeAggregateInput> = {},
): ComputeAggregateInput {
  return {
    assignments: [],
    userLand: new Map(),
    titles: new Map(),
    ...over,
  };
}

describe("computeComplianceAggregate", () => {
  it("liefert [] fuer leere assignments", () => {
    const r = computeComplianceAggregate(baseInput());
    expect(r).toEqual([]);
  });

  it("dedupliziert: ein User mit zwei Zeilen (eine completed, eine offen) fuer denselben Kurs zaehlt als 1 assigned / 1 completed", () => {
    const now = new Date("2026-01-01");

    const r = computeComplianceAggregate(
      baseInput({
        assignments: [
          { userId: "u1", courseSlug: "ai-act-basics", completedAt: now },
          { userId: "u1", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u2", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u3", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u4", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u5", courseSlug: "ai-act-basics", completedAt: null },
        ],
        userLand: new Map([
          ["u1", "CH"],
          ["u2", "CH"],
          ["u3", "CH"],
          ["u4", "CH"],
          ["u5", "CH"],
        ]),
        titles: new Map([["ai-act-basics", "AI Act Basics"]]),
      }),
    );

    expect(r).toHaveLength(1);
    const bucket = r[0].buckets.find((b) => b.land === "CH");
    expect(bucket?.suppressed).toBe(false);
    if (bucket && bucket.suppressed === false) {
      expect(bucket.assigned).toBe(5);
      expect(bucket.completed).toBe(1);
    }
  });

  it("bucketet nach Land: getrennte Buckets fuer CH und DE, pct korrekt gerundet", () => {
    const now = new Date("2026-01-01");

    const r = computeComplianceAggregate(
      baseInput({
        assignments: [
          { userId: "u1", courseSlug: "ai-act-basics", completedAt: now },
          { userId: "u2", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u3", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u4", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u5", courseSlug: "ai-act-basics", completedAt: null },
        ],
        userLand: new Map([
          ["u1", "CH"],
          ["u2", "CH"],
          ["u3", "CH"],
          ["u4", "DE"],
          ["u5", "DE"],
        ]),
        titles: new Map([["ai-act-basics", "AI Act Basics"]]),
      }),
      2,
    );

    expect(r).toHaveLength(1);
    const chBucket = r[0].buckets.find((b) => b.land === "CH");
    expect(chBucket?.suppressed).toBe(false);
    if (chBucket && chBucket.suppressed === false) {
      expect(chBucket.assigned).toBe(3);
      expect(chBucket.completed).toBe(1);
      // 1 von 3 -> 33
      expect(chBucket.pct).toBe(33);
    }

    const deBucket = r[0].buckets.find((b) => b.land === "DE");
    expect(deBucket?.suppressed).toBe(false);
    if (deBucket && deBucket.suppressed === false) {
      expect(deBucket.assigned).toBe(2);
      expect(deBucket.completed).toBe(0);
      expect(deBucket.pct).toBe(0);
    }
  });

  it("User mit userLand null landen im Bucket LAND_UNASSIGNED", () => {
    const r = computeComplianceAggregate(
      baseInput({
        assignments: [
          { userId: "u1", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u2", courseSlug: "ai-act-basics", completedAt: null },
        ],
        userLand: new Map([
          ["u1", null],
          ["u2", null],
        ]),
        titles: new Map([["ai-act-basics", "AI Act Basics"]]),
      }),
      2,
    );

    expect(r).toHaveLength(1);
    const bucket = r[0].buckets.find((b) => b.land === LAND_UNASSIGNED);
    expect(bucket).toBeDefined();
    expect(bucket?.suppressed).toBe(false);
  });

  it("k-Anon mit niedrigem Schwellenwert-Override: unterdrueckte und sichtbare Buckets in einem Fall", () => {
    const r = computeComplianceAggregate(
      baseInput({
        assignments: [
          // CH: 3 Personen -> unterdrueckt bei Schwelle 2? Nein, 3 >= 2 -> sichtbar.
          // DE: 1 Person -> unterdrueckt bei Schwelle 2.
          { userId: "u1", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u2", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u3", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u4", courseSlug: "ai-act-basics", completedAt: null },
        ],
        userLand: new Map([
          ["u1", "CH"],
          ["u2", "CH"],
          ["u3", "DE"],
          ["u4", "FR"],
        ]),
        titles: new Map([["ai-act-basics", "AI Act Basics"]]),
      }),
      2,
    );

    expect(r).toHaveLength(1);
    const chBucket = r[0].buckets.find((b) => b.land === "CH");
    expect(chBucket?.suppressed).toBe(false);

    const deBucket = r[0].buckets.find((b) => b.land === "DE");
    expect(deBucket?.suppressed).toBe(true);
    expect(deBucket && "assigned" in deBucket).toBe(false);
    expect(deBucket && "completed" in deBucket).toBe(false);
    expect(deBucket && "pct" in deBucket).toBe(false);

    const frBucket = r[0].buckets.find((b) => b.land === "FR");
    expect(frBucket?.suppressed).toBe(true);
  });

  it("Default SUPPRESS_BELOW = 5 greift: Bucket mit 4 Personen wird unterdrueckt", () => {
    expect(SUPPRESS_BELOW).toBe(5);

    const r = computeComplianceAggregate(
      baseInput({
        assignments: [
          { userId: "u1", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u2", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u3", courseSlug: "ai-act-basics", completedAt: null },
          { userId: "u4", courseSlug: "ai-act-basics", completedAt: null },
        ],
        userLand: new Map([
          ["u1", "CH"],
          ["u2", "CH"],
          ["u3", "CH"],
          ["u4", "CH"],
        ]),
        titles: new Map([["ai-act-basics", "AI Act Basics"]]),
      }),
    );

    expect(r).toHaveLength(1);
    const bucket = r[0].buckets.find((b) => b.land === "CH");
    expect(bucket?.suppressed).toBe(true);
  });

  it("sortiert Kurse nach Titel und Buckets nach Land (alphabetisch)", () => {
    const r = computeComplianceAggregate(
      baseInput({
        assignments: [
          { userId: "u1", courseSlug: "zzz-course", completedAt: null },
          { userId: "u2", courseSlug: "zzz-course", completedAt: null },
          { userId: "u3", courseSlug: "aaa-course", completedAt: null },
          { userId: "u4", courseSlug: "aaa-course", completedAt: null },
        ],
        userLand: new Map([
          ["u1", "DE"],
          ["u2", "CH"],
          ["u3", "FR"],
          ["u4", "AT"],
        ]),
        titles: new Map([
          ["zzz-course", "B Kurs"],
          ["aaa-course", "A Kurs"],
        ]),
      }),
      1,
    );

    expect(r.map((c) => c.title)).toEqual(["A Kurs", "B Kurs"]);
    expect(r[0].buckets.map((b) => b.land)).toEqual(["AT", "FR"]);
    expect(r[1].buckets.map((b) => b.land)).toEqual(["CH", "DE"]);
  });
});
