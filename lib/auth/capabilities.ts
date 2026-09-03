/**
 * Capability-Schicht (ADR 0007, Phase P1 — „Rechte-Achse").
 *
 * Capabilities sind eine **feste, code-durchgesetzte Liste** — analog zu
 * Confluences fixen Berechtigungstypen (View/Edit/Admin). Jede Capability
 * wird irgendwo im Code tatsächlich geprüft/durchgesetzt; sie kann daher
 * NICHT in der UI „erfunden" werden (im Gegensatz zu Rollen, die künftig
 * frei benennbar sind, ADR 0007 §2).
 *
 * `DECLARED_ROLES` ist die **Saat** für die Rollen-Matrix: der
 * Boot-Initializer (`lib/db/initializers/system-roles.ts`) gleicht `roles` +
 * `role_capabilities` daraus ab — inklusive Löschen nicht mehr deklarierter
 * Capabilities, damit auch ein ENTZUG ankommt. Zur Laufzeit gelesen wird
 * ausschliesslich die Matrix (`resolveEffectiveCapabilities`), nie diese
 * Konstante. Eine Änderung hier wirkt also beim nächsten Boot.
 *
 * **Stand: Rechte-Achse abgeschlossen.** Die effektiven Capabilities entstehen
 * zur Laufzeit in `resolveEffectiveCapabilities` als Vereinigung aus dieser
 * Konstante (fuer die Rang-Rolle) und der DB-Matrix (`roles` /
 * `role_capabilities`) fuer die aus dem IdP aufgeloesten Rollen-Keys sowie
 * die personengebundenen `role_assignments`.
 *
 * Diese Konstante bleibt die Quelle fuer die zwei System-Rollen — und zwar
 * ohne DB-Zugriff. Das ist Absicht: `SKIP_MIGRATIONS=true` (dokumentierter
 * Notausstieg, siehe deploy/RUNBOOK.md) und der E2E-Lauf ueberspringen die
 * DB-Initializer, in denen die Matrix befuellt wird. Kaeme das Set der
 * System-Rollen nur aus der Matrix, waere in genau diesen Faellen NIEMAND
 * mehr berechtigt.
 */
/**
 * Feste Liste — jede Capability wird irgendwo im Code durchgesetzt.
 *
 * AUSNAHME `audit:view`: bewusst deklariert, aber NICHT durchgesetzt. Ein
 * Audit-Log-Viewer in der App ist bewusst NICHT gebaut worden — die
 * Protokollierungs-Anforderung ist erfüllt, solange die Daten abfragbar sind
 * (Auszug per SQL, siehe deploy/RUNBOOK.md). Die Capability bleibt als
 * reservierter Platzhalter stehen, weil ADR 0007 §11 sie benennt; wer sie
 * haelt, bekommt heute nichts. Sie zu vergeben ist wirkungslos, nicht
 * gefaehrlich.
 */
export type Capability =
  | "courses:manage"
  | "users:manage"
  | "compliance:view-named"
  | "compliance:view-aggregate"
  | "compliance:export"
  | "audit:view"
  | "reindex:run"
  | "settings:manage";

export const ALL_CAPABILITIES: Capability[] = [
  "courses:manage",
  "users:manage",
  "compliance:view-named",
  "compliance:view-aggregate",
  "compliance:export",
  "audit:view",
  "reindex:run",
  "settings:manage",
];

/**
 * Die *scoped* Capabilities (ADR 0007 §2): laufen ueber entitaets-eigene
 * Daten und werten daher einen Sicht-Scope aus (§3). Alle anderen sind
 * plattformweit und kennen keinen Scope. Genutzt vom Rechte-Inspektor (§8),
 * um je scoped Capability den aufgeloesten Scope anzuzeigen.
 */
export const SCOPED_CAPABILITIES: Capability[] = [
  "compliance:view-named",
  "compliance:view-aggregate",
  "compliance:export",
];

/**
 * Der Keycloak-Gruppen-/Rollenname der Compliance-Rolle. Muss BYTE-IDENTISCH
 * mit der Gruppe im IdP sein — darüber matcht `resolveKnownRoleKeys` die aus
 * dem Token geernteten Keys gegen die Matrix. Bewusst mit Präfix: kurze,
 * generische Namen kollidieren mit Gruppen-Pfadsegmenten fremder Bäume.
 */
export const COMPLIANCE_ROLE_KEY = "finknow-compliance";

