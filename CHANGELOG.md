# Changelog

Alle nennenswerten Änderungen an FiKnow werden hier festgehalten.

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

> **Release-Konvention:** Der Changelog ist fester Bestandteil jedes
> Semver-Releases. Bei jedem Version-Bump gehören **zusammen**:
> 1. `version` in `package.json` anheben (die Anzeige in `/version` +
>    `/manage`-Footer liest genau dieses Feld),
> 2. hier einen datierten Abschnitt für die neue Version ergänzen (die
>    `[Unreleased]`-Punkte dorthin verschieben),
> 3. einen annotierten Git-Tag `vX.Y.Z` setzen.
>
> Pre-1.0 (Pilotphase): neue Features → Minor-Bump, Fixes/Kleinkram →
> Patch-Bump.

## [Unreleased]

## [0.5.0] – 2026-08-08

### Hinzugefügt
- **Abschlusstest: eingefrorene Fragen-Ziehung + expliziter „Neuer Versuch"**
  (Schema `0013`): der pro Versuch gezogene Fragensatz eines Pool-Abschlusstests
  wird beim ersten Laden eingefroren (`lesson_progress.exam_seed`) — ein Reload
  würfelt die Fragen nicht mehr neu (Bug: nach dem Reshuffle wurden Antworten der
  falschen Frage zugeordnet). Ein Wiederholungsversuch ist jetzt eine bewusste
  Aktion („Neuer Versuch"): sie setzt den Seed zurück und lädt die Seite voll neu
  — sauberer Fragensatz ohne Vermischung neuer Fragen mit alten Antworten. Das
  server-seitige Grading läuft gegen den gespeicherten Seed.
- **Einschreibung und Lernbeginn als getrennte Ereignisse** (Schema `0014`):
  `enrollments` unterscheidet jetzt `enrolled_at` (Einschreibung/Zuweisung) und
  `started_at` (erste geöffnete Lektion, nullable). Das Compliance-„Startdatum"
  liest den tatsächlichen Lernbeginn; eine eingeschriebene, aber noch nicht
  begonnene Teilnahme zeigt „—" statt eines irreführenden Datums. Der Lernbeginn
  wird beim ersten Lektions-Start gesetzt (`markCourseStarted`, erster Start
  gilt), die Draft-Vorschau bleibt ausgenommen. Migration mit Backfill
  (`enrolled_at := started_at` für Bestandszeilen). Beide Zeitpunkte werden im
  Compliance-Nachweis als eigene Spalten ausgewiesen — **Einschreibedatum**
  neben Startdatum, im Dashboard (`/manage/pflichtkurse`) und im CSV-Export.

### Geändert
- **„Kurs verlassen" im Lern-Breadcrumb sichtbar gemacht**: ein führendes
  Haus-Icon (→ Startseite/`/dashboard`) macht den Ausstieg aus einer Lektion
  explizit — vorher war der Weg nur implizit über das Logo.

### Behoben
- **Abschluss von Pflichtkursen konnte bei fehlender Zuweisung verloren gehen**
  (Ordering-Härtung): `syncCourseCompletion` reconcilet die betroffene Person
  jetzt VOR dem Abschluss-Update. Wer eine Lektion erreichte, ohne dass zuvor ein
  Reconcile lief (z. B. Deep-Link direkt nach `/learn/…` ohne Dashboard-/
  Report-Besuch), schloss den Kurs bislang „ins Leere" ab — der Reconciler
  materialisierte die Zuweisung später nur OFFEN und trug den Abschluss nie nach.
  Idempotent und ohne Falsch-Zuweisungen (kein Ziel → kein Nachweis); best-effort,
  ein Reconcile-Fehlschlag blockiert den Abschluss nicht.
- **Startdatum blieb „—" für zugewiesene Teilnehmer:innen**: das Startdatum hing
  zuvor allein an der separaten Einschreibe-Aktion und fehlte damit bei
  Pflichtkursen, in die man nicht per Button „einschreibt". Es entsteht jetzt
  spätestens mit dem tatsächlichen Lernbeginn (siehe Einschreibung/Lernbeginn
  oben).

## [0.4.0] – 2026-08-07

### Hinzugefügt
- **Hierarchisches Rollen-Ziel für Pflichtschulungen** (ADR 0011): Rollen-Ziele
  werden „diese Rolle ODER höher" ausgewertet (`ROLE_RANK` / `roleMeetsTarget`
  in `lib/auth/roles.ts`) — ein `learner`-Ziel erfasst damit auch
  Kurator:innen/Admins. Schließt die Compliance-Lücke, dass erhöhte Rollen die
  Basis-Pflichtschulung nicht zugewiesen bekamen. Grenze: lineares Modell, keine
  gleichrangigen Peer-Rollen (additives Multi-Rollen-Modell zurückgestellt).

### Geändert
- **Compliance-Treiber-Filter als Dropdown** statt Pill-Reihe auf
  `/manage/pflichtkurse` — skaliert mit dem Treiber-Vokabular und ist als
  Filterleiste für weitere Achsen (Land/Status) vorbereitet; weiterhin
  URL-getrieben und ohne JS, mit Theme-tauglichem eigenem Chevron.

