import { describe, expect, it } from "vitest";

import {
  ALL_ROLES,
  canLearn,
  canManageCourses,
  canManageUsers,
  canSeeAdmin,
  isSuspended,
  normalizeRole,
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
