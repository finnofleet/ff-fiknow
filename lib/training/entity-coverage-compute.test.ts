import { describe, expect, it } from "vitest";

import { computeEntityCoverage } from "./entity-coverage-compute";

type Axes = { land: string | null; bu: string | null };

function profileMap(entries: Record<string, Axes>): Map<string, Axes> {
  return new Map(Object.entries(entries));
}

describe("computeEntityCoverage", () => {
  it("zaehlt nur Personen mit Pflichtzuweisung als Bezugsmenge", () => {
    const result = computeEntityCoverage({
      assignedUserIds: ["u1"],
      byUser: profileMap({
        u1: { land: "DE", bu: "FFDE" },
        // u2 hat ein vollstaendiges Profil, aber keine Zuweisung -> irrelevant
        u2: { land: null, bu: null },
      }),
    });
    expect(result).toEqual({
      withAssignments: 1,
      missingLand: 0,
      missingBu: 0,
    });
  });

  it("vollstaendige Zuordnung ergibt keine Luecke", () => {
    const result = computeEntityCoverage({
      assignedUserIds: ["u1", "u2"],
      byUser: profileMap({
        u1: { land: "DE", bu: "FFDE" },
        u2: { land: "LUX", bu: "FFLUX" },
      }),
    });
    expect(result.missingLand).toBe(0);
    expect(result.missingBu).toBe(0);
  });

  it("null-Land zaehlt als fehlend", () => {
    const result = computeEntityCoverage({
      assignedUserIds: ["u1"],
      byUser: profileMap({ u1: { land: null, bu: "FFDE" } }),
    });
    expect(result.missingLand).toBe(1);
    expect(result.missingBu).toBe(0);
  });

  it("Land ausserhalb von LAND_TOKENS zaehlt ebenfalls als fehlend (Altbestand)", () => {
    // Kernfall: das Claim-Gate schreibt solche Werte nicht mehr, ueberschreibt
    // bestehende aber auch nicht. Wuerde hier nur auf null geprueft, blieben
    // genau diese Personen unsichtbar UND unerfasst.
    const result = computeEntityCoverage({
      assignedUserIds: ["u1", "u2"],
      byUser: profileMap({
        u1: { land: "AT", bu: "FFAT" },
        u2: { land: "LU", bu: "FFLUX" }, // ISO-Kuerzel statt App-Token LUX
      }),
    });
    expect(result.missingLand).toBe(2);
    expect(result.missingBu).toBe(0);
  });

  it("fehlender Profil-Eintrag zaehlt auf beiden Achsen als fehlend", () => {
    const result = computeEntityCoverage({
      assignedUserIds: ["u1"],
      byUser: profileMap({}),
    });
    expect(result).toEqual({
      withAssignments: 1,
      missingLand: 1,
      missingBu: 1,
    });
  });

  it("leere Bu-Werte zaehlen als fehlend, Land bleibt davon unberuehrt", () => {
    const result = computeEntityCoverage({
      assignedUserIds: ["u1", "u2"],
      byUser: profileMap({
        u1: { land: "DE", bu: null },
        u2: { land: "CH", bu: "" },
      }),
    });
    expect(result.missingLand).toBe(0);
    expect(result.missingBu).toBe(2);
  });

  it("leere Bezugsmenge ergibt Nullen", () => {
    expect(
      computeEntityCoverage({ assignedUserIds: [], byUser: profileMap({}) }),
    ).toEqual({ withAssignments: 0, missingLand: 0, missingBu: 0 });
  });
});
