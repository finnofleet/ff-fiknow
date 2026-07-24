import { describe, expect, it } from "vitest";

import {
  DEFAULT_RETENTION_YEARS,
  isRetentionExpired,
  parseRetentionYears,
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
