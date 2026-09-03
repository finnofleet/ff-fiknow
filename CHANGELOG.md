# Changelog

Alle nennenswerten Änderungen an FinKnow werden hier festgehalten.

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

## [0.7.0] – 2026-09-03

### Hinzugefügt
- **Scope-Achse Rechtseinheit (`bu`) aus dem OIDC-Token** (ADR 0007 §3): ein
  konfigurierbarer Claim (`OIDC_ENTITY_CLAIM`) füllt `profiles.bu` beim
  Login analog zur bestehenden `land`-Achse; ungesetzt bleibt `profiles.bu`
  wie bisher unberührt. Neu ist ein **Claim-Gate**
  (`lib/auth/provider/oidc/claim-gate.ts`), das jetzt auch vor `land` sitzt:
  nur ein auflösbarer Claim-Wert wird geschrieben, ein unbekannter wird als
  `[oidc-claims]`-Warnung geloggt (mit Rohwert) statt roh übernommen — ein
  IdP-Rename kann damit nie mehr still einen korrekten Wert überschreiben. Ein
  fehlender Claim nullt nie einen bestehenden Wert. `OIDC_ENTITY_MAP` /
  `OIDC_LAND_MAP` erlauben n:1-Mappings (mehrere IdP-Werte → ein App-Token) —
  das ist der Mechanismus, mit dem der anstehende Merger (viele heutige
  Rechtseinheiten laufen bis Ende 2027 zu FINNOFLEET Deutschland/Schweiz/
  Luxemburg zusammen) app-seitig per Env-Var-Tausch statt IdP-Umbau
  abgefangen wird.
- **Datenqualitäts-Hinweis „Unvollständige Zuordnung" im Compliance-
  Dashboard** (`/manage/pflichtkurse`): der Scope-Filter ist strikt — eine
  Person mit unaufgelöstem `land`/`bu` fällt lautlos aus jeder scoped
  Auswertung heraus, ohne dass die Erfüllungsquote das anzeigt. Eine neue
  Kennzahl (`lib/training/entity-coverage.ts`, bezogen auf Personen mit
  mindestens einer Pflichtzuweisung) macht diese Lücke jetzt sichtbar, statt
  sie erst bei einem Audit auffallen zu lassen; bewusst getrennt von der
  k-anonymisierten Aggregat-Sicht, wo kleine Buckets sonst unterdrückt
  würden.
