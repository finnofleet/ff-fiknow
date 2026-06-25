import { describe, expect, it } from "vitest";

import {
  type PathInputRaw,
  validatePathInput,
} from "./validate-path-input";

const KNOWN = ["a2-drohne", "recht-basics", "safety"];

function base(over: Partial<PathInputRaw> = {}): PathInputRaw {
  return {
    slug: "drohnen-einstieg",
    title: "Drohnen-Einstieg",
    fuehrungsgrad: "linear",
    courses: [{ courseSlug: "a2-drohne", role: "required" }],
    ...over,
  };
}

describe("validatePathInput", () => {
  it("akzeptiert gültigen Input und normalisiert", () => {
    const res = validatePathInput(
      base({
        subtitle: "  knapp  ",
        courses: [
          { courseSlug: "a2-drohne", role: "required" },
          { courseSlug: "safety", role: "recommended" },
        ],
      }),
      KNOWN,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.slug).toBe("drohnen-einstieg");
    expect(res.value.subtitle).toBe("knapp"); // getrimmt
    expect(res.value.courses).toHaveLength(2);
  });

  it("lehnt ungültigen Slug ab", () => {
    const res = validatePathInput(base({ slug: "Drohnen Einstieg" }), KNOWN);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.join(" ")).toMatch(/Slug/);
  });

  it("lehnt leeren Titel ab", () => {
    const res = validatePathInput(base({ title: "   " }), KNOWN);
    expect(res.ok).toBe(false);
  });

  it("lehnt ungültigen fuehrungsgrad ab", () => {
    const res = validatePathInput(
      base({ fuehrungsgrad: "streng" as unknown as PathInputRaw["fuehrungsgrad"] }),
      KNOWN,
    );
    expect(res.ok).toBe(false);
  });

  it("lehnt leere Kursliste ab", () => {
    const res = validatePathInput(base({ courses: [] }), KNOWN);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.join(" ")).toMatch(/mindestens einen Kurs/);
  });

  it("meldet unbekannte Kurs-Slugs (Tippfehlerschutz)", () => {
    const res = validatePathInput(
      base({ courses: [{ courseSlug: "a2-drone", role: "required" }] }),
      KNOWN,
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.join(" ")).toMatch(/Unbekannte Kurs-Slugs.*a2-drone/);
  });

  it("dedupliziert doppelte Kurse (erstes Vorkommen gewinnt)", () => {
    const res = validatePathInput(
      base({
        courses: [
          { courseSlug: "a2-drohne", role: "required" },
          { courseSlug: "a2-drohne", role: "optional" },
        ],
      }),
      KNOWN,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.courses).toHaveLength(1);
    expect(res.value.courses[0].role).toBe("required");
  });

  it("lehnt ungültige Rolle ab", () => {
    const res = validatePathInput(
      base({
        courses: [
          { courseSlug: "a2-drohne", role: "kern" as unknown as string },
        ],
      }),
      KNOWN,
    );
    expect(res.ok).toBe(false);
  });
});
