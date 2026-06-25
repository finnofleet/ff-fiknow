import { describe, expect, it } from "vitest";

import {
  signSession,
  signTx,
  verifySession,
  verifyTx,
} from "./session";

const SECRET = "test-secret-at-least-16-chars-long";

describe("session cookie (HMAC via WebCrypto)", () => {
  const identity = {
    sub: "11111111-1111-1111-1111-111111111111",
    email: "a@b.ch",
    emailVerified: true,
    name: "Alice",
    role: "curator" as const,
  };

  it("round-trips a valid session", async () => {
    const raw = await signSession(identity, SECRET, 3600);
    const out = await verifySession(raw, SECRET);
    expect(out).toMatchObject({ sub: identity.sub, email: "a@b.ch", role: "curator" });
  });

  it("rejects a tampered payload (role escalation)", async () => {
    const raw = await signSession(identity, SECRET, 3600);
    const [body, sig] = raw.split(".");
    // Body durch ein admin-Payload ersetzen, alte Signatur behalten.
    const forgedBody = Buffer.from(
      JSON.stringify({ ...identity, role: "admin", exp: 9999999999 }),
    ).toString("base64url");
    expect(await verifySession(`${forgedBody}.${sig}`, SECRET)).toBeNull();
    expect(body).not.toBe(forgedBody);
  });

  it("rejects a wrong secret", async () => {
    const raw = await signSession(identity, SECRET, 3600);
    expect(await verifySession(raw, "another-secret-16+chars-xxxxxx")).toBeNull();
  });

  it("rejects an expired session", async () => {
    const raw = await signSession(identity, SECRET, -1);
    expect(await verifySession(raw, SECRET)).toBeNull();
  });

  it("rejects malformed input", async () => {
    expect(await verifySession(undefined, SECRET)).toBeNull();
    expect(await verifySession("", SECRET)).toBeNull();
    expect(await verifySession("no-dot", SECRET)).toBeNull();
    expect(await verifySession(".sigonly", SECRET)).toBeNull();
  });

  it("tx round-trips and carries the secrets", async () => {
    const raw = await signTx(
      { state: "s", nonce: "n", codeVerifier: "v", next: "/dashboard" },
      SECRET,
    );
    const out = await verifyTx(raw, SECRET);
    expect(out).toMatchObject({ state: "s", nonce: "n", codeVerifier: "v", next: "/dashboard" });
  });
});