/**
 * Die code-deklarierten Rollen und ihre Capabilities — SAAT für die
 * Rollen-Matrix (`lib/db/initializers/system-roles.ts` gleicht sie bei jedem
 * Boot ab, inklusive Entzug). Gelesen wird zur Laufzeit ausschließlich die
 * Matrix, nie diese Konstante.
 *
 * **Trennung Inhalt ↔ Nachweis (BR-Auflage).** `curator` und `admin` tragen
 * KEINE `compliance:*`-Capability mehr: wer Kurse pflegt bzw. die Plattform
 * administriert, sieht damit nicht mehr automatisch die namentlichen
 * Schulungsnachweise aller Mitarbeitenden. Nachweis-Einsicht hängt allein an
 * der eigenen Rolle `finknow-compliance`, die über eine gleichnamige
 * Keycloak-Gruppe vergeben wird — additiv, also „Admin UND Compliance" ist
 * eine Person mit beiden Gruppen.
 *
 * `admin` = `curator` + Nutzerverwaltung + Audit-Log-Einsicht.
 *
 * Offen gelassen: `compliance:export` sitzt hier in derselben Rolle wie die
 * Einsicht. Der CSV-Export ist die Fläche mit der größten Streuung (die Datei
 * verlässt Scope, Protokollierung und Aufbewahrung) — soll er getrennt
 * vergeben werden, wird daraus eine zweite Rolle mit nur dieser Capability.
 */
export type DeclaredRole = {
  /** Anzeigename in Admin-UI und Rechte-Inspektor. */
  label: string;
  description: string;
  capabilities: Capability[];
};

export const DECLARED_ROLES: Record<string, DeclaredRole> = {
  learner: {
    label: "Lernend",
    description:
      "Grundzustand jeder Person mit Zugang — traegt keine Rechte, ist aber " +
      "die Zielgruppe der Basis-Pflichtschulungen.",
    capabilities: [],
  },
  curator: {
    label: "Kurator:in",
    description: "Kann Kurse hochladen und veröffentlichen.",
    capabilities: ["courses:manage", "reindex:run"],
  },
  admin: {
    label: "Admin",
    description:
      "Kann zusätzlich Nutzer:innen verwalten und das Audit-Log einsehen.",
    capabilities: [
      "courses:manage",
      "reindex:run",
      "users:manage",
      "audit:view",
      "settings:manage",
    ],
  },
  [COMPLIANCE_ROLE_KEY]: {
    label: "Compliance-Einsicht",
    description:
      "Darf Schulungsnachweise einsehen und exportieren — getrennt von " +
      "Inhaltspflege und Administration (BR-Auflage).",
    capabilities: [
      "compliance:view-named",
      "compliance:view-aggregate",
      "compliance:export",
    ],
  },
};

/*
 * ENTFALLEN: `capabilitiesForRoleKeys(keys)`.
 *
 * Sie ordnete den Keys `"curator"`/`"admin"` die System-Rollen-Sets zu. Genau
 * das ist der Eskalationspfad, den `resolveKnownRoleKeys`
 * (`lib/auth/role-keys.ts`) bewusst schliesst: `extractRoleKeys` nimmt von
 * Keycloak-Gruppen auch das letzte Pfadsegment auf, eine beliebige Gruppe
 * `/Irgendwas/Admin` ergibt also den Key `admin`. Eine Funktion, die aus
 * einem Key Admin-Rechte macht, waere damit eine offene Falle — deshalb
 * entfernt statt ungenutzt liegengelassen. System-Rollen kommen
 * ausschliesslich ueber `capabilitiesForSystemRole` (Quelle: die vom
 * `OIDC_ROLE_MAP` gemappte Rang-Rolle).
 */

/*
 * ENTFALLEN: `capabilitiesForSystemRole(role)`.
 *
 * Sie leitete die Capabilities der Rang-Rolle code-seitig ab — die zweite
 * Quelle neben der Matrix. Zwei Quellen für dieselbe Aussage können
 * auseinanderlaufen, und weil die effektiven Capabilities eine VEREINIGUNG
 * sind, gewinnt dabei immer die großzügigere: ein Entzug im Code waere
 * wirkungslos geblieben, solange die Matrix-Zeile noch das alte Recht trug.
 * Genau das haette die BR-Auflage (Compliance aus `curator` herauslösen)
 * still ins Leere laufen lassen. Jetzt: `DECLARED_ROLES` ist Saat,
 * die Matrix ist die gelesene Wahrheit, der Boot-Initializer gleicht ab.
 */

/** Prüft, ob ein Capability-Set eine bestimmte Capability enthält. */
export function can(
  caps: ReadonlySet<Capability>,
  cap: Capability,
): boolean {
  return caps.has(cap);
}

/**
 * Fuegt die aus der DB (`role_capabilities.capability`, Freitext-Spalte)
 * gelesenen Capability-Strings zu einem bestehenden Set hinzu — aber NUR,
 * wenn sie zur festen `ALL_CAPABILITIES`-Liste gehoeren. Unbekannte Strings
 * (Tippfehler, kuenftige noch nicht ausgerollte Capabilities) werden ignoriert,
 * damit die DB keine Rechte "erfinden" kann, die der Code nicht durchsetzt
 * (ADR 0007 §2 — Capabilities sind code-fest). Mutiert `target` in place.
 */
export function mergeDbCapabilities(
  target: Set<Capability>,
  dbCapabilities: string[],
): void {
  const known = new Set<string>(ALL_CAPABILITIES);
  for (const c of dbCapabilities) {
    if (known.has(c)) target.add(c as Capability);
  }
}
