import { describe, expect, it } from "vitest";

import {
  ALL_CAPABILITIES,
  can,
  COMPLIANCE_ROLE_KEY,
  DECLARED_ROLES,
  mergeDbCapabilities,
  type Capability,
} from "./capabilities";

describe("DECLARED_ROLES (Trennung Inhalt / Nachweis, BR-Auflage)", () => {
  it("curator traegt KEINE compliance-Capability", () => {
    const caps = DECLARED_ROLES.curator!.capabilities;
    expect(caps).toContain("courses:manage");
    expect(caps.some((c) => c.startsWith("compliance:"))).toBe(false);
  });

  it("admin traegt KEINE compliance-Capability", () => {
    const caps = DECLARED_ROLES.admin!.capabilities;
    expect(caps).toContain("users:manage");
    expect(caps).toContain("audit:view");
    expect(caps.some((c) => c.startsWith("compliance:"))).toBe(false);
  });

  it("die Compliance-Rolle traegt Einsicht, Aggregat und Export", () => {
    const caps = DECLARED_ROLES[COMPLIANCE_ROLE_KEY]!.capabilities;
    expect(new Set(caps)).toEqual(
      new Set([
        "compliance:view-named",
        "compliance:view-aggregate",
        "compliance:export",
      ]),
    );
  });

  it("die Compliance-Rolle darf KEINE Inhalts-/Adminrechte tragen", () => {
    const caps = DECLARED_ROLES[COMPLIANCE_ROLE_KEY]!.capabilities;
    expect(caps).not.toContain("courses:manage");
    expect(caps).not.toContain("users:manage");
  });

  it("jede deklarierte Capability steht in ALL_CAPABILITIES", () => {
    for (const role of Object.values(DECLARED_ROLES)) {
      for (const cap of role.capabilities) {
        expect(ALL_CAPABILITIES).toContain(cap);
      }
    }
  });
});
describe("can", () => {
  it("true, wenn die Capability im Set enthalten ist", () => {
    const caps = new Set<Capability>(["courses:manage"]);
    expect(can(caps, "courses:manage")).toBe(true);
  });

  it("false, wenn die Capability fehlt", () => {
    const caps = new Set<Capability>(["courses:manage"]);
    expect(can(caps, "users:manage")).toBe(false);
  });

  it("false für ein leeres Set", () => {
    expect(can(new Set<Capability>(), "audit:view")).toBe(false);
  });
});

describe("DECLARED_ROLES: admin bleibt Obermenge von curator", () => {
  it("admin enthaelt alles von curator plus users:manage + audit:view", () => {
    const curatorSet = new Set(DECLARED_ROLES.curator!.capabilities);
    const adminSet = new Set(DECLARED_ROLES.admin!.capabilities);
    for (const cap of curatorSet) {
      expect(adminSet.has(cap)).toBe(true);
    }
    expect(adminSet.has("users:manage")).toBe(true);
    expect(adminSet.has("audit:view")).toBe(true);
  });
});

describe("mergeDbCapabilities", () => {
  it("fuegt bekannte Capability-Strings zum Set hinzu", () => {
    const target = new Set<Capability>();
    mergeDbCapabilities(target, ["compliance:view-aggregate"]);
    expect(target).toEqual(new Set<Capability>(["compliance:view-aggregate"]));
  });

  it("ignoriert unbekannte Strings defensiv", () => {
    const target = new Set<Capability>();
    mergeDbCapabilities(target, ["nonsense", "courses:delete-all"]);
    expect(target).toEqual(new Set());
  });

  it("uebernimmt bekannte und verwirft unbekannte bei gemischter Eingabe", () => {
    const target = new Set<Capability>();
    mergeDbCapabilities(target, ["nonsense", "compliance:view-aggregate"]);
    expect(target).toEqual(new Set<Capability>(["compliance:view-aggregate"]));
  });

  it("leeres Array laesst das Set unveraendert", () => {
    const target = new Set<Capability>(["courses:manage"]);
    mergeDbCapabilities(target, []);
    expect(target).toEqual(new Set<Capability>(["courses:manage"]));
  });

  it("Duplikate/bereits vorhandene Eintraege veraendern das Set nicht (Set-Semantik)", () => {
    const target = new Set<Capability>(["courses:manage"]);
    mergeDbCapabilities(target, ["courses:manage", "courses:manage"]);
    expect(target).toEqual(new Set<Capability>(["courses:manage"]));
  });
});
