import { describe, expect, it } from "vitest";

import {
  DEFAULT_RETENTION_YEARS,
  isRetentionExpired,
  parseRetentionYears,
  retentionCutoff,
} from "./retention";

describe("isRetentionExpired", () => {
  it("nicht abgelaufen (deutlich vor Fristablauf)", () => {
    const anchor = new Date("2024-01-01T00:00:00Z");
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isRetentionExpired(anchor, now, 3)).toBe(false);
  });

  it("exakt an der Grenze (anchor + years === now) → abgelaufen", () => {
    const anchor = new Date("2023-01-01T00:00:00Z");
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isRetentionExpired(anchor, now, 3)).toBe(true);
  });

  it("1ms vor der Grenze → nicht abgelaufen", () => {
    const anchor = new Date("2023-01-01T00:00:00Z");
    const now = new Date("2025-12-31T23:59:59.999Z");
    expect(isRetentionExpired(anchor, now, 3)).toBe(false);
  });

  it("1ms nach der Grenze → abgelaufen", () => {
    const anchor = new Date("2023-01-01T00:00:00Z");
    const now = new Date("2026-01-01T00:00:00.001Z");
    expect(isRetentionExpired(anchor, now, 3)).toBe(true);
  });

  it("weit nach Fristablauf → abgelaufen", () => {
    const anchor = new Date("2010-01-01T00:00:00Z");
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isRetentionExpired(anchor, now, 3)).toBe(true);
  });

  it("default years (kein 3. Argument) nutzt RETENTION_YEARS (=3 ohne Env-Override)", () => {
    const anchor = new Date("2023-01-01T00:00:00Z");
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isRetentionExpired(anchor, now)).toBe(true);
  });

  it("Jahres-Override (z. B. 1 Jahr) wird respektiert", () => {
    const anchor = new Date("2025-01-01T00:00:00Z");
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isRetentionExpired(anchor, now, 1)).toBe(true);
    expect(isRetentionExpired(anchor, now, 2)).toBe(false);
  });
});

describe("retentionCutoff (mengenbasierter Stichtag)", () => {
  it("cutoff = now minus years", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(retentionCutoff(now, 3).toISOString()).toBe(
      "2023-01-01T00:00:00.000Z",
    );
  });

  it("Parität mit isRetentionExpired: anchor <= cutoff ⟺ abgelaufen", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const years = 3;
    const cutoff = retentionCutoff(now, years);
    const anchors = [
      new Date("2020-01-01T00:00:00Z"), // längst abgelaufen
      new Date("2023-06-15T12:00:00Z"), // exakt an der Grenze
      new Date("2023-06-15T12:00:00.001Z"), // 1ms nach Grenze → noch aufzubewahren
      new Date("2024-01-01T00:00:00Z"), // frisch
    ];
    for (const anchor of anchors) {
      const bySql = anchor.getTime() <= cutoff.getTime();
      const byPredicate = isRetentionExpired(anchor, now, years);
      expect(bySql, anchor.toISOString()).toBe(byPredicate);
    }
  });

  it("default years nutzt RETENTION_YEARS (=3 ohne Env-Override)", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(retentionCutoff(now).toISOString()).toBe(
      "2023-01-01T00:00:00.000Z",
    );
  });
});

describe("parseRetentionYears (FIKNOW_RETENTION_YEARS Env-Override)", () => {
  it("gültiger Override wird übernommen", () => {
    expect(parseRetentionYears("5")).toBe(5);
  });

  it("nicht gesetzt (undefined) → Fallback DEFAULT_RETENTION_YEARS", () => {
    expect(parseRetentionYears(undefined)).toBe(DEFAULT_RETENTION_YEARS);
  });

  it("leerer String → Fallback DEFAULT_RETENTION_YEARS", () => {
    expect(parseRetentionYears("  ")).toBe(DEFAULT_RETENTION_YEARS);
  });

  it("nicht-numerischer Wert → Fallback DEFAULT_RETENTION_YEARS", () => {
    expect(parseRetentionYears("not-a-number")).toBe(DEFAULT_RETENTION_YEARS);
  });

  it("0 → Fallback DEFAULT_RETENTION_YEARS", () => {
    expect(parseRetentionYears("0")).toBe(DEFAULT_RETENTION_YEARS);
  });

  it("negativer Wert → Fallback DEFAULT_RETENTION_YEARS", () => {
    expect(parseRetentionYears("-2")).toBe(DEFAULT_RETENTION_YEARS);
  });
});
