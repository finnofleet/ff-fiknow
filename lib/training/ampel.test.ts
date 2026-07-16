import { describe, expect, it } from "vitest";

import { computeAmpel } from "./ampel";

const NOW = new Date("2026-07-02T12:00:00Z");

describe("computeAmpel", () => {
  it("completedAt gesetzt → erledigt/green, unabhängig von dueDate", () => {
    const r = computeAmpel(
      { completedAt: new Date("2026-01-01T00:00:00Z"), dueDate: null },
      NOW,
    );
    expect(r).toEqual({ status: "erledigt", color: "green", label: "Erledigt" });
  });

  it("completedAt trumpft überfällige dueDate", () => {
    const r = computeAmpel(
      {
        completedAt: new Date("2026-06-01T00:00:00Z"),
        dueDate: new Date("2026-01-01T00:00:00Z"), // längst überfällig
      },
      NOW,
    );
    expect(r.status).toBe("erledigt");
    expect(r.color).toBe("green");
  });

  it("dueDate == null, nicht erledigt → offen/neutral (Toggle-Pflicht ohne Frist)", () => {
    const r = computeAmpel({ completedAt: null, dueDate: null }, NOW);
    expect(r).toEqual({ status: "offen", color: "neutral", label: "Offen" });
  });

  it("dueDate in der Vergangenheit → überfällig/red", () => {
    const r = computeAmpel(
      { completedAt: null, dueDate: new Date("2026-06-01T00:00:00Z") },
      NOW,
    );
    expect(r).toEqual({ status: "ueberfaellig", color: "red", label: "Überfällig" });
  });

  it("dueDate exakt = now → NICHT überfällig (nur <, nicht <=), fällt in Bald-fällig-Fenster", () => {
    const r = computeAmpel({ completedAt: null, dueDate: NOW }, NOW);
    expect(r).toEqual({ status: "faellig_bald", color: "amber", label: "Bald fällig" });
  });

  it("dueDate 1ms in der Vergangenheit → überfällig", () => {
    const dueDate = new Date(NOW.getTime() - 1);
    const r = computeAmpel({ completedAt: null, dueDate }, NOW);
    expect(r.status).toBe("ueberfaellig");
  });

  it("dueDate innerhalb der Default-14-Tage-Grenze → bald fällig/amber", () => {
    const dueDate = new Date("2026-07-10T12:00:00Z"); // +8 Tage
    const r = computeAmpel({ completedAt: null, dueDate }, NOW);
    expect(r).toEqual({ status: "faellig_bald", color: "amber", label: "Bald fällig" });
  });

  it("dueDate exakt = now + soonDays (Default 14) → bald fällig (Grenze inklusive)", () => {
    const dueDate = new Date("2026-07-16T12:00:00Z"); // exakt +14 Tage
    const r = computeAmpel({ completedAt: null, dueDate }, NOW);
    expect(r.status).toBe("faellig_bald");
  });

  it("dueDate 1ms nach now + soonDays → offen/green (außerhalb des Fensters)", () => {
    const dueDate = new Date("2026-07-16T12:00:00.001Z"); // +14 Tage + 1ms
    const r = computeAmpel({ completedAt: null, dueDate }, NOW);
    expect(r).toEqual({ status: "offen", color: "green", label: "Offen" });
  });

  it("dueDate weit in der Zukunft → offen/green", () => {
    const dueDate = new Date("2027-01-01T00:00:00Z");
    const r = computeAmpel({ completedAt: null, dueDate }, NOW);
    expect(r).toEqual({ status: "offen", color: "green", label: "Offen" });
  });

  it("soonDays=0: dueDate exakt = now → bald fällig (Fenster hat Breite 0, Grenze inklusive)", () => {
    const r = computeAmpel(
      { completedAt: null, dueDate: NOW },
      NOW,
      { soonDays: 0 },
    );
    expect(r.status).toBe("faellig_bald");
  });

  it("soonDays=0: dueDate 1ms nach now → offen/green (kein Fenster mehr)", () => {
    const dueDate = new Date(NOW.getTime() + 1);
    const r = computeAmpel({ completedAt: null, dueDate }, NOW, { soonDays: 0 });
    expect(r.status).toBe("offen");
    expect(r.color).toBe("green");
  });

  it("soonDays=0: dueDate 1ms vor now → überfällig", () => {
    const dueDate = new Date(NOW.getTime() - 1);
    const r = computeAmpel({ completedAt: null, dueDate }, NOW, { soonDays: 0 });
    expect(r.status).toBe("ueberfaellig");
  });
});
