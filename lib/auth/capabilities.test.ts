import { describe, expect, it } from "vitest";

import {
  ALL_CAPABILITIES,
  can,
  capabilitiesForLegacyRole,
  capabilitiesForRoleKeys,
  SYSTEM_ROLE_CAPABILITIES,
  type Capability,
} from "./capabilities";

describe("capabilitiesForRoleKeys", () => {
  it("liefert leeres Set für leere Key-Liste", () => {
    expect(capabilitiesForRoleKeys([])).toEqual(new Set());
  });

  it("löst einen bekannten Key auf sein Capability-Set auf", () => {
    const caps = capabilitiesForRoleKeys(["curator"]);
    expect(caps).toEqual(new Set(SYSTEM_ROLE_CAPABILITIES.curator));
  });

  it("bildet die Vereinigung über mehrere bekannte Keys", () => {
    const caps = capabilitiesForRoleKeys(["curator", "admin"]);
    // admin-Set ist eine Obermenge des curator-Sets → Union == admin-Set.
    expect(caps).toEqual(new Set(SYSTEM_ROLE_CAPABILITIES.admin));
  });

  it("ignoriert unbekannte Keys defensiv (kein Throw, keine Caps)", () => {
    const caps = capabilitiesForRoleKeys(["does-not-exist"]);
    expect(caps.size).toBe(0);
  });

  it("mischt bekannte und unbekannte Keys ohne die bekannten zu verlieren", () => {
    const caps = capabilitiesForRoleKeys(["curator", "does-not-exist"]);
    expect(caps).toEqual(new Set(SYSTEM_ROLE_CAPABILITIES.curator));
  });
});

describe("capabilitiesForLegacyRole", () => {
  it("suspended → leeres Set", () => {
    expect(capabilitiesForLegacyRole("suspended")).toEqual(new Set());
  });

  it("learner → leeres Set", () => {
    expect(capabilitiesForLegacyRole("learner")).toEqual(new Set());
  });

  it("curator → curator-Caps", () => {
    expect(capabilitiesForLegacyRole("curator")).toEqual(
      new Set(SYSTEM_ROLE_CAPABILITIES.curator),
    );
  });

  it("admin → admin-Caps", () => {
    expect(capabilitiesForLegacyRole("admin")).toEqual(
      new Set(SYSTEM_ROLE_CAPABILITIES.admin),
    );
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

describe("SYSTEM_ROLE_CAPABILITIES", () => {
  it("admin ist eine Obermenge von curator (curator-Set + users:manage + audit:view)", () => {
    const curatorSet = new Set(SYSTEM_ROLE_CAPABILITIES.curator);
    const adminSet = new Set(SYSTEM_ROLE_CAPABILITIES.admin);
    for (const cap of curatorSet) {
      expect(adminSet.has(cap)).toBe(true);
    }
    expect(adminSet.has("users:manage")).toBe(true);
    expect(adminSet.has("audit:view")).toBe(true);
  });

  it("alle referenzierten Capabilities sind Teil von ALL_CAPABILITIES", () => {
    const all = new Set(ALL_CAPABILITIES);
    for (const cap of SYSTEM_ROLE_CAPABILITIES.curator) {
      expect(all.has(cap)).toBe(true);
    }
    for (const cap of SYSTEM_ROLE_CAPABILITIES.admin) {
      expect(all.has(cap)).toBe(true);
    }
  });
});