### Behoben
- **OIDC-Logout end-to-end** — „Abmelden" blieb auf einer Keycloak-Seite hängen;
  drei gestapelte, prod-relevante Ursachen behoben: (1) CSP `form-action` erlaubt
  nun den Redirect zum Keycloak `end_session_endpoint` (Issuer-Origin aus
  `OIDC_ISSUER`); (2) ein `id_token_hint` (neues, separates httpOnly-Cookie
  `ep_id_token`) überspringt die Keycloak-Bestätigung und lässt
  `post_logout_redirect_uri` greifen; (3) `303 See Other` statt Default-`307`
  sorgt dafür, dass der Browser Keycloak per GET aufruft und die Parameter
  gelesen werden. Logout springt jetzt sauber in die App zurück.

## [0.3.0] – 2026-08-04

### Hinzugefügt
- **Land-Scope aus dem OIDC-Claim** (ADR 0007): Beim Login speist der
  `country`-Claim (Keycloak = Source of Truth) `profiles.land` — überschreibend
  wie die Rolle, aber wie der Anzeigename nur bei vorhandenem Wert (ein
  fehlender Claim nullt kein bestehendes Land). Damit ist die Land-Zuordnung
  nicht mehr nur per CLI pflegbar.
- **Kontrolliertes Land-Vokabular** `DE`/`CH`/`LUX` als Single Source of Truth
  (`lib/land-tokens.ts`): das Authoring-Feld `landScope` ist jetzt ein Select
  (per Postgres-Enum erzwungen statt Freitext), das Rollen-Zuweisungs-CLI
  (`set-role-assignment.ts`) validiert `--land` gegen dasselbe Vokabular, und
  ein unbekanntes `country`-Token wird beim Login geloggt. Verhindert das
  stille „unsichtbare Kurs"-Problem durch Token-Drift zwischen Claim und
  Zielfilter.

## [0.2.0] – 2026-07-31

Erste sprechende Version seit der un-versionierten `0.1.0`-Basis. Ab hier
zeigt der `/manage`-Footer die laufende Version an.

### Hinzugefügt
- **Server-seitig gewerteter Abschlusstest** (`final_exam`): dedizierter
  Prüfungstyp, serverseitig bewertet; Bestehen ist für Pflichtkurse
  verbindlich. Versuchszähler im Nachweis. (ADR 0005 7a/7b)
- **Fragen-Pool & Randomisierung** (ADR 0009): wiederverwendbare Frage-Blöcke
  (`questions/`) mit zentralem Index, deterministisch geseedeter Ziehung pro
  Versuch und server-seitigem Index-Grading. Inline-`<Question>` bleibt
  formativ gültig.
- **Rollen, Rechte & Compliance-Scoping scharf geschaltet** (ADR 0007 P2b–P5a):
  capability-basierte Autorisierung zur Laufzeit, Sicht-Scope nach Land/BU
  (Zeilenfilter gegen die aktuellen Profildaten), PII-freie **Aggregat-Sicht**
  im Compliance-Dashboard (k-Anonymität ≥ 5), append-only **Audit-Log**
  (Authoring-Lifecycle inkl. MCP + Admin-Aktionen), **Rechte-Inspektor** unter
  `/manage/rechte`.
- **Versions-/Build-Anzeige**: `/version`-Endpoint + Versionsanzeige im
  `/manage`-Footer (`lib/app-version.ts`).

### Geändert
- Compliance-Dashboard zweigeteilt in namentliche (scope-gefilterte) und
  anonymisierte Aggregat-Sicht (`compliance:view-named` /
  `compliance:view-aggregate`).

### Behoben
- Quiz: korrekte Antworten wurden teils fälschlich als falsch gewertet —
  `next-mdx-remote` strippte `correct={true}` (Root-Cause-Fix).
- „durchgeklickt = bestanden": Abschluss von Pflichtkursen hängt jetzt am
  bestandenen, server-gewerteten Abschlusstest statt an blossem Durchklicken.
- `/manage`-Layout-Gate capability-basiert korrigiert; Scope-Filter gegen die
  aktuellen `profiles.land/bu` statt gegen den Nachweis-Snapshot.

### Sicherheit
- **Score-Leak-Fix**: Nachweis (`evidence`) ist score-frei — nur „bestanden" +
  Versuchszahl staff-lesbar, Detail-Score bleibt owner-only.
- Offene Dependabot-Alerts geschlossen (überwiegend via `overrides`, ohne
  Breaking-Changes).
- Altlasten entfernt (GoTrue/Supabase-Altreferenzen).

## [0.1.0]

Un-versionierte interne Ausgangsbasis (nie separat getaggt). Kern der Plattform
inkl. MDX-Bundle-Authoring, KI-Tutor + RAG, Katalog/Kurse, Lernpfade,
Pflichtkurse & Compliance-Nachweis, OIDC/Keycloak-Auth, DSG-Retention. Details
siehe `docs/ROADMAP.md` und `docs/adr/`.

[Unreleased]: https://github.com/finnofleet/ff-fiknow/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/finnofleet/ff-fiknow/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/finnofleet/ff-fiknow/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/finnofleet/ff-fiknow/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/finnofleet/ff-fiknow/releases/tag/v0.2.0
