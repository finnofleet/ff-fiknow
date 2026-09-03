import { describe, expect, it } from "vitest";

import { isLandToken } from "@/lib/land-tokens";

import { firstClaimValue, parseClaimMap, resolveClaim } from "./claim-gate";

describe("parseClaimMap", () => {
  it("liefert eine leere Map ohne Rohwert", () => {
    expect(parseClaimMap(undefined).size).toBe(0);
    expect(parseClaimMap("").size).toBe(0);
  });

  it("parst mehrere Paare", () => {
    const map = parseClaimMap("ff-de-nord:FFDE,ff-ch-01:FFCH");
    expect(map.size).toBe(2);
    expect(map.get("ff-de-nord")).toBe("FFDE");
    expect(map.get("ff-ch-01")).toBe("FFCH");
  });

  it("lowercased den Key, lässt den Value unangetastet", () => {
    const map = parseClaimMap("FF-DE-Nord:FFDE");
    expect(map.get("ff-de-nord")).toBe("FFDE");
    expect(map.has("FF-DE-Nord")).toBe(false);
  });

  it("trimmt Whitespace um Key und Value", () => {
    const map = parseClaimMap("  ff-de-nord : FFDE  ");
    expect(map.get("ff-de-nord")).toBe("FFDE");
  });

  it("erlaubt n:1 (mehrere Keys auf denselben Wert) — der Merger-Fall", () => {
    const map = parseClaimMap("a:FFDE,b:FFDE");
    expect(map.get("a")).toBe("FFDE");
    expect(map.get("b")).toBe("FFDE");
    expect(map.size).toBe(2);
  });

  it("überspringt fehlerhafte Paare ohne zu werfen", () => {
    const map = parseClaimMap("no-colon,:empty-key,empty-value:,valid:VAL");
    expect(map.size).toBe(1);
    expect(map.get("valid")).toBe("VAL");
  });

  it("splittet nur am ersten Doppelpunkt — ein Value mit Doppelpunkt bleibt erhalten", () => {
    const map = parseClaimMap("key:https://example.com:8080");
    expect(map.get("key")).toBe("https://example.com:8080");
  });
});

describe("firstClaimValue", () => {
  it("liest ein Array-Claim", () => {
    expect(firstClaimValue({ country: ["DE"] }, "country")).toBe("DE");
  });

  it("liest ein skalares String-Claim", () => {
    expect(firstClaimValue({ country: "DE" }, "country")).toBe("DE");
  });

  it("überspringt leere/whitespace Einträge und nimmt den ersten nicht-leeren", () => {
    expect(firstClaimValue({ country: ["", "  ", "DE", "CH"] }, "country")).toBe(
      "DE",
    );
  });

  it("überspringt Nicht-String-Einträge in Arrays", () => {
    expect(firstClaimValue({ country: [42, null, "DE"] }, "country")).toBe(
      "DE",
    );
  });

  it("trimmt den zurückgegebenen Wert", () => {
    expect(firstClaimValue({ country: "  DE  " }, "country")).toBe("DE");
    expect(firstClaimValue({ country: ["  DE  "] }, "country")).toBe("DE");
  });

  it("liefert undefined bei fehlendem Claim", () => {
    expect(firstClaimValue({}, "country")).toBeUndefined();
  });

  it("liefert undefined bei leerem Array", () => {
    expect(firstClaimValue({ country: [] }, "country")).toBeUndefined();
  });

  it("liefert undefined bei leerem String", () => {
    expect(firstClaimValue({ country: "" }, "country")).toBeUndefined();
    expect(firstClaimValue({ country: "   " }, "country")).toBeUndefined();
  });

  it("liefert undefined bei falschem Typ (Zahl, Objekt, null)", () => {
    expect(firstClaimValue({ country: 42 }, "country")).toBeUndefined();
    expect(firstClaimValue({ country: { x: 1 } }, "country")).toBeUndefined();
    expect(firstClaimValue({ country: null }, "country")).toBeUndefined();
  });
});

describe("resolveClaim", () => {
  const EMPTY_MAP: ReadonlyMap<string, string> = new Map();

  it("kein Wert → absent", () => {
    expect(resolveClaim(undefined, EMPTY_MAP)).toEqual({ kind: "absent" });
    expect(resolveClaim("", EMPTY_MAP)).toEqual({ kind: "absent" });
  });

  it("Map-Treffer → mapped, case-insensitiv beim Lookup", () => {
    const map = parseClaimMap("ff-de-nord:FFDE");
    expect(resolveClaim("ff-de-nord", map)).toEqual({
      kind: "mapped",
      value: "FFDE",
    });
    expect(resolveClaim("FF-DE-Nord", map)).toEqual({
      kind: "mapped",
      value: "FFDE",
    });
  });

  it("Map hat Vorrang vor isKnownToken (IdP-Rename übersteuert Vokabular)", () => {
    const map = parseClaimMap("de:CH");
    expect(resolveClaim("de", map, isLandToken)).toEqual({
      kind: "mapped",
      value: "CH",
    });
  });

  it("isKnownToken-Treffer bei leerer Map → mapped (Identität)", () => {
    expect(resolveClaim("DE", EMPTY_MAP, isLandToken)).toEqual({
      kind: "mapped",
      value: "DE",
    });
  });

  it("isKnownToken-Treffer bleibt gültig, auch wenn eine nicht-leere Map den Key nicht auflistet", () => {
    const map = parseClaimMap("ff-de-nord:FFDE");
    expect(resolveClaim("DE", map, isLandToken)).toEqual({
      kind: "mapped",
      value: "DE",
    });
    expect(resolveClaim("LUX", map, isLandToken)).toEqual({
      kind: "mapped",
      value: "LUX",
    });
  });

  it("keine isKnownToken und leere Map → mapped als Pass-Through (Freitext-Achse)", () => {
    expect(resolveClaim("Finnofleet AG", EMPTY_MAP)).toEqual({
      kind: "mapped",
      value: "Finnofleet AG",
    });
  });

  it("keine isKnownToken, nicht-leere Map, Wert nicht gelistet → unmapped (Allowlist)", () => {
    const map = parseClaimMap("finnofleet:FF");
    expect(resolveClaim("other-entity", map)).toEqual({
      kind: "unmapped",
      raw: "other-entity",
    });
  });

  it("isKnownToken gegeben, Wert weder gemappt noch bekannt → unmapped", () => {
    expect(resolveClaim("FR", EMPTY_MAP, isLandToken)).toEqual({
      kind: "unmapped",
      raw: "FR",
    });
  });

  it("unmapped trägt den ORIGINAL-Rohwert (Casing bleibt erhalten)", () => {
    const map = parseClaimMap("de:FFDE");
    expect(resolveClaim("Fr", map, isLandToken)).toEqual({
      kind: "unmapped",
      raw: "Fr",
    });
  });
});
