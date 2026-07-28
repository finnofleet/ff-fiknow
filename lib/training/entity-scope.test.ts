import { describe, expect, it } from "vitest";

import {
  describeViewerScope,
  passesEntityScope,
  passesViewerScope,
  viewerScopeFromAssignments,
} from "./entity-scope";

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

/**
 * ADR 0007 §3 — Betrachter-Scope (Variante A, ODER ueber Zuweisungen/Grants,
 * UND ueber Dimensionen). Phase P2b: das Gate ist "keine Zuweisung ->
 * unrestricted" (heutiges Verhalten bleibt unveraendert).
 */
describe("viewerScopeFromAssignments", () => {
  it("leere Liste -> unrestricted (das Gate)", () => {
    expect(viewerScopeFromAssignments([])).toEqual({ kind: "unrestricted" });
  });

  it("eine Zuweisung mit scopeLand/scopeBu = null -> unrestricted (Variante-A-Kollaps)", () => {
    expect(
      viewerScopeFromAssignments([{ scopeLand: null, scopeBu: null }]),
    ).toEqual({ kind: "unrestricted" });
  });

  it("eine Zuweisung mit leeren Arrays -> unrestricted", () => {
    expect(
      viewerScopeFromAssignments([{ scopeLand: [], scopeBu: [] }]),
    ).toEqual({ kind: "unrestricted" });
  });

  it("eine Zuweisung mit scopeLand=[CH], scopeBu=null -> scoped mit einem Grant", () => {
    expect(
      viewerScopeFromAssignments([{ scopeLand: ["CH"], scopeBu: null }]),
    ).toEqual({
      kind: "scoped",
      grants: [{ land: ["CH"], bu: [] }],
    });
  });

  it("trimmt und filtert leere Werte", () => {
    expect(
      viewerScopeFromAssignments([
        { scopeLand: [" CH ", ""], scopeBu: null },
      ]),
    ).toEqual({
      kind: "scoped",
      grants: [{ land: ["CH"], bu: [] }],
    });
  });

  it("mehrere Zuweisungen, eine davon group-level {null,null} -> unrestricted (kollabiert alles)", () => {
    expect(
      viewerScopeFromAssignments([
        { scopeLand: ["CH"], scopeBu: null },
        { scopeLand: null, scopeBu: null },
      ]),
    ).toEqual({ kind: "unrestricted" });
  });

  it("zwei disjunkte scoped Zuweisungen -> scoped mit zwei Grants", () => {
    expect(
      viewerScopeFromAssignments([
        { scopeLand: ["CH"], scopeBu: null },
        { scopeLand: ["DE"], scopeBu: null },
      ]),
    ).toEqual({
      kind: "scoped",
      grants: [
        { land: ["CH"], bu: [] },
        { land: ["DE"], bu: [] },
      ],
    });
  });
});

describe("passesViewerScope", () => {
  it("unrestricted -> immer true, auch fuer subject ohne Land/BU", () => {
    expect(
      passesViewerScope({ land: null, bu: null }, { kind: "unrestricted" }),
    ).toBe(true);
    expect(
      passesViewerScope(
        { land: "CH", bu: "Payments" },
        { kind: "unrestricted" },
      ),
    ).toBe(true);
  });

  describe("scoped mit einem Grant", () => {
    const scope = { kind: "scoped" as const, grants: [{ land: ["CH"], bu: [] }] };

    it("subject-Land im Grant -> true", () => {
      expect(passesViewerScope({ land: "CH", bu: "Payments" }, scope)).toBe(
        true,
      );
    });

    it("subject-Land nicht im Grant -> false", () => {
      expect(passesViewerScope({ land: "DE", bu: "Payments" }, scope)).toBe(
        false,
      );
    });

    it("subject ohne Land/BU-Snapshot -> false (strikt)", () => {
      expect(passesViewerScope({ land: null, bu: null }, scope)).toBe(false);
    });
  });

  it("scoped ODER ueber Grants: subject matcht zweiten Grant -> true", () => {
    const scope = {
      kind: "scoped" as const,
      grants: [
        { land: ["CH"], bu: [] },
        { land: ["DE"], bu: [] },
      ],
    };
    expect(passesViewerScope({ land: "DE", bu: "Payments" }, scope)).toBe(
      true,
    );
  });

  describe("scoped UND ueber Dimensionen innerhalb eines Grants", () => {
    const scope = {
      kind: "scoped" as const,
      grants: [{ land: ["CH"], bu: ["Payments"] }],
    };

    it("Land matcht, BU nicht -> false", () => {
      expect(passesViewerScope({ land: "CH", bu: "Lending" }, scope)).toBe(
        false,
      );
    });

    it("beide matchen -> true", () => {
      expect(passesViewerScope({ land: "CH", bu: "Payments" }, scope)).toBe(
        true,
      );
    });
  });
});

/**
 * ADR 0007 §8 — Rechte-Inspektor. Menschenlesbare Beschreibung eines
 * ViewerScope, rein ohne I/O.
 */
describe("describeViewerScope", () => {
  it("unrestricted -> 'alle (unbeschraenkt)'", () => {
    expect(describeViewerScope({ kind: "unrestricted" })).toBe(
      "alle (unbeschraenkt)",
    );
  });

  it("scoped mit leeren grants -> 'nichts (kein gueltiger Grant)'", () => {
    expect(describeViewerScope({ kind: "scoped", grants: [] })).toBe(
      "nichts (kein gueltiger Grant)",
    );
  });

  it("ein Grant {land:[CH], bu:[]} -> 'CH / alle BUs'", () => {
    expect(
      describeViewerScope({
        kind: "scoped",
        grants: [{ land: ["CH"], bu: [] }],
      }),
    ).toBe("CH / alle BUs");
  });

  it("ein Grant {land:[], bu:[Payments]} -> 'alle Laender / Payments'", () => {
    expect(
      describeViewerScope({
        kind: "scoped",
        grants: [{ land: [], bu: ["Payments"] }],
      }),
    ).toBe("alle Laender / Payments");
  });

  it("zwei Grants -> per ' oder ' verbunden", () => {
    expect(
      describeViewerScope({
        kind: "scoped",
        grants: [
          { land: ["CH"], bu: [] },
          { land: [], bu: ["Payments"] },
        ],
      }),
    ).toBe("CH / alle BUs oder alle Laender / Payments");
  });
});
