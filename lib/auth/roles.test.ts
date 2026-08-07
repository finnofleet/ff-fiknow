import { describe, expect, it } from "vitest";

import {
  ALL_ROLES,
  canLearn,
  canManageCourses,
  canManageUsers,
  canSeeAdmin,
  isSuspended,
  normalizeRole,
  ROLE_RANK,
  roleMeetsTarget,
  type Role,
} from "./roles";

/**
 * Regressionsschutz (ADR 0007, Phase P1): `roles.ts` delegiert seit P1 intern
 * an die Capability-Schicht (`capabilitiesForLegacyRole` +
 * `can`), aber das beobachtbare Verhalten der vier Permission-Funktionen
 * MUSS bit-identisch zum alten Single-Role-Modell bleiben. Diese
 * Wahrheitstabelle ist exakt die aus der Aufgabenstellung — bricht sie,
 * hat der Capability-Umbau das Verhalten verändert.
 */
const TRUTH_TABLE: Record<
  Role,
  {
    canLearn: boolean;
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

describe("Permission-Wahrheitstabelle (roles.ts, Regressionsschutz)", () => {
  for (const role of ALL_ROLES) {
    const expected = TRUTH_TABLE[role];

    it(`${role}: canLearn === ${expected.canLearn}`, () => {
      expect(canLearn(role)).toBe(expected.canLearn);
    });

    it(`${role}: canSeeAdmin === ${expected.canSeeAdmin}`, () => {
      expect(canSeeAdmin(role)).toBe(expected.canSeeAdmin);
    });

    it(`${role}: canManageCourses === ${expected.canManageCourses}`, () => {
      expect(canManageCourses(role)).toBe(expected.canManageCourses);
    });

    it(`${role}: canManageUsers === ${expected.canManageUsers}`, () => {
      expect(canManageUsers(role)).toBe(expected.canManageUsers);
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
  it("legacy `editor` wird zu curator", () => {
    expect(normalizeRole("editor")).toBe("curator");
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
describe("ROLE_RANK", () => {
  it("Rang-Reihenfolge: suspended < learner < curator < admin", () => {
    expect(ROLE_RANK.suspended).toBeLessThan(ROLE_RANK.learner);
    expect(ROLE_RANK.learner).toBeLessThan(ROLE_RANK.curator);
    expect(ROLE_RANK.curator).toBeLessThan(ROLE_RANK.admin);
  });
});

describe("roleMeetsTarget", () => {
  describe("Ziel: learner", () => {
    it("wird von learner, curator, admin erfüllt", () => {
      expect(roleMeetsTarget("learner", "learner")).toBe(true);
      expect(roleMeetsTarget("curator", "learner")).toBe(true);
      expect(roleMeetsTarget("admin", "learner")).toBe(true);
    });

    it("wird NICHT von suspended erfüllt", () => {
      expect(roleMeetsTarget("suspended", "learner")).toBe(false);
    });
  });

  describe("Ziel: curator", () => {
    it("wird von curator, admin erfüllt", () => {
      expect(roleMeetsTarget("curator", "curator")).toBe(true);
      expect(roleMeetsTarget("admin", "curator")).toBe(true);
    });

    it("wird NICHT von learner oder suspended erfüllt", () => {
      expect(roleMeetsTarget("learner", "curator")).toBe(false);
      expect(roleMeetsTarget("suspended", "curator")).toBe(false);
    });
  });

  describe("Ziel: admin", () => {
    it("wird NUR von admin erfüllt", () => {
      expect(roleMeetsTarget("admin", "admin")).toBe(true);
    });

    it("wird NICHT von curator, learner oder suspended erfüllt", () => {
      expect(roleMeetsTarget("curator", "admin")).toBe(false);
      expect(roleMeetsTarget("learner", "admin")).toBe(false);
      expect(roleMeetsTarget("suspended", "admin")).toBe(false);
    });
  });

  describe("suspended als User-Rolle", () => {
    it("erfüllt kein Rollen-Ziel", () => {
      const targets: Role[] = ["learner", "curator", "admin"];
      for (const target of targets) {
        expect(roleMeetsTarget("suspended", target)).toBe(false);
      }
    });
  });
});
