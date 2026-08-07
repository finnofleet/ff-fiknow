# ADR 0011 — Hierarchisches Rollen-Ziel für Pflichtschulungen

- **Status:** Accepted — implementiert.
- **Datum:** 2026-08-07
- **Kontext-Phase:** Pflichtschulungen / Rollen-Modell
- **Betroffene Bereiche:** `lib/auth/roles.ts` (`ROLE_RANK`, `roleMeetsTarget`),
  `lib/training/reconcile.ts` (`roleTargetUserIds`,
  `resolveRequirementTargetUserIds`).
- **Verwandt:** [[0005-pflichtkurse-und-compliance-nachweis]] (Pflichtschulungen,
  Rollen-Zielgruppe von `training-requirements`), [[0007-mandanten-scoping-und-auswerte-ebenen]]
  (Rollen-/Scope-Modell, `suspended`-Deny-all-Status).

---

## Kontext

Rollen-Ziele von Pflichtschulungen (`training-requirements.target.role`) wurden
bisher **exakt gematcht** (`role === target`). Ein Requirement mit Ziel
`learner` erfasste damit ausschließlich Nutzer:innen mit exakt dieser Rolle —
Kurator:innen und Admins wurden **nicht** erfasst, obwohl sie ebenfalls
`learner`-Funktionen nutzen (Kurse besuchen, Fortschritt tracken) und aus
Compliance-Sicht (z. B. EU AI Act Art. 4, KI-Kompetenz) genauso zur
Basis-Pflichtschulung verpflichtet sind wie alle anderen Mitarbeitenden.

Die Annahme „wer eine höhere Rolle hat, ist implizit auch Lernende:r" war
nirgends explizit im Code festgehalten — sie lebte nur in den Köpfen. Genau an
dieser Lücke entstand ein reales Missverständnis: ein Kurator sah für eine
`learner`-Pflichtschulung keine Zuweisung und hielt sich fälschlich für nicht
betroffen.

## Entscheidung

Rollen-Ziele werden ab sofort **hierarchisch** ausgewertet, über eine
**einzige explizite Quelle**:

- `ROLE_RANK: Record<Role, number>` (`lib/auth/roles.ts`) — legt den linearen
  Rang fest: `suspended: -1`, `learner: 0`, `curator: 1`, `admin: 2`.
- `roleMeetsTarget(userRole, targetRole): boolean` — „diese Rolle ODER höher".
  `suspended` erfüllt grundsätzlich **kein** Rollen-Ziel, unabhängig vom
  numerischen Rang (expliziter Sonderfall, nicht aus dem Rang abgeleitet).

`lib/training/reconcile.ts` (`roleTargetUserIds`,
`resolveRequirementTargetUserIds`) nutzt `roleMeetsTarget` statt exakter
Gleichheit. Ein `learner`-Ziel erfasst damit alle aktiven (nicht gesperrten)
User — unabhängig von Curator-/Admin-Rechten.

## Konsequenzen

**Positiv:**

- Compliance-Lücke geschlossen: ein `learner`-Ziel erreicht wieder alle
  Mitarbeitenden, auch mit erhöhter Rolle.
- Die Hierarchie-Annahme ist jetzt explizit und dokumentiert
  (`ROLE_RANK`/`roleMeetsTarget`) statt implizites Wissen — das genau die Art
  Missverständnis verhindert, die den Anstoß für diese Änderung gab.

**Grenzen / Negativ:**

- Ein **lineares Rang-Modell** kann keine gleichrangigen/orthogonalen Rollen
  ausdrücken — zwei fachliche Peer-Rollen ohne Über-/Unterordnung lassen sich
  damit nicht abbilden.
- Es ist mit diesem Modell nicht mehr möglich, „nur reine Lernende (ohne
  Curator/Admin)" als Zielgruppe zu adressieren — ein `learner`-Ziel schließt
  jetzt immer höhere Rollen ein.
- Sobald Peer-Rollen gebraucht werden, muss auf ein **additives
  Multi-Rollen-Modell** umgestellt werden (Mitgliedschaft in einer
  Rollen-**Menge** statt eines einzelnen Rangs) — ggf. gespeist aus den
  Keycloak-`groups`, die bereits Multi-Membership unterstützen; heute
  kollabiert `mapRole` (`lib/auth/provider/oidc/role-map.ts`) sie auf die
  höchste erreichte Rolle.
- **Tech-Debt:** `lib/auth/provider/oidc/role-map.ts` hält eine zweite,
  private `RANK`-Konstante mit denselben Werten wie `ROLE_RANK`. Sollte später
  auf `ROLE_RANK` konsolidiert werden, um Drift zwischen den beiden Quellen zu
  vermeiden.

## Referenzen

- `lib/auth/roles.ts` (`ROLE_RANK`, `roleMeetsTarget`)
- `lib/auth/roles.test.ts` (Testabdeckung der Rang-Reihenfolge + Zielerfüllung)
- `lib/training/reconcile.ts` (`roleTargetUserIds`,
  `resolveRequirementTargetUserIds`)
- `lib/auth/provider/oidc/role-map.ts` (duplizierte private `RANK`-Konstante,
  Tech-Debt)
- [[0005-pflichtkurse-und-compliance-nachweis]]
- [[0007-mandanten-scoping-und-auswerte-ebenen]]
