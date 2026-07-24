# ADR 0006 — Datenschutz: Aufbewahrung & Löschung

- **Status:** Proposed / Geplant — **nicht implementiert**. Dies ist ein Plan,
  kein ausgeliefertes Feature.
- **Datum:** 2026-07-24
- **Kontext-Phase:** Compliance / Datenschutz
- **Betroffene Bereiche:** `profiles`, `enrollments`, `lesson_progress`,
  `quiz_attempts`, `annotations`, `training_assignments` (alle
  `lib/db/schema.ts`); Profil-UI (`app/(frontend)/profile/`); künftig ein
  Austritts-Trigger und ein Retention-Cron (noch nicht gebaut).
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

- **Klasse (A) — Nachweis-relevant.** `training_assignments`. Unterliegt einer
  Aufbewahrungspflicht: Rechtsgrundlage **Art. 17 Abs. 3 lit. b DSGVO**
  (Aufbewahrung zur Erfüllung einer rechtlichen Pflicht — hier der
  EU-AI-Act-Nachweispflicht aus Art. 4, siehe ADR 0005). Diese Zeilen werden
  bei Konto-Löschung/Austritt **nicht sofort gelöscht**, sondern für eine
  definierte Frist vorgehalten und erst danach gelöscht.
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
Löschanspruch, der die Aufbewahrungspflicht aus Art. 17 Abs. 3 lit. b DSGVO
nicht mehr trägt) ist ein **separater, auditierter Vorgang** — nicht der
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
  MA-Austritt. Kein Self-Service in FiKnow (die Profil-Seite verweist bereits auf
  die zentrale SSO-Verwaltung).
- **App-Daten → lokal in FiKnow.** Keycloak kennt FiKnows Postgres nicht — es
  gibt keine Foreign Keys, keine Kaskade, kein automatisches Signal. Eine Löschung
  in Keycloak räumt lokal **nichts** auf; die Zeilen (Klasse A und B) blieben
  verwaist stehen. Die lokale Lösch-/Anonymisierungslogik muss deshalb
  **unabhängig** gebaut werden (Phase 7b) — auch für DSGVO-Löschbegehren
  (Art. 17), deren Erfüllung beide Stores braucht.

Zwischen beiden Ebenen braucht es eine **Brücke** — den Austritts-Trigger, der
aus dem Identitäts-Lebenszyklus die lokale Bereinigung auslöst (Phase 7c).
Self-Service-„Konto löschen" ist im SSO-Kontext nicht das Modell; die lokale
Löschung ist ein admin-/trigger-ausgelöster, auditierter Datenpurge.

### Offene Entscheidungen — mit Datenschutzbeauftragtem/Recht zu klären

Ausdrücklich **nicht** in dieser ADR festgelegt:

- konkrete Aufbewahrungsfristen für Klasse (A) (z. B. bis Ende
  Beschäftigungsverhältnis + X Jahre, oder bis zur Verjährung möglicher
  Ansprüche),
- Bestätigung der Rechtsgrundlage (Art. 17 Abs. 3 lit. b DSGVO wie oben
  angenommen, oder eine abweichende Einordnung).

Der **Auslöse-Mechanismus** für den Austritt ist dagegen entschieden (kein
DSB-Thema, sondern Engineering): nächtlicher Keycloak-Reconcile, siehe
Phase 7c. Offen bleibt allenfalls, ob später zusätzlich ein Webhook für
geringere Latenz ergänzt wird.

## Umsetzung in Phasen (geplant)

- **Phase 7a — Datenklassen + Retention-Policy + RoPA.** Klassifikation (A/B)
  dokumentieren/codifizieren, Aufbewahrungsfristen definieren, Verzeichnis der
  Verarbeitungstätigkeiten (RoPA) zu FiKnow erstellen. *Braucht DSB-Input.*
- **Phase 7b — Konto-Löschung self-service + Kaskaden-/Anonymisierungslogik.**
  Die vorhandene, aber nicht verdrahtete „Danger-Zone"-UI
  (`app/(frontend)/profile/`) aktivieren; Backend, das Klasse (B) über alle
  Tabellen per `userId` löscht/anonymisiert.
- **Phase 7c — Austritts-Trigger + Retention-Cron.** Verbindet die Identitäts-
  mit der App-Daten-Ebene. **Mechanismus: nächtlicher Keycloak-Reconcile (Pull),**
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
  Purge. Nebeneffekt: derselbe Diff räumt verwaiste Altdaten mit auf.
  *Abhängigkeit: Cron/Job-Infrastruktur ist in ADR 0005 auf v1.1 descoped →
  Vorbedingung für 7c. Optional später: zusätzlicher Webhook für geringere
  Latenz.*

## Konsequenzen / Hinweise

- **Verwandter, aber separater Befund (hier nur Querverweis, nicht gelöst):**
  Laut Audit sind die DB-RLS-Policies zur Laufzeit faktisch wirkungslos — die
  App nutzt einen einzigen voll-privilegierten Connection-Pool und setzt keine
  SSO-Claims; Zugriffskontrolle läuft ausschließlich über App-Code.
  Defense-in-Depth fehlt damit auf DB-Ebene. Das ist ein eigener
  Härtungs-Fix, **vor Ableitung weiterer Schlüsse aus den RLS-Policies zu
  verifizieren** — hier nicht adressiert.
- Bis zur Umsetzung von 7a–7c besteht die eingangs beschriebene Lücke fort.
  Das ist bewusst als **geplant, nicht gebaut** ausgewiesen — kein Feature,
  das heute existiert.
