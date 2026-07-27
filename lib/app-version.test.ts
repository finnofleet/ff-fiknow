import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAppVersion } from "./app-version";
import pkg from "@/package.json";

describe("getAppVersion", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.APP_VERSION;
    delete process.env.GIT_COMMIT;
    delete process.env.BUILD_TIME;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("fällt ohne gesetzte Env-Vars auf package.json-Version + 'unknown' zurück", () => {
    expect(getAppVersion()).toEqual({
      version: pkg.version,
      commit: "unknown",
      builtAt: "unknown",
    });
  });

  it("nutzt gesetzte Env-Vars (getrimmt) statt der Defaults", () => {
    process.env.APP_VERSION = " 1.2.3 ";
    process.env.GIT_COMMIT = " abc1234 ";
    process.env.BUILD_TIME = " 2026-07-24T00:00:00Z ";

    expect(getAppVersion()).toEqual({
      version: "1.2.3",
      commit: "abc1234",
      builtAt: "2026-07-24T00:00:00Z",
    });
  });

  it("ignoriert leere/whitespace-only Env-Vars und fällt auf Defaults zurück", () => {
    process.env.APP_VERSION = "   ";
    process.env.GIT_COMMIT = "";

    const result = getAppVersion();
    expect(result.version).toBe(pkg.version);
    expect(result.commit).toBe("unknown");
  });
});
