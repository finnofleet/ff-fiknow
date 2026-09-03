import { describe, expect, it } from "vitest";

import {
  parseSettingValue,
  resolveSetting,
  SETTING_DEFS,
  SETTING_RETENTION_YEARS,
} from "./registry";

const def = SETTING_DEFS[SETTING_RETENTION_YEARS]!;

describe("parseSettingValue", () => {
  it("akzeptiert eine gueltige Zahl", () => {
    expect(parseSettingValue(def, "5")).toBe(5);
  });

  it("null/leer/nicht-numerisch ergibt null (Fallback beim Aufrufer)", () => {
    expect(parseSettingValue(def, null)).toBeNull();
    expect(parseSettingValue(def, "")).toBeNull();
    expect(parseSettingValue(def, "   ")).toBeNull();
    expect(parseSettingValue(def, "drei")).toBeNull();
  });

  it("Werte ausserhalb der Grenzen ergeben null statt zu werfen", () => {
    // Bewusst kein Throw: ein kaputter DB-Wert darf den naechtlichen Purge
    // nicht abbrechen, sondern muss auf den bekannten Default zurueckfallen.
    expect(parseSettingValue(def, String(def.min - 1))).toBeNull();
    expect(parseSettingValue(def, String(def.max + 1))).toBeNull();
  });
});

describe("resolveSetting — DB vor Env vor Default", () => {
  it("DB-Wert gewinnt", () => {
    expect(resolveSetting(def, "7", "5")).toEqual({ value: 7, source: "db" });
  });

  it("ohne DB-Wert greift die Env", () => {
    expect(resolveSetting(def, null, "5")).toEqual({ value: 5, source: "env" });
  });

  it("ohne beides der Default", () => {
    expect(resolveSetting(def, null, null)).toEqual({
      value: def.default,
      source: "default",
    });
  });

  it("ein UNGUELTIGER DB-Wert faellt auf die Env zurueck, nicht auf null", () => {
    expect(resolveSetting(def, "999", "5")).toEqual({ value: 5, source: "env" });
  });

  it("sind DB und Env ungueltig, gilt der Default", () => {
    expect(resolveSetting(def, "abc", "-4")).toEqual({
      value: def.default,
      source: "default",
    });
  });
});

describe("SETTING_DEFS", () => {
  it("die Aufbewahrungsfrist hat den bisherigen Default (3 Jahre, ADR 0006)", () => {
    expect(def.default).toBe(3);
    expect(def.envVar).toBe("FINKNOW_RETENTION_YEARS");
  });

  it("jede Deklaration hat sinnvolle Grenzen", () => {
    for (const d of Object.values(SETTING_DEFS)) {
      expect(d.min).toBeLessThan(d.max);
      expect(d.default).toBeGreaterThanOrEqual(d.min);
      expect(d.default).toBeLessThanOrEqual(d.max);
    }
  });
});
