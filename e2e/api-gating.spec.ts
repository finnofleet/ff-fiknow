import { expect, test } from "@playwright/test";

/**
 * Verifiziert das App-Session-Gate der Payload-HTTP-API + Media (proxy.ts).
 * Läuft in ZWEI Projekten:
 *   - „anon"    (kein storageState) → erwartet 401
 *   - „curator" (mit Session-Cookie) → erwartet NICHT 401 (Gate lässt durch)
 */
const GATED_PATHS = ["/api/courses", "/api/lessons", "/api/graphql"];

test.describe("Payload-API/Media-Gating (proxy.ts)", () => {
  test("Daten-API + GraphQL: anon 401, eingeloggt durchgelassen", async ({
    request,
  }, testInfo) => {
    const anon = testInfo.project.name === "anon";
    for (const path of GATED_PATHS) {
      const res = await request.get(path);
      if (anon) {
        expect(res.status(), `${path} (anon)`).toBe(401);
      } else {
        expect(res.status(), `${path} (eingeloggt)`).not.toBe(401);
      }
    }
  });

  test("Media: anonym gesperrt (401)", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "anon", "nur im anon-Projekt");
    const res = await request.get("/api/media/file/nonexistent.png");
    expect(res.status()).toBe(401);
  });

  test("Health-Endpoint bleibt anonym erreichbar", async ({
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "anon", "nur im anon-Projekt");
    const res = await request.get("/api/health");
    expect(res.ok(), `health status ${res.status()}`).toBeTruthy();
  });
});
