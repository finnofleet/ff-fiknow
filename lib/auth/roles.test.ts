import { describe, expect, it } from "vitest";

import { DECLARED_ROLES } from "./capabilities";
import { completeRoleKeys, diffRoleKeys } from "./role-keys";
import {
  ALL_ROLES,
  canLearn,
  isSuspended,
  normalizeRole,
  type Role,
} from "./roles";

/**
 * Regressionsschutz (ADR 0007): die Rollen-Wrapper (`canSeeAdmin`,
 * `canManageCourses`, `canManageUsers`) sind entfallen — die Gates prüfen
 * jetzt direkt Capabilities (`resolveEffectiveCapabilities` + `can`). Was
 * NICHT entfallen darf, ist die zugrunde liegende Zuordnung Rolle →
 * Capability-Set: sie ist der Boden jeder Berechtigung (System-Rollen kommen
 * ausschliesslich hierueber, nicht aus der Matrix). Diese Wahrheitstabelle
 * prueft daher dieselben Aussagen wie vorher, nur eine Schicht tiefer — am
 * Capability-Set statt an den entfernten Wrappern. `canLearn` bleibt ein
 * direkter Status-Check und wird unveraendert mitgeprueft.
 */
const TRUTH_TABLE: Record<
  Role,
  {
    canLearn: boolean;
    /**
     * `canSeeAdmin` und `canManageCourses` waren zwei Wrapper ueber DERSELBEN
     * Capability (`courses:manage`) — hier bleibt ein Feld je Wrapper
     * erhalten, damit die Tabelle mit der historischen Fassung vergleichbar
     * bleibt; geprueft wird beides gegen `courses:manage`.
     */
    canSeeAdmin: boolean;
    canManageCourses: boolean;
    canManageUsers: boolean;
  }
> = {
  learner: {
    canLearn: true,
    canSeeAdmin: false,
    canManageCourses: false,
    canManageUsers: false,
  },
  curator: {
    canLearn: true,
    canSeeAdmin: true,
    canManageCourses: true,
    canManageUsers: false,
  },
  admin: {
    canLearn: true,
    canSeeAdmin: true,
    canManageCourses: true,
    canManageUsers: true,
  },
  suspended: {
    canLearn: false,
    canSeeAdmin: false,
    canManageCourses: false,
    canManageUsers: false,
  },
};

describe("Permission-Wahrheitstabelle (Rolle → Capabilities, Regressionsschutz)", () => {
  for (const role of ALL_ROLES) {
    const expected = TRUTH_TABLE[role];
    // Rang-Rollen ohne Eintrag in der Deklaration (learner/suspended) tragen
    // keine Capabilities — genau das prueft die Tabelle mit.
    const caps = new Set(DECLARED_ROLES[role]?.capabilities ?? []);

    it(`${role}: canLearn === ${expected.canLearn}`, () => {
      expect(canLearn(role)).toBe(expected.canLearn);
    });

    it(`${role}: courses:manage === ${expected.canSeeAdmin}`, () => {
      expect(caps.has("courses:manage")).toBe(expected.canSeeAdmin);
    });

    it(`${role}: users:manage === ${expected.canManageUsers}`, () => {
      expect(caps.has("users:manage")).toBe(expected.canManageUsers);
    });
  }
});

describe("isSuspended", () => {
  it("true nur für suspended", () => {
    expect(isSuspended("suspended")).toBe(true);
    expect(isSuspended("learner")).toBe(false);
    expect(isSuspended("curator")).toBe(false);
    expect(isSuspended("admin")).toBe(false);
  });
});

describe("normalizeRole", () => {
  it("der Legacy-Wert `editor` wird NICHT mehr abgefangen", () => {
    // Bewusst: der Initializer `normalize-legacy-roles` schreibt ihn beim
    // Boot auf `curator` um, BEVOR ihn etwas liest. Faellt er hier dennoch
    // an, ist der defensive Default richtig — lieber zu wenig Rechte als
    // eine stille Sonderregel, die Daten dauerhaft kompensiert.
    expect(normalizeRole("editor")).toBe("learner");
  });

  it("unbekannte/null-Werte werden defensiv zu learner", () => {
    expect(normalizeRole(null)).toBe("learner");
    expect(normalizeRole(undefined)).toBe("learner");
    expect(normalizeRole("typo")).toBe("learner");
  });
});

/**
 * Hierarchisches Rollen-Ziel für Pflichtschulungen (ADR 0011):
 * `roleMeetsTarget(userRole, targetRole)` prüft "diese Rolle ODER höher" statt
 * exakter Gleichheit — ein `learner`-Ziel erfasst damit auch Kurator:innen/
 * Admins (Compliance: alle müssen die Basis-Pflichtschulung machen).
 * `suspended` erfüllt kein Ziel, unabhängig vom Rang.
 */
describe("completeRoleKeys (loest ROLE_RANK/roleMeetsTarget ab)", () => {
  it("jede aktive Person traegt implizit learner", () => {
    for (const role of ["learner", "curator", "admin"]) {
      expect(completeRoleKeys(role, [])).toContain("learner");
    }
  });

  it("admin traegt zusaetzlich curator (die einzige echte Implikation)", () => {
    const keys = completeRoleKeys("admin", []);
    expect(keys).toContain("admin");
    expect(keys).toContain("curator");
    expect(keys).toContain("learner");
  });

  it("curator traegt NICHT admin", () => {
    expect(completeRoleKeys("curator", [])).not.toContain("admin");
  });

  it("ein learner-Ziel erfasst weiterhin curator und admin (ADR 0011)", () => {
    // Genau der Fall, an dem seinerzeit ein Kurator faelschlich durchs
    // Raster fiel — jetzt ueber Mengen-Zugehoerigkeit statt Rangvergleich.
    for (const role of ["learner", "curator", "admin"]) {
      expect(completeRoleKeys(role, []).includes("learner")).toBe(true);
    }
  });

  it("suspended traegt GAR KEINE Rollen-Keys (kein Ziel, keine Rechte)", () => {
    expect(completeRoleKeys("suspended", [])).toEqual([]);
  });

  it("Gruppen-Treffer kommen additiv dazu, ohne Rangfrage", () => {
    const keys = completeRoleKeys("admin", ["finknow-compliance"]);
    expect(new Set(keys)).toEqual(
      new Set(["learner", "admin", "curator", "finknow-compliance"]),
    );
  });
});

describe("diffRoleKeys", () => {
  it("erste Befuellung: alles ist added, nichts removed", () => {
    expect(diffRoleKeys(null, ["learner", "curator"])).toEqual({
      added: ["curator", "learner"],
      removed: [],
    });
  });

  it("unveraenderte Menge ergibt keinen Eintrag (kein Login-Rauschen)", () => {
    expect(diffRoleKeys(["learner", "curator"], ["curator", "learner"])).toEqual({
      added: [],
      removed: [],
    });
  });

  it("Compliance-Rolle dazubekommen wird als added erfasst", () => {
    expect(
      diffRoleKeys(["learner"], ["learner", "finknow-compliance"]),
    ).toEqual({ added: ["finknow-compliance"], removed: [] });
  });

  it("Entzug wird als removed erfasst", () => {
    expect(
      diffRoleKeys(["learner", "finknow-compliance"], ["learner"]),
    ).toEqual({ added: [], removed: ["finknow-compliance"] });
  });

  it("Sperrung (leere Menge) entfernt alles", () => {
    expect(diffRoleKeys(["learner", "admin", "curator"], [])).toEqual({
      added: [],
      removed: ["admin", "curator", "learner"],
    });
  });
});
