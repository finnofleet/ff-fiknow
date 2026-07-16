import { describe, expect, it } from "vitest";

import type { Role } from "@/lib/auth/roles";

import { mapRole } from "./role-map";

const MAP: ReadonlyMap<string, Role> = new Map([
  ["fiknow-curator", "curator"],
  ["fiknow-admin", "admin"],
  ["fiknow-banned", "suspended"],
  ["curators", "curator"], // letztes Gruppen-Segment
]);

const CLIENT = "edu-platform";

describe("mapRole", () => {
  it("defaults to learner without any matching claim", () => {
    expect(mapRole({}, CLIENT, MAP)).toBe("learner");
    expect(mapRole({ realm_access: { roles: ["offline_access"] } }, CLIENT, MAP)).toBe(
      "learner",
    );
  });

  it("maps realm_access.roles", () => {
    expect(
      mapRole({ realm_access: { roles: ["fiknow-curator"] } }, CLIENT, MAP),
    ).toBe("curator");
  });

  it("maps resource_access[client].roles", () => {
    expect(
      mapRole(
        { resource_access: { [CLIENT]: { roles: ["fiknow-admin"] } } },
        CLIENT,
        MAP,
      ),
    ).toBe("admin");
  });

  it("maps groups by full path and last segment", () => {
    expect(mapRole({ groups: ["/FIKNOW/Curators"] }, CLIENT, MAP)).toBe("curator");
  });

  it("is case-insensitive", () => {
    expect(
      mapRole({ realm_access: { roles: ["FIKNOW-Admin"] } }, CLIENT, MAP),
    ).toBe("admin");
  });

  it("picks the highest role when several match", () => {
    expect(
      mapRole(
        { realm_access: { roles: ["fiknow-curator", "fiknow-admin"] } },
        CLIENT,
        MAP,
      ),
    ).toBe("admin");
  });

  it("suspended overrides everything", () => {
    expect(
      mapRole(
        { realm_access: { roles: ["fiknow-admin", "fiknow-banned"] } },
        CLIENT,
        MAP,
      ),
    ).toBe("suspended");
  });

  it("ignores roles for a different client", () => {
    expect(
      mapRole(
        { resource_access: { "other-app": { roles: ["fiknow-admin"] } } },
        CLIENT,
        MAP,
      ),
    ).toBe("learner");
  });

  it("tolerates malformed claim shapes", () => {
    expect(mapRole({ realm_access: "nope", groups: 5 } as never, CLIENT, MAP)).toBe(
      "learner",
    );
  });
});