- **Rechte-Achse jetzt end-to-end aus dem IdP verdrahtet** (ADR 0007 §2):
  bisher wertete nur die eine, per linearem Rang aus `OIDC_ROLE_MAP`
  kollabierte `profiles.role` etwas aus — die Rollen-Matrix
  (`roles`/`role_capabilities`) war seit ihrer Einführung nur für
  Admin-manuelle `role_assignments` lebendig, nie für die vom IdP
  gelieferten Rollen/Gruppen selbst. Keycloak schickt aber alle Rollen einer
  Person, nicht nur eine — orthogonale Kombinationen („Admin UND
  Compliance-Einsicht") waren dadurch nicht ausdrückbar. Jetzt werden beim
  Login **alle** Rollen-Keys einer Person gegen die Matrix aufgelöst
  (`lib/auth/role-keys.ts`, `resolveKnownRoleKeys`) und in der neuen Spalte
  `profiles.role_keys` persistiert (`drizzle/0015_flashy_trauma.sql`,
  `provisionProfile` in `lib/auth/provider/oidc/index.ts`). Die effektiven
  Capabilities (`lib/auth/effective-capabilities.ts`,
  `resolveEffectiveCapabilities`) sind jetzt eine Vereinigung aus drei
  Quellen statt einer: Rang-Rolle (code-seitiger Boden, fail-safe bei
  DB-Ausfall) ∪ Matrix-Capabilities für die IdP-Keys ∪ persönliche
  `role_assignments`. Gelesen wird `role_keys` frisch pro Request (nicht aus
  dem Session-Cookie) — dieselbe `liveRole`-Eigenschaft wie bisher, ein
  Rechte-Entzug greift also sofort. **Bewusst System-Rollen
  (`roles.isSystem`) ausgeschlossen** aus diesem Pfad: da
  `extractRoleKeys` auch das letzte Pfadsegment von Keycloak-Gruppenpfaden
  aufnimmt, würde sonst z. B. eine beliebige Gruppe `/Irgendwas/Admin` auf
  die System-Rolle `admin` matchen und volle Admin-Rechte verleihen —
  `curator`/`admin` kommen deshalb weiterhin ausschließlich über das
  explizite `OIDC_ROLE_MAP`. **Rein additiv:** bestehende curator-/
  admin-Rechte ändern sich nicht. Der Rechte-Inspektor (`/manage/rechte`)
  zeigt neu die aufgelösten IdP-Rollen-Keys, damit ein Admin verifizieren
  kann, dass eine Keycloak-Gruppe tatsächlich angekommen ist. Um eine
  Keycloak-Gruppe anzubinden, genügt jetzt eine (Nicht-System-)Rolle in der
  Matrix mit passendem `key` — kein zusätzliches Env-Mapping nötig.
- **Rechte-Achse abgeschlossen: ein Rollen-Modell, eine Quelle** (ADR 0007
  §2). Laufzeit-Capabilities kommen jetzt ausschließlich aus der
  `roles`/`role_capabilities`-Matrix; `DECLARED_ROLES` (Code) ist nur noch
  SEED dafür — der Boot-Initializer (`lib/db/initializers/system-roles.ts`)
  gleicht die Matrix bei jedem Start daraus ab, inklusive **Löschen** nicht
  mehr deklarierter Capabilities, damit ein Entzug im Code auch wirklich
  ankommt. Als zweite Quellen/Fallen entfernt: `capabilitiesForSystemRole`,
  `capabilitiesForRoleKeys` sowie die Wrapper `canSeeAdmin` /
  `canManageCourses` / `canManageUsers` — alle 20 Gates in 13 Dateien prüfen
  jetzt einheitlich `can(caps, …)` gegen `resolveEffectiveCapabilities`.
  `profiles.role_keys` hält die vollständige Rollen-Menge einer Person,
  zusammengesetzt beim Login (`completeRoleKeys`): der impliziten `learner`,
  den jedes aktive Konto trägt, die Rang-Rolle aus `OIDC_ROLE_MAP`, die eine
  tatsächlich geltende Implikation `admin ⇒ curator`, plus die aus
  Keycloak-Gruppen gematchten Rollen. Ein `suspended`-Konto erhält eine
  LEERE Menge — keine Rechte, kein Pflichtschulungs-Ziel. Eskalationsschutz
  bleibt bestehen: aus Gruppenpfaden geerntete Keys können nie einer der vier
  Rang-Rollennamen sein, die kommen ausschließlich über das explizite
  `OIDC_ROLE_MAP`.
- **Inhalt und Nachweis getrennt — Betriebsrats-Auflage** (ADR 0007 §2):
  `curator` (Kurse pflegen) und `admin` (zusätzlich Nutzerverwaltung +
  Audit-Log) tragen keine einzige `compliance:*`-Capability mehr. Wer
  Schulungsnachweise sehen und exportieren darf
  (`compliance:view-named`/`-aggregate`/`-export`), braucht jetzt zusätzlich
  die eigene Rolle `finknow-compliance` — vergeben über eine **gleichnamige
  Keycloak-Gruppe** (muss byte-identisch angelegt werden, sonst matcht
  `resolveKnownRoleKeys` nicht). Weil Capabilities additiv sind, ist „Admin
  UND Compliance" schlicht eine Person in beiden Gruppen. Ein Regressionstest
  hält fest, dass weder `curator` noch `admin` je wieder eine
  `compliance:*`-Capability tragen.
- **`ROLE_RANK`/`roleMeetsTarget` entfallen — ADR 0011 durch Mengen-
  Zugehörigkeit abgelöst.** Pflichtschulungs-Ziele (`roleTargetUserIds` in
  `lib/training/reconcile.ts`) werten jetzt aus, ob der Ziel-Key in
  `profiles.role_keys` steckt, statt einen numerischen Rang zu vergleichen
  („diese Rolle ODER höher"). Die fachliche Aussage von ADR 0011 bleibt
  exakt erhalten (jede aktive Person trägt `learner`, ein Admin zusätzlich
  `curator`) — nur als Daten statt als totale Ordnung, die orthogonale
  Rollen (Compliance ist weder über noch unter Administration) nicht
  ausdrücken konnte. `RANK` in `lib/auth/provider/oidc/role-map.ts` bleibt
  bestehen, ist aber keine Rechte-Hierarchie mehr — nur noch die Auswahl des
  einen Werts für die Spalte `profiles.role`.
- **Zwei neue Boot-Initializer** (`lib/db/initializers/`): `system-roles`
  (siehe oben, gleicht die Matrix ab) und `backfill-role-keys` (füllt
  `profiles.role_keys` für Bestandsprofile aus deren Rang-Rolle nach — ohne
  Backfill würde jede Person, die seit dem Deploy nicht eingeloggt war, still
  aus der Pflichtschulungs-Zuweisung herausfallen).
- **`SKIP_MIGRATIONS` von der Initialisierung getrennt**: `SKIP_MIGRATIONS`
  betrifft jetzt nur noch das Schema, ein neues `SKIP_DB_INIT` nur noch die
  Initializer. `SKIP_DB_INIT=true` bedeutet damit: niemand hält irgendeine
  Berechtigung — es gibt keinen code-seitigen Fallback mehr.
- **Neue Audit-Actions `role.key-added`/`role.key-removed`**: protokollieren
  beim Login die BEOBACHTETE Änderung der Rollen-Menge einer Person (ein
  Eintrag je geänderter Key, nur bei tatsächlicher Änderung). Behauptet
  bewusst NICHT, wer die Rolle vergeben hat — das sieht diese App nur als
  Ergebnis in den Claims, nicht als Vorgang im IdP. Die Rechenschaftsspur
  „wer hat zugewiesen" liegt in den **Keycloak-Admin-Events**, da Keycloak
  das führende System für Rollen ist.

- **Policy-Einstellungen in der Datenbank statt in Env-Vars, mit Admin-UI**
  (`/manage/einstellungen`, Capability `settings:manage`): fachliche
  Richtwerte, die eine Fachrolle besitzt und ohne Auslieferung ändern können
  soll, liegen jetzt in der Tabelle `settings` — erste und bislang einzige
  Einstellung ist die **Aufbewahrungsfrist der Nachweise**, die der
  Datenschutzbeauftragte damit selbst abnehmen kann. Auflösung DB → Env →
  Default, und das UI zeigt an, aus welcher Quelle der wirksame Wert
  tatsächlich stammt. `FINKNOW_RETENTION_YEARS` bleibt als Fallback gültig.
  **Der eigentliche Grund für die DB:** jede Änderung schreibt eine
  Audit-Zeile (`setting.changed`) mit handelnder Person und Zeitpunkt — eine
  Frist per Env-Var zu verkürzen wäre nur in der Cluster-Konfiguration
  sichtbar. Der Schlüsselraum ist code-fest (`lib/settings/registry.ts`,
  analog `ALL_CAPABILITIES`): ein Fremdeintrag in der Tabelle bleibt
  wirkungslos, und es wird bewusst nur deklariert, was der Code auch
  auswertet. Deployment- und Integrationswerte (`SKIP_MIGRATIONS`,
  `SKIP_DB_INIT`, `OIDC_*`, Secrets) bleiben Env-Vars — sie werden gebraucht,
  bevor die DB nutzbar ist, oder unterscheiden sich je Umgebung.

### Behoben
- **`compliance:export` war nie gescoped** — die Export-Route prüfte zwar die
  Capability `compliance:export`, löste danach aber den Scope von
  `compliance:view-named` auf; da `resolveViewerScope` bei null Treffern
  `unrestricted` liefert, hätte eine auf eine Gesellschaft gescopte Rolle mit
  nur `compliance:export` den CSV-Export über ALLE Gesellschaften gezogen —
  fail-open genau in der Richtung, die das Scoping verhindern soll. Wird
  scharf, sobald gescopte Rollen vergeben werden.
- **Rohe Error-Objekte im Log** — mehrere Handler gaben Fehlerobjekte direkt
  an `console.error`; Postgres-Fehler führen ein `detail`-Feld, das
  Schlüsselwerte (z. B. User-UUIDs) enthalten kann. Jetzt laufen alle
  betroffenen Stellen (24 Call-Sites, 20 Dateien) durch `redactError`
  (`lib/log-redact.ts`).

## [0.6.0] – 2026-08-18

### Geändert
- **Rebrand FIKNOW → FINKNOW** — der Produktname wurde durchgängig umgestellt:
  Anzeigename (`brand/brand.yaml`), neu gezeichnete Wortmarke
  (`brand/assets/logo.svg`, zusätzliches „N" ins Logogramm), Repo-/Doku-
  Identität (GitHub-Repo `ff-fiknow` → `ff-finknow`, Paketname) und der
  technische Infra-Slug `fiknow` → `finknow` (Keycloak-Realm/-Rollen/-Gruppen,
  Postgres-DB, Helm-Chart + `finknow.*`-Templates, Image `ghcr.io/finnofleet/
  ff-finknow`, OIDC-Issuer/`OIDC_ROLE_MAP`). Env-Var `FIKNOW_RETENTION_YEARS`
  → `FINKNOW_RETENTION_YEARS`. **Bewusst unverändert:** PVC `fiknow-data` +
  StorageClass `ibmc-vpc-file-fiknow-1001` (deployter Hintergrund-Storage, kein
  Nutzer-Kontakt). Die Ring-3-Infra-Migration wurde von der internen IT
  umgesetzt; das getestete Migrations-Script + Runbook liegen unter
  `deploy/ring3-rename/`.
- **Helm-Chart-Version an die App-Version gekoppelt** — Chart-`version`,
  `appVersion` und der Image-Tag werden beim Release aus dem Git-Tag `vX.Y.Z`
  gestempelt (CI publiziert das Chart nur noch auf Tags); vorher stand die
  Chart-Version still und wurde bei jedem Push überschrieben. Bei der
  Installation ist damit eindeutig, welches Chart zu welchem App-Stand gehört.

### Behoben
- **Marken-Diskriminator lud die Bild-Style-Doku ins Leere** — `brandKey()`
  gab nach dem Datei-Rename weiter `"FIKNOW"` zurück und verfehlte damit
  `BRAND-IMAGE-STYLE-FINKNOW.md` (stiller Fallback); jetzt korrekt `"FINKNOW"`.

## [0.5.1] – 2026-08-10

### Sicherheit
- **17 Dependabot-Alerts über Override-/Dependency-Bumps geschlossen** — alle
  transitiv, kein First-Party-Code betroffen: `undici` 7.28.0 → 7.29.0 (5
  Alerts), `hono` → 4.12.34+ (4), `js-yaml` → 4.3.1 / 3.15.1 (2), `ip-address`
  → 10.3.1+ (3), `fast-uri` → 3.1.5, `nanoid` → 3.3.17+, `dompurify` → 3.4.13.
  Überwiegend ReDoS/DoS- sowie Header-/Cookie-Injection-Fixes. Build + 292
  Unit-Tests grün nach dem Lockfile-Update.
- **Bewusst offen (2 Alerts):** `image-size` (High — DoS via ICNS/JXL/HEIF-
  Parser-Endlosschleife) hat noch KEINEN Upstream-Patch; Angriffsfläche gering,
  da Media-Upload `editorsOnly` (Kurator:innen/Admins) + Upload-Sanitisierung
  (Magic-Bytes + Raster-Re-Encode) — Monitoring bis zum Fix. `@hono/node-server`
  #51 (Medium — `serve-static` Path-Traversal, nur unter Windows) bleibt offen:
  der Fix erfordert einen MCP-inkompatiblen Major-Bump, und es gibt kein
  Windows-Deployment.

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

[Unreleased]: https://github.com/finnofleet/ff-finknow/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/finnofleet/ff-finknow/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/finnofleet/ff-finknow/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/finnofleet/ff-finknow/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/finnofleet/ff-finknow/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/finnofleet/ff-finknow/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/finnofleet/ff-finknow/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/finnofleet/ff-finknow/releases/tag/v0.2.0
