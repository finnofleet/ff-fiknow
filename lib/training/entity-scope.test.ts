import { describe, expect, it } from "vitest";

import { passesEntityScope } from "./entity-scope";

/**
 * ADR 0007 §4 — Land/BU-Zielfilter für training-requirements. Reine
 * Scope-Filter-Logik: leerer Scope je Achse = kein Filter; ein gesetzter
 * Scope + `null`-Profilwert matcht NICHT (strikt).
 */
describe("passesEntityScope", () => {
  it("beide Scopes leer → immer true (kein Filter)", () => {
    expect(passesEntityScope({ land: null, bu: null }, [], [])).toBe(true);
    expect(passesEntityScope({ land: "CH", bu: "Payments" }, [], [])).toBe(
      true,
    );
  });

  describe("nur Land-Scope gesetzt", () => {
    it("Profil-Land im Scope → true", () => {
      expect(passesEntityScope({ land: "CH", bu: null }, ["CH"], [])).toBe(
        true,
      );
    });

    it("Profil-Land NICHT im Scope → false", () => {
      expect(passesEntityScope({ land: "DE", bu: null }, ["CH"], [])).toBe(
        false,
      );
    });

    it("Profil-Land ist null (gesetzter Filter) → false (strikt)", () => {
      expect(passesEntityScope({ land: null, bu: null }, ["CH"], [])).toBe(
        false,
      );
    });
  });

  describe("nur BU-Scope gesetzt", () => {
    it("Profil-BU im Scope → true", () => {
      expect(
        passesEntityScope({ land: null, bu: "Payments" }, [], ["Payments"]),
      ).toBe(true);
    });

    it("Profil-BU NICHT im Scope → false", () => {
      expect(
        passesEntityScope({ land: null, bu: "Retail" }, [], ["Payments"]),
      ).toBe(false);
    });

    it("Profil-BU ist null (gesetzter Filter) → false (strikt)", () => {
      expect(passesEntityScope({ land: null, bu: null }, [], ["Payments"])).toBe(
        false,
      );
    });
  });

  describe("beide Scopes gesetzt (Schnitt/AND)", () => {
    it("beide matchen → true", () => {
      expect(
        passesEntityScope(
          { land: "CH", bu: "Payments" },
          ["CH"],
          ["Payments"],
        ),
      ).toBe(true);
    });

    it("nur Land matcht, BU nicht → false", () => {
      expect(
        passesEntityScope({ land: "CH", bu: "Retail" }, ["CH"], ["Payments"]),
      ).toBe(false);
    });

    it("nur BU matcht, Land nicht → false", () => {
      expect(
        passesEntityScope(
          { land: "DE", bu: "Payments" },
          ["CH"],
          ["Payments"],
        ),
      ).toBe(false);
    });

    it("beide Profilwerte null → false (strikt)", () => {
      expect(
        passesEntityScope({ land: null, bu: null }, ["CH"], ["Payments"]),
      ).toBe(false);
    });
  });
});
