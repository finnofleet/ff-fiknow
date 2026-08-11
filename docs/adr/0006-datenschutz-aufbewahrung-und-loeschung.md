# ADR 0006 — Datenschutz: Aufbewahrung & Löschung

- **Status:** Accepted · **teilweise umgesetzt** (2026-07-24). Leitprinzip +
  Parameter entschieden. **Phase 7a/7b umgesetzt** (Datenklassen, Retention-
  Logik, Purge-Primitive + CLI, RoPA). **Phase 7c — Retention-Cron umgesetzt +
  gegen echtes Postgres verifiziert** (dry-run/apply, nur abgelaufene Klasse-A-
  Zeilen gelöscht, offene/frische behalten, PII-freie Audit-Zeile). **Rollout
  mit dem nächsten Deploy** (K8s-CronJob, default nächtlich). **Noch offen:**
  Phase 7c — Keycloak-Reconcile/Austritts-Trigger (Deprovisionierung), s. u.
- **Datum:** 2026-07-24
- **Kontext-Phase:** Compliance / Datenschutz
- **Betroffene Bereiche:** `profiles`, `enrollments`, `lesson_progress`,
  `quiz_attempts`, `annotations`, `training_assignments` (alle
  `lib/db/schema.ts`); Profil-UI (`app/(frontend)/profile/`); Retention-Cron
  (`lib/privacy/purge-expired.ts`, `scripts/retention-purge.ts`,
  `retention_purge_runs`, `deploy/helm/fiknow/templates/cronjob.yaml` —
  umgesetzt); künftig ein Austritts-Trigger/Keycloak-Reconcile (offen).
- **Verwandt:** [[0005-pflichtkurse-und-compliance-nachweis]], `ROADMAP.md`.

---

## Kontext

Zwei Auslöser trafen zusammen: eine **Betriebsrat-Anfrage** (Mitbestimmung bei
Systemen zur Verhaltens-/Leistungskontrolle, § 87 Abs. 1 Nr. 6 BetrVG) und eine
im Zuge dessen bestätigte **DSG/DSGVO-Lücke**. Ein read-only Daten-Audit über
die Plattform hat Folgendes ergeben:

1. **Es gibt keine funktionierende Konto-Löschung.** Im Profil
   (`app/(frontend)/profile/`) existiert nur Hinweistext; die „Danger-Zone"
   ist totes CSS ohne verdrahteten Lösch-Pfad. Es existiert kein
   Delete-Endpoint.
2. **Keine Kaskaden/Anonymisierung bei Konto-Löschung oder MA-Austritt.** Die
   User-Tracking-Tabellen (`enrollments`, `lesson_progress`, `quiz_attempts`,
   `annotations`, `training_assignments`) referenzieren `userId` bzw.
   `courseSlug` nur **nominell** — es existieren keine DB-Foreign-Keys
   (dokumentiert in `lib/db/schema.ts`). Ein gelöschter Account hinterlässt
   verwaiste Zeilen; nichts räumt automatisch auf.
3. **Ungelöster/undokumentierter Konflikt: append-only Audit-Trail vs. Recht
   auf Löschung.** `training_assignments` (ADR 0005) ist bewusst append-only
   angelegt — genau das kollidiert an der Oberfläche mit Art. 17 DSGVO
   („Recht auf Löschung"). Bislang gibt es dazu keine Position.
4. **Keine Aufbewahrungsfristen, keine automatische Löschung/Anonymisierung,
   kein Austritts-Workflow, kein Cron.** Daten bleiben faktisch für immer
   stehen.

Der Wert dieser ADR ist, ein **Leitprinzip** festzulegen, bevor Einzelteile
gebaut werden — nicht, alle Detailfragen (Fristen, Rechtsgrundlage,
Austritts-Signal) selbst zu entscheiden. Diese bleiben ausdrücklich offen und
sind mit dem Datenschutzbeauftragten/Recht zu klären (siehe unten).

## Entscheidung

### Leitprinzip: zwei Datenklassen

- **Klasse (A) — Nachweis-relevant.** `training_assignments`. Aufbewahrung zu
  Rechenschafts-/Verteidigungszwecken: Rechtsgrundlage **Art. 6 Abs. 1 lit. f
  DSGVO** (berechtigtes Interesse: Rechenschaft nach Art. 5 Abs. 2 +
  Verteidigung möglicher Ansprüche) i. V. m. **Art. 17 Abs. 3 lit. e DSGVO**
  (Löschrecht greift nicht, soweit zur Geltendmachung/Verteidigung von
  Rechtsansprüchen nötig). *Nicht* lit. b — Art. 4 EU AI Act schreibt keine
  statutarische Aufbewahrungsfrist vor. Diese Zeilen werden bei
  Konto-Löschung/Austritt **nicht sofort gelöscht**, sondern für die
  Aufbewahrungsfrist (siehe „Entschieden" unten) vorgehalten und erst danach
  gelöscht.
- **Klasse (B) — nicht nachweispflichtig.** `lesson_progress`,
  `quiz_attempts`, `annotations`, `enrollments`, `profiles`. Diese Daten sind
  bei Austritt oder auf Verlangen **löschbar bzw. anonymisierbar** — es gibt
  keinen rechtlichen Grund, sie vorzuhalten.

### Löschstrategie

- **Konto-Löschung/Austritt:** Hard-Delete der Klasse (B) über alle Tabellen,
  gejoint über `userId`.
- **Klasse (A):** bis Fristablauf vorhalten (Verarbeitung ggf. eingeschränkt,
  keine neue Nutzung), danach löschen.

**Wichtig — Verhältnis zu append-only (ADR 0005):** Append-only ist eine
**Schreibdisziplin für den Normalbetrieb** — sie verbietet, `completedAt`
rückwirkend zu überschreiben oder Zeilen willkürlich zu löschen, damit der
Nachweis als Audit-Trail belastbar bleibt. Sie ist **keine absolute
Löschsperre**. Eine kontrollierte, protokollierte Lifecycle-Löschung
(Fristablauf) oder eine rechtlich erzwungene Löschung (bestätigter
Löschanspruch, der das Aufbewahrungsinteresse aus Art. 6 Abs. 1 lit. f /
Art. 17 Abs. 3 lit. e DSGVO nicht mehr trägt) ist ein **separater, auditierter
Vorgang** — nicht der
Normalbetrieb, den die append-only-Regel schützen soll. Beide Prinzipien
stehen damit nicht im Widerspruch: append-only verhindert stille, beiläufige
Manipulation des Nachweises; Retention-Löschung ist eine bewusste,
nachvollziehbare Ausnahme mit eigenem Prozess. Das ist der Kern der Auflösung
dieser ADR.

### Identität (Keycloak) vs. App-Daten (lokal) — zwei getrennte Löschungen

Seit der OIDC/Keycloak-Umstellung ist **Keycloak** der Identity-Provider und die
Wahrheit über die Person (Login, Credentials, Name, E-Mail). Löschung zerfällt
daher in zwei Ebenen, die sich **nicht ersetzen**:

- **Identität → Keycloak/HR.** Das „diese Person existiert nicht mehr" gehört in
  den IdP — im Enterprise-Setup typischerweise zentral über HR/IT beim
  MA-Austritt. Kein Self-Service in FinKnow (die Profil-Seite verweist bereits auf
  die zentrale SSO-Verwaltung).
- **App-Daten → lokal in FinKnow.** Keycloak kennt FinKnows Postgres nicht — es
  gibt keine Foreign Keys, keine Kaskade, kein automatisches Signal. Eine Löschung
  in Keycloak räumt lokal **nichts** auf; die Zeilen (Klasse A und B) blieben
  verwaist stehen. Die lokale Lösch-/Anonymisierungslogik muss deshalb
  **unabhängig** gebaut werden (Phase 7b) — auch für DSGVO-Löschbegehren
  (Art. 17), deren Erfüllung beide Stores braucht.

Zwischen beiden Ebenen braucht es eine **Brücke** — den Austritts-Trigger, der
aus dem Identitäts-Lebenszyklus die lokale Bereinigung auslöst (Phase 7c).
Self-Service-„Konto löschen" ist im SSO-Kontext nicht das Modell; die lokale
Löschung ist ein admin-/trigger-ausgelöster, auditierter Datenpurge.

### Entschieden (2026-07-24) — restriktivste Auslegung, EU/DSGVO

Grundsatz (mit Yves festgelegt): **die restriktivste, maximal datensparsame
Auslegung** — kürzeste vertretbare Aufbewahrung, früheste Löschung. Die Lösung
ist **im EU-Raum gehostet**, damit ist **DSGVO/EU** die maßgebliche Ordnung; der
lange Schweizer Anker (Art. 127 OR, bis 10 Jahre) wird bewusst **nicht**
herangezogen.

- **Governing law:** DSGVO/EU.
- **Klasse (B):** Löschung bei Austritt/auf Verlangen, **keine** Vorhaltung.
- **Klasse (A) — Aufbewahrungsfrist:** kürzeste vertretbare = regelmäßige
  Verjährung nach **§ 195/§ 199 BGB (3 Jahre, ab Ende des Entstehungsjahres)**,
  danach **Hard-Delete**. Kein Puffer. Technisch als **konfigurierbarer Wert**,
  nicht hartkodiert.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. f + Art. 17 Abs. 3 lit. e DSGVO
  (siehe Leitprinzip oben).
- **Auslöse-Mechanismus:** nächtlicher Keycloak-Reconcile (Phase 7c) —
  Engineering-Entscheidung; optional später zusätzlich ein Webhook.

**Einziger verbleibender DSB-Check:** die absoluten Höchstfristen nach
**§ 199 Abs. 3/4 BGB** (10/30 Jahre, kenntnisunabhängig) für Sonderfälle — bei
striktem 3-Jahres-Löschen könnten seltene Spätansprüche nicht mehr belegbar
sein. Das ist der bewusste Tradeoff der restriktiven Wahl; der DSB nimmt die
finale Frist (Default 3 Jahre) formal ab.

## Umsetzung in Phasen

- **Phase 7a — Datenklassen + Retention-Policy + RoPA. ✓ umgesetzt.**
  Klassifikation (A/B) codifiziert (`lib/privacy/data-classes.ts`), Frist-Logik
  (`lib/privacy/retention.ts`, `FIKNOW_RETENTION_YEARS` Default 3),
  Verzeichnis der Verarbeitungstätigkeiten (`docs/ROPA-finknow.md`).
- **Phase 7b — Löschung Klasse (B) + Purge-Primitive. ✓ umgesetzt.**
  `purgeUserData(userId)` (`lib/privacy/purge-user.ts`) löscht Klasse (B) über
  alle Tabellen per `userId` + offene Assignments in einer Transaktion; Admin-
  CLI `scripts/purge-user.ts` (dry-run default, `--confirm`). *(Die
  „Danger-Zone"-Self-Service-UI ist bewusst nicht Teil davon — im SSO-Kontext
  ist Löschung admin-/trigger-ausgelöst, s. „Identität vs. App-Daten".)*
- **Phase 7c (Teil 1) — Retention-Cron. ✓ umgesetzt + verifiziert (2026-07-24).**
  `purgeExpiredNachweise` (`lib/privacy/purge-expired.ts`) löscht abgeschlossene
  `training_assignments`, deren Frist abgelaufen ist (`completed_at <= now −
  FIKNOW_RETENTION_YEARS`); offene Zeilen (`completed_at IS NULL`) werden nie
  angefasst. CLI `scripts/retention-purge.ts` (dry-run default, `--confirm`;
  `RETENTION_PURGE_DRY_RUN=1` erzwingt dry-run). Jeder Lauf schreibt eine
  PII-freie Audit-Zeile in `retention_purge_runs` (Cutoff, Frist, Anzahl,
  dry-run-Flag) — DSGVO-Rechenschaftspflicht. Läuft als **K8s-CronJob**
  (`deploy/helm/fiknow/templates/cronjob.yaml`, ephemerer Pod pro Lauf, gleiches
  Image), Payload-agnostisch. Integrationstest gegen echtes Postgres bestanden.
  **Hinweis:** löscht bis ~2029 real 0 Zeilen (App erst seit 2026) — der Lauf
  validiert bis dahin nur den Mechanismus. **Bewusste Konsequenz der
  restriktiven Wahl:** gelöscht wird fristabhängig, **unabhängig vom
  Beschäftigungsstatus** — auch Einmal-Nachweise noch aktiver Personen fallen
  nach 3 J weg.
- **Phase 7c (Teil 2) — Austritts-Trigger / Keycloak-Reconcile. ⏳ offen.**
  Verbindet die Identitäts- mit der App-Daten-Ebene. **Mechanismus: nächtlicher
  Keycloak-Reconcile (Pull),**
  nicht Webhook-Push — passt zum bestehenden Reconciler-Muster (ADR 0005), ist
  selbstheilend und braucht keinen eingehenden Endpoint. Ablauf: Job holt via
  Keycloak Admin REST API (`GET /admin/realms/{realm}/users`, Service-Account mit
  `view-users`) die User-Liste; `userId`s, die lokal in `profiles` existieren,
  aber in Keycloak fehlen, gelten als deprovisioniert. Statt sofort zu löschen:
  **Confirmation-Count-Soft-Delete** — Kandidat vormerken
  (`deletionCandidateSince`, `keycloakMissCount`), pro bestätigtem Miss
  hochzählen, bei Wiederauftauchen auf 0 zurücksetzen, erst ab `missCount >= 5`
  tatsächlich purgen (Klasse B) + Retention-Uhr Klasse A starten. **Guardrails
  (zwingend, sonst löscht man versehentlich):** (1) nur **erfolgreiche,
  vollständige** Pulls zählen — fehlgeschlagen/leer/partiell wird übersprungen,
  zählt nicht und setzt nicht zurück; (2) **Mass-Vanish-Circuit-Breaker** — fehlt
  in einem Lauf ein großer Anteil der User (z. B. >10–20 % ggü. Vorlauf),
  abbrechen + alerten (fast sicher API-/Realm-Problem, kein Massenaustritt);
  (3) `enabled: false` ≠ gelöscht (kein Trigger); (4) Alerting bei Vormerkung +
  Purge. Nebeneffekt: derselbe Diff räumt verwaiste Altdaten mit auf. Braucht
  zusätzlich neue `profiles`-Spalten (`deletionCandidateSince`,
  `keycloakMissCount`) + einen Keycloak-Service-Account mit `view-users`.
  *Die Cron/Job-Infrastruktur (K8s-CronJob) steht jetzt durch Teil 1 — dieser
  Reconcile ist ein weiterer CronJob nach demselben Muster. Offene
  Vorbedingung ist nur noch der Service-Account. Optional später: zusätzlicher
  Webhook für geringere Latenz.*

## Konsequenzen / Hinweise

- **Verwandter, aber separater Befund (hier nur Querverweis, nicht gelöst):**
  Laut Audit sind die DB-RLS-Policies zur Laufzeit faktisch wirkungslos — die
  App nutzt einen einzigen voll-privilegierten Connection-Pool und setzt keine
  SSO-Claims; Zugriffskontrolle läuft ausschließlich über App-Code.
  Defense-in-Depth fehlt damit auf DB-Ebene. Das ist ein eigener
  Härtungs-Fix, **vor Ableitung weiterer Schlüsse aus den RLS-Policies zu
  verifizieren** — hier nicht adressiert.
- **Restlücke bis zum nächsten Deploy + bis 7c-Teil-2:** 7a/7b und der
  Retention-Cron (7c-Teil-1) sind gebaut/verifiziert, greifen produktiv aber
  erst mit dem nächsten Rollout. Die **automatische Deprovisionierung bei
  Austritt** (7c-Teil-2, Keycloak-Reconcile) fehlt weiterhin — bis dahin wird
  Klasse (B) nur admin-getriggert per `scripts/purge-user.ts` gelöscht, nicht
  automatisch beim Austritt.
