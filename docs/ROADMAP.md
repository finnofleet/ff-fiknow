# Produkt-Roadmap (intern)

Kanonische Feature-Roadmap der Plattform. **Die öffentliche Landing-Roadmap**
(`app/(frontend)/page.tsx`, `roadmap`-Array) zeigt bewusst nur die **offenen**
Punkte (geplant / in Arbeit / später) — kein Done-Status. Diese Datei hier ist
die Vollsicht inkl. Ausgeliefertem und Verworfenem.

> **Pflege-Regel — beim Ausliefern eines Features BEIDE Stellen nachführen:**
> 1. In `app/(frontend)/page.tsx` den Eintrag aus dem `roadmap`-Array
>    **entfernen** (nicht auf „fertig" setzen).
> 2. Hier den Punkt nach **✅ Ausgeliefert** verschieben (mit Datum/ADR).
>
> Sonst steht auf der Landing Ausgeliefertes weiter als „geplant". Genau das
> war der Grund für diese Datei. Siehe Projekt-Memory `app-roadmap-pflege`.

---

## ✅ Ausgeliefert

| Feature | Notiz |
|---|---|
| **Headless-Authoring** | `/admin` abgeschaltet → `/manage`-Fassade + Bundle-Checkout/-Upload via CLI/Plugin (ADR 0001, Headless-Programm A–D). |
| **KI-Tutor (Grundlage)** | Lerner-seitige „erklär das"-Erklärungen, statische Aktuelle-Lektion-Injektion (ADR 0002). `components/tutor/lesson-companion.tsx`. |
| **Notizen & Markierungen** | Annotations-Schicht: Highlights, Notizen, gespeicherte Tutor-Antworten, im Lesetext verankert (ADR 0002). `annotations`-Tabelle + `lib/annotations.ts` + lesson-companion. |
| **Katalog-Suche** | Freitext-Suche + Filter (Kategorie, Schwierigkeit) mit URL-Sync im Kurskatalog. `app/(frontend)/courses/catalog-client.tsx`. |
| **Konto-Self-Service** *(überholt durch SSO-Migration)* | Ursprünglich: Passwort ändern, E-Mail wechseln, Konto löschen im Profil. **Mit der OIDC/Keycloak-Umstellung entfallen** — Name, Passwort, E-Mail *und* Konto werden jetzt zentral über den Identity-Provider (SSO) verwaltet (`app/(frontend)/profile/`, Abschnitt „Konto-Verwaltung" ist reiner Hinweistext). **Wichtig:** eine FinKnow-**lokale** Löschung der Anwendungsdaten (DSGVO/MA-Austritt) läuft jetzt über **ADR 0006** — Phase 7b umgesetzt als Purge-Primitive + Admin-CLI (`scripts/purge-user.ts`), NICHT als Self-Service-UI (im SSO-Kontext bewusst admin-/trigger-ausgelöst). Automatischer Austritts-Trigger (7c Keycloak-Reconcile) noch offen. Siehe Datenschutz-Eintrag unter „Architektur-Überlegungen". |
| **Pflichtkurse & Compliance-Nachweis** | ADR 0005. **Phase 1–4 live**: Kurs-Toggle `mandatory` + Collection `training-requirements` (Rolle/User, Frist, Rezert.) → ein Reconciler → append-only `training_assignments` (Drizzle). Slug nach Anlage unveränderlich (Join-Key-Härtung). Completion-Trigger friert Content-Snapshot (title/version) beim Kurs-Abschluss ein. User-Ansicht „Meine Pflichtschulungen" (`/meine-pflichtschulungen`, Fristampel) + Compliance-Dashboard (`/manage/pflichtkurse`, Erfüllungsquote + Teilnehmer-Drill-down) — der Nachweis „wer/was/wann", treiber-agnostisch (EU AI Act, ISO, Security-Training, arbeitsrechtlich …). Materialisierung **lazy am Lesepunkt** (kein eager Hook wg. Transaction-Visibility). `lib/training/*`. E2e gegen Postgres verifiziert. **Art.-4-Schärfung (ADR 0005, Phase 6a–6d) live (2026-07-24)**: 6a Kurs-Metadaten (generische Treiber-Taxonomie `complianceDrivers`, EU AI Act nur ein Tag-Wert; `assessmentRequired`; `confirmationRequired`; Dauer nutzt bestehendes `estimatedMinutes`), 6b Lernkontroll-Gate (opt-in Quiz-Pflicht vor Abschluss) + evidence-Anreicherung, 6c Verständnisbestätigung (Checkbox auf letzter Lektion, gated), 6d Treiber-Filter im Compliance-Dashboard + CSV-Audit-Export. Verifiziert: `next build` grün, 129/129 Vitest, e2e 2/2, Migration real gegen Postgres angewendet inkl. sauberem Down. **Descoped v1.1**: Mail/Cron-Reminder, termingenaue Rezertifizierung, Gruppen-/Team-Modell, PDF-Export. **Abschlusstest-Modell ausgeliefert (2026-07-29/30, ADR 0005 „7a/7b" + ADR 0009):** Nachweis koppelt an einen dedizierten, **server-seitig gewerteten** `final_exam`-Abschlusstest (Client-`passed` nicht mehr vertraut) statt an „alle Quizze"; Bestehen für Pflichtkurse verbindlich (behebt „durchgeklickt = bestanden"); Versuchszähler im Nachweis; **Score-Leak-Fix** — `evidence` score-frei (nur „bestanden"+Versuche staff-lesbar, Detail-Score bleibt owner-only in `quiz_attempts`). **7c Fragen-Pool/Randomisierung** als eigene **Frage-Domäne (ADR 0009)** ausgeliefert: wiederverwendbare Bundle-Frage-Blöcke (`questions/`) → `questions`-Index → Pool-Referenz (`question_pool`/`questions_per_attempt`), deterministische Ziehung (Seed) + server-seitiges Index-Grading. Koexistenz: inline `<Question>` bleibt formativ gültig. **Offen:** Options-Shuffle, Migration bestehender inline-Prüfungen auf Pools, Spaced-Repetition-Scheduler (nutzt die Domäne). (ADR-0005-„7a–7c" NICHT verwechseln mit DSG-Phase 7a–7c aus ADR 0006.) |
| **Lernpfade** | Mehrere Kurse zu Reihen bündeln, eigenes Fortschrittstracking. **Slice 1 live**: Collection `learning-paths` (`payload/collections/learning-paths.ts`; Drafts/Autosave, slug-basierte Kurs-Referenz statt FK, `fuehrungsgrad` linear/lose, Rolle pro Kurs required/recommended/optional) + Migrationen (`..._add_learning_paths` + `..._add_learning_paths_drafts`). Frontend `/paths` (Übersicht, Karten-Grid) + `/paths/[slug]` (Fortschrittsbalken, „Weiterlernen", geordnete Kursliste mit Rollen-Badges). Read-Layer `lib/paths.ts`, Fortschritts-Aggregation `lib/paths-progress-compute.ts` (I/O-frei, erster Vitest-Test der Codebasis — siehe „Test-Absicherung"). Volles MCP-Authoring-CRUD (`upsert/list/publish/unpublish/delete_path`, `lib/authoring/lifecycle.ts` + `validate-path-input.ts`), Nav-Link „Pfade" (gated via `countPaths()`), Seed-Script + `docs/AUTHORING_PATH.md`. **Offen/descoped (Slice-1-Grenze):** pfad-weites RAG-Retrieval noch nicht angebunden — Retrieval bleibt kurs-gescoped (`lib/rag/retrieval.ts` → `retrieveForQuery(courseSlug)`); `fuehrungsgrad`-Gating bewusst nicht gebaut (nur Präsentation/Reihenfolge, sperrt nichts); dedizierte E2E-Tests fehlen (Unit-Tests vorhanden). |
| **Content-gegroundeter KI-Tutor (RAG)** | ADR 0003. **Phase 1+2 live** (verstande): `real[]` + App-Cosine statt pgvector, `lesson_chunks` + Voyage-Embeddings, Index beim Upload + Re-Index/Backfill; Retrieval im Tutor-Endpoint (Query-Embedding → Cosine-Top-k → Kontext-Injektion), Quiz-Guardrails b+c, Fallback auf Lektions-Injektion, `grounded`-Flag + Quellen an die UI. **Default = immer aus dem Kurs grounden**; der frühere automatische Scope-Router wurde verworfen (Self-Match → feuerte nie) → ersetzt durch Button **„Allgemeinwissen ergänzen"** (user-initiierte ungegroundete Antwort, angehängt). **Phase 3 (Eval + Schwellen-Tuning) aufgeschoben — bei Bedarf, nicht auf Spec**: kein Security-/Nutzungs-Trigger, der Button entschärft den Hauptgrund; Trigger für später = off-topic-Fehlantwort beobachtet / stark regulatorischer Kurs live / Skalierung auf Lernpfade (pfad-weites Retrieval). **Embedding-Provider: Ablösung Voyage → IBM watsonx (2026-07-24, geschärft 2026-07-26, ADR 0003 3. Nachtrag):** `ibm/granite-embedding-278m-multilingual` (768-dim) hinter derselben `EmbeddingProvider`-Abstraktion (`EMBEDDING_PROVIDER=watsonx`). **Konsequente Ablösung, keine Koexistenz** — ausschlaggebend: mit IBM (Betriebsplattform) besteht ein **Vertrag/AVV**, mit Voyage **nicht** (US/Drittland, DSG-Nachteil ohne Vorteil); dazu Kosten + deutschsprachige Qualität. **Code-Default seit 2026-07-26 = watsonx** (`DEFAULT_PROVIDER`); Voyage nur noch Legacy per `EMBEDDING_PROVIDER=voyage`. Schließt die RoPA-Lücke für die Embeddings (Tätigkeit 4). Dimensionswechsel 1024→768 erfordert einen Backfill; **pgvector bleibt bewusst draußen** (App-Cosine reicht für den Pro-Kurs-Scope). Code umgesetzt + unit-getestet (150/150 Vitest); echter watsonx-Smoke-Test (`scripts/embed-smoketest.ts`) + Backfill stehen mit dem nächsten Deploy aus. **Offen:** ob auch die Text-LLM-Ebene (Anthropic, ebenfalls ohne bestätigten AVV) analog auf IBM konsolidiert wird. |
| **Rollen, Rechte & Compliance-Scoping** | **ADR 0007 P1–P5a ausgeliefert (2026-07-29).** Zwei-Achsen-Modell: additive Capabilities/Rollen (feste Code-Capabilities + DB-Rollen-Matrix `roles`/`role_capabilities`/`role_assignments`) ∥ Sicht-Scope (Land/BU, Zeilenfilter gegen die AKTUELLE `profiles.land/bu`). Compliance-Dashboard zweigeteilt: namentlich (`compliance:view-named`, scope-gefiltert) + PII-freie **Aggregat-Sicht** (`compliance:view-aggregate`, k-Anon ≥ 5). Append-only **Audit-Log** (Authoring-Lifecycle inkl. MCP + Admin-Aktionen live; Compliance-Zugriffs-Logging hinter Feature-Flag `AUDIT_COMPLIANCE_ACCESS`/BR). **Rechte-Inspektor** (`/manage/rechte`). **Rechte-Achse jetzt end-to-end aus dem IdP verdrahtet (2026-09-02):** die Matrix war bis dahin nur für manuelle `role_assignments` lebendig — die vom IdP gelieferten Rollen/Gruppen liefen ausschließlich über die eine, per Rang aus `OIDC_ROLE_MAP` kollabierte `profiles.role`. Jetzt werden **alle** Rollen-Keys einer Person (nicht nur die ranghöchste) gegen die Matrix aufgelöst (`lib/auth/role-keys.ts`) und in `profiles.role_keys` persistiert (`drizzle/0015_flashy_trauma.sql`); `resolveEffectiveCapabilities` (`lib/auth/effective-capabilities.ts`) bildet die Vereinigung aus Rang-Rolle (code-seitiger Fail-safe-Boden) ∪ Matrix-Capabilities für die IdP-Keys ∪ `role_assignments` — orthogonale Rollen („Admin UND Compliance-Einsicht") sind damit ausdrückbar. System-Rollen (`admin`/`curator`) bewusst aus dem Key-Pfad ausgeschlossen (sonst Eskalation über gleichnamige Keycloak-Gruppenpfade) und kommen weiter nur über `OIDC_ROLE_MAP`. Rein additiv, keine Rechteänderung für Bestandsnutzer; Rechte-Inspektor zeigt die aufgelösten IdP-Keys zur Verifikation. **Rechte-Achse abgeschlossen (2026-09-02):** die feingranularen Content-Gates (alle 20 Gates in 13 Dateien) prüfen jetzt einheitlich `can(caps, …)` gegen `resolveEffectiveCapabilities` statt der legacy `profiles.role` — `capabilitiesForSystemRole`, `capabilitiesForRoleKeys` und die Wrapper `canSeeAdmin`/`canManageCourses`/`canManageUsers` sind als zweite Rechte-Quellen entfernt. `DECLARED_ROLES` ist reine Seed für die Matrix, der Boot-Initializer `system-roles` gleicht ab (inkl. Löschen entzogener Capabilities). **Compliance-Capabilities aus `curator`/`admin` herausgelöst** (Betriebsrats-Auflage): Nachweis-Einsicht (`compliance:view-named`/`-aggregate`/`-export`) sitzt jetzt allein in der eigenen Rolle `finknow-compliance`, vergeben über eine gleichnamige Keycloak-Gruppe; additiv kombinierbar mit `curator`/`admin`. Pflichtschulungs-Ziele laufen seit derselben Änderung über Mengen-Zugehörigkeit auf `profiles.role_keys` statt über den entfallenen `ROLE_RANK`/`roleMeetsTarget` (ADR 0011, jetzt superseded — siehe dort). **Offen/fremdabhängig:** P5b Claim-Import (empirischer Entra→KC-Claim-Check), P6 Manager-Scope (HR-Datenquelle fehlt), P7 RLS-Härtung (bewusst zurückgestellt, ADR 0008). |

## 📋 Geplant (auf der Landing)

| Feature | Notiz |
|---|---|
| **Repetitionsfragen** | Spaced Repetition. Vorarbeit: `flashcard`-Typ im `annotations`-Enum reserviert — Scheduling fehlt. |
| **Scroll-Fortschrittsbalken** | Lese-Fortschritt *innerhalb* einer Lektion. Vorarbeit: Kurs-Fortschrittsbalken (`topProgress`) existiert, aber kein Scroll-Tracking pro Lektion. |
| **Übungs-Vorschau im Curriculum** | Anzahl Übungen/Quizze pro Abschnitt auf der Kursübersicht. Vorarbeit: Typ-Icon pro Lektion da, Aggregat-Zahl fehlt. |

## 🕓 Später (auf der Landing)

| Feature | Notiz |
|---|---|
| **Video-Lektionen** | Player + Transkript + Sprung-Marker. Vorarbeit: `video`-Lesson-Typ + `video_url`/`transcript`-Frontmatter im Schema, aber kein Player im Renderer. |
| **Zertifikate** | Abschluss-Bestätigung. Nicht begonnen. |

## 🧭 Architektur-Überlegungen (intern, nicht auf der Landing)

Offene Produkt-/Architekturfragen, noch keine Landing-Features. Hier festgehalten,
damit sie nicht in Brand-/Stil-Dokumenten versickern (gehören nicht in den
markenspezifischen Content-Style-Overlay, sondern hierher).

| Thema | Notiz |
|---|---|
| **Zielgruppen-/BU-Sichtbarkeit** | Nicht jeder Inhalt gilt für alle — konkrete Use Cases (Product Owner): der EU AI Act gilt für DE, nicht für CH (Kurs nur für DE relevant/pflichtig, für CH irrelevant); ein Produkt-Onboarding-Kurs betrifft nur eine Business Unit; allgemein unterscheidet sich der Stack je BU. **Klare Abgrenzung zu bereits Gebautem:** `training-requirements` (ADR 0005/0007 §4) grenzt schon ein, **für wen ein Kurs pflichtig** ist (`landScope`/`buScope`-Filter) — der Kurs bleibt aber für alle Länder/BUs im Katalog **sichtbar**, nur eben nicht als Pflicht. Offen ist die **Kurs-Sichtbarkeit selbst** (sieht ein irrelevantes Land/eine irrelevante BU den Kurs überhaupt im Katalog bzw. hat Zugriff) — inkl. Nicht-Pflichtkursen, die von `training-requirements` gar nicht erfasst sind. Günstige Vorarbeit läuft bereits: Autoren benennen die Zielgruppe (BU/Firma/Rolle) im `summary` — Konvention im Content-Style-Overlay, aber ohne Durchsetzung/Filter. **Richtungs-Aufriss in [ADR 0010](adr/0010-kurs-sichtbarkeit-land-bu.md) (Proposed):** Relevanz-Attribut am Kurs-Frontmatter (Land/BU, analog `landScope`/`buScope`, leer = alle), weicher Katalog-Filter vs. hartes Zugriffs-Gate offen; Verhältnis zum Pflicht-Targeting noch ungeklärt. |
| **Mandantierung** | Ob die Plattform getrennte Sichten/Rechte pro Business Unit / Firma braucht. Größere Architekturentscheidung; baut auf der Zielgruppen-Sichtbarkeit oben auf. **Teil-Trigger eingetreten (2026-07-26, Kollegen-Review BR/BV):** für die **Compliance-Auswertung** ist ein Entity-/OpCo-Scoping + gestufte Auswerte-Ebenen (HR = namentlich eigene Gesellschaft, GF = aggregiert eigene Gesellschaft, optional Manager = eigenes Team) nötig → **als ADR 0007 P1–P5a ausgeliefert (2026-07-29, siehe „✅ Ausgeliefert" → „Rollen, Rechte & Compliance-Scoping")**, inkl. append-only **Audit-Log**. ADR 0007 liefert bewusst NUR den Compliance-Ausschnitt, nicht die volle Multi-Tenancy — die größere Mandantierungsfrage bleibt offen/zurückgestellt. Durchsetzung App-seitig; die DB-seitige **RLS-Härtung (ADR 0007 P7)** ist bewusst zurückgestellt (ADR 0008 — kein PostgREST/keine echte Mandantierung → Restrisiko getragen), App-Code bleibt die Verteidigungslinie. |
| **Test-Absicherung** | Eingeführt, als die Codebasis komplex genug wurde (Lernpfade): **Vitest, vorerst nur Unit-Tests ohne DB/Payload** (`npm test`, CI-Gate `.github/workflows/test.yml`). Erster Test: `lib/paths-progress-compute.ts` (reine Aggregation, bewusst als Leaf-Modul von I/O getrennt → testbar). **Bewusst aufgeschoben:** DB-Integration (Payload Local API gegen Test-Postgres), Component-Tests (RTL), E2E (Playwright) — je bei Bedarf, eigenes Setup. Konvention: reine Logik in I/O-freie Leaf-Module ziehen, dann unit-testen. |
| **Maintenance-Seite bei Deploy** | Bei aktuell **einer** App-Node erzeugt jeder Restart / jede DB-Migration ein Fenster mit hässlichen 502/504. Idee: nginx-Flag-File-Pattern (`-f maintenance.on` → kontrollierte 503-Seite mit Branding + `Retry-After`), kein Reload nötig (per-Request ausgewertet). Wichtig: **IP-Whitelist** (live testen vor Freischalten, da keine zweite Node) + **Health-Gate** im Deploy-Skript (erst `rm` nach erfolgreichem `/health`). Setzt eigene Brand-Wartungsseite + Health-Endpoint voraus. Noch nicht umgesetzt. |
| **Datenschutz: Aufbewahrung & Löschung (DSG/DSGVO)** | Ausgelöst durch eine Betriebsrat-Anfrage (§87 Abs. 1 Nr. 6 BetrVG) + ein Audit, das eine bestätigte Lücke zeigt: **keine funktionierende Konto-Löschung** (Profil-„Danger-Zone" ist totes CSS ohne Backend), **keine Kaskaden/Anonymisierung** abhängiger Tracking-Daten bei Konto-Löschung/MA-Austritt (keine DB-Foreign-Keys auf `userId`/`courseSlug`, verwaiste Zeilen möglich), Konflikt **append-only Audit-Trail (`training_assignments`, ADR 0005) vs. Recht auf Löschung ungelöst**, keine Aufbewahrungsfristen/kein Cron. Lösungsrichtung in **ADR 0006**: zwei Datenklassen — (A) Nachweis-relevant (`training_assignments`, befristet vorgehalten, Rechtsgrundlage **Art. 6 Abs. 1 lit. f + Art. 17 Abs. 3 lit. e DSGVO**) vs. (B) nicht nachweispflichtig (`profiles`, `enrollments`, `lesson_progress`, `quiz_attempts`, `annotations`, `authoring_tokens` — bei Austritt löschbar/anonymisierbar). **Retention-Parameter entschieden (restriktivste Auslegung, EU/DSGVO):** Frist Klasse (A) = **3 J** (§ 195/§ 199 BGB), konfigurierbar via `FINKNOW_RETENTION_YEARS`; danach Hard-Delete. **Status: Phase 7a/7b + 7c-Teil-Retention umgesetzt + verifiziert (2026-07-24), Rollout mit nächstem Deploy** — Datenklassen + Frist-Logik (`lib/privacy/*`), Purge-Primitive + Admin-CLI (`scripts/purge-user.ts`), fristbasierter Retention-Purge als **K8s-CronJob** (`scripts/retention-purge.ts` + `deploy/helm/…/cronjob.yaml`, PII-freie Audit-Tabelle `retention_purge_runs`), RoPA (`docs/ROPA-finknow.md`). Der append-only-vs.-Löschung-Konflikt ist in ADR 0006 aufgelöst (append-only = Schreibdisziplin, Lifecycle-Löschung = separater auditierter Vorgang). Die auf ADR 0005 v1.1 geparkte Cron/Job-Infrastruktur **existiert damit** (CronJob-Muster). **Noch offen (7c-Teil 2):** Austritts-Trigger / nächtlicher **Keycloak-Reconcile** (Deprovisionierung mit Confirmation-Count-Soft-Delete) — braucht neue `profiles`-Spalten + einen KC-Service-Account (`view-users`). Offen mit DSB: finale Frist-Abnahme (§ 199 Abs. 3/4 Höchstfristen für Sonderfälle). |

## 🐞 Offene Befunde (technische Schuld)

In einer Arbeitssitzung durch Code-Lektüre verifizierte Einzelbefunde (kein
Feature-Vorhaben, keine Spekulation) — hier gesammelt, damit sie nicht wieder
verloren gehen, bevor ein ADR oder Ticket dafür existiert.

- **`suspended` ist verwaist.** Kein `OIDC_ROLE_MAP` in `.env.example`,
  `.env.local` oder `deploy/RUNBOOK.md` bildet irgendetwas auf `suspended`
  ab; kein Skript und keine UI schreibt `profiles.role` (einziger Writer:
  `provisionProfile`, `lib/auth/provider/oidc/index.ts`). Der Wert ist
  praktisch nur per Hand-SQL erreichbar. `isSuspended()` (`lib/auth/roles.ts`)
  wird nirgends aufgerufen. Herkunft: die Rolle stammt aus der Zeit vor
  Keycloak, als die App ihre Nutzer selbst verwaltete (Supabase/GoTrue — vgl.
  das im Initial-Commit noch vorhandene `scripts/promote-admin.mjs`, gelöscht
  in Commit 816c1b0 „GoTrue-Altlasten entfernen"). Der Doc-Kommentar in
  `lib/auth/roles.ts` beschreibt noch diese alte Welt („Reversibel durch Admin
  (Rolle zurück auf learner)"), obwohl Nutzerverwaltung vollständig in
  Keycloak liegt.
- **Der Soft-Ban ist nur teilweise durchgesetzt.** Der Doc-Kommentar
  verspricht „auch Lerner-Funktionen sind blockiert". Tatsächlich prüft
  `canLearn` nur die Annotations-API (`app/(frontend)/api/annotations/route.ts:116`)
  und den KI-Tutor (`app/(frontend)/api/tutor/explain/route.ts:76`). Die
  Lektionsseite und die Fortschritts-/Quiz-Server-Actions
  (`app/(frontend)/learn/[courseSlug]/[sectionSlug]/[lessonSlug]/`) prüfen
  nur `getCurrentUser()`, also lediglich „eingeloggt". Ein gesperrtes Konto
  kann damit weiter Lektionen lesen, Fortschritt schreiben und Quiz-Versuche
  abgeben — und so weiter Abschluss-Nachweise erzeugen.
- **Ein Keycloak-Disable beendet keine laufende App-Session.** Die
  App-Session ist ein selbsttragendes signiertes Cookie mit
  `OIDC_SESSION_MAX_AGE_SEC` (Default 8 h); `getServerIdentity` prüft die
  Signatur und liest die Rolle aus `profiles`, fragt aber nie bei Keycloak
  nach, ob das Konto noch gültig ist (keine Token-Introspection, kein
  Refresh). Wer in Keycloak deaktiviert wird, arbeitet bis zum Cookie-Ablauf
  weiter. Ironie: `liveRole()` liest pro Request frisch aus der DB,
  ausdrücklich „damit ein Admin-Suspend/-Demote SOFORT greift" — die
  Durchsetzungshälfte existiert, nur schreibt nichts den Status. Naheliegender
  Aufhänger: der ohnehin geplante nächtliche Keycloak-Reconcile (ADR 0006
  Phase 7c Teil 2).
- **`compliance:export` wird nie gescoped. — BEHOBEN (2026-09-02).** Die
  Capability steht in `SCOPED_CAPABILITIES` (`lib/auth/capabilities.ts`),
  aber die Export-Route gated auf `compliance:export` und löste danach den
  Scope von `compliance:view-named` auf
  (`app/(frontend)/manage/pflichtkurse/export/route.ts`). Da
  `resolveViewerScope` bei null Treffern `unrestricted` liefert, hätte eine
  auf eine Gesellschaft gescopte Rolle, die NUR `compliance:export` trägt,
  den CSV-Export über ALLE Gesellschaften gezogen — fail-open in genau der
  Richtung, die das Scoping verhindern soll. Fix: die Route löst jetzt den
  Scope von `compliance:export` selbst auf (`resolveViewerScope(user.id,
  "compliance:export")`).
- **Audit-Log: Lesepfad entschieden, Aufbewahrung weiter offen (Stand
  2026-09-02).** *Kein Viewer in der App* — bewusste Entscheidung: die
  Protokollierungs-Auflage ist erfüllt, solange die Daten abfragbar sind. Das Log
  (`audit_log`) kann bei Bedarf vom Plattform-Team abgefragt werden; vermerkt
  in `deploy/RUNBOOK.md`, Abschnitt 7f. Die Capability
  `audit:view` bleibt als reservierter Platzhalter deklariert, wird aber
  bewusst nirgends durchgesetzt — im Datei-Kopf von
  `lib/auth/capabilities.ts` als einzige Ausnahme von „jede Capability wird
  durchgesetzt" vermerkt, damit sie nicht als Feature missverstanden wird.
  **Weiterhin offen: die Aufbewahrungsfrist.** `audit_log` steht bewusst noch
  nicht in `CLASS_A_TABLES` (`lib/privacy/data-classes.ts`), die
  Purge-Verdrahtung fehlt also; das Log wächst unbegrenzt. Besonders relevant,
  weil `scripts/purge-user.ts` die UUID der gelöschten Person als `target_id`
  hinterlässt — die Löschung hinterlässt damit einen dauerhaften
  Identifikator. Die Frist ist eine DSB-Frage, kein Code-Problem.
- **Rechtevergabe ist nicht auditierbar — Befund neu gefasst (2026-09-02).**
  Die ursprüngliche Rahmung war falsch: **Keycloak ist das führende System
  für Rollen**, und wer eine Rolle vergeben hat, steht in den
  **Keycloak-Admin-Events** — das kann und soll diese App nicht selbst
  protokollieren, sie sieht beim Login nur das Ergebnis in den Claims, nie
  den Vorgang im IdP. Teilweise geschlossen: neue Audit-Actions
  `role.key-added`/`role.key-removed` (`lib/auth/provider/oidc/index.ts`)
  protokollieren jetzt die BEOBACHTETE Änderung der Rollen-Menge einer
  Person — das beantwortet „seit wann" trägt jemand eine Rolle, nicht „wer
  hat sie vergeben". Verbleibender, reduzierter Punkt: **mit IT zu
  verifizieren**, (1) ob die Keycloak-Admin-Events überhaupt aktiv sind (sie
  sind standardmäßig AUS), (2) welche Aufbewahrungsfrist sie haben, und (3)
  wer sie lesen darf. Zusätzlich eine Dokumentationslücke: `docs/ROPA-
  finknow.md` erwähnt IdP-seitiges Event-Logging bisher an keiner Stelle —
  für den DSG/DSGVO-Nachweis muss dort ergänzt werden, wo die
  Rechenschaftsspur für Rollenvergabe tatsächlich liegt.
- **Compliance-Audit-Einträge halten den Umfang der Offenlegung nicht fest.**
  `audit_log` hat `land`/`bu`-Spalten und `AuditEntry` akzeptiert beide, aber
  keine Aufrufstelle übergibt sie (Grep: nirgends geschrieben). Ein Eintrag
  sagt „X hat namentliche Nachweise gesehen", nicht wessen oder wie viele.
  Hinweis: das nachzuziehen macht die Zeilen sensibler und ist deshalb eine
  bewusste Abwägung (BR-Mitbestimmung), kein reiner Bugfix.
- **`editor` als Legacy-Rollenwert** (`normalizeRole`, `lib/auth/roles.ts`)
  stammt ebenfalls aus der Vor-Keycloak-Zeit. Da `profiles.role` bei jedem
  Login aus den Claims überschrieben wird und kein Mapping `editor` erzeugt,
  heilt ein Altbestandswert beim nächsten Login von selbst — der Zweig und
  die beiden Kommentare, die ein `UPDATE` empfehlen, können entfallen.
- **Rohe Error-Objekte im Log. — BEHOBEN (2026-09-02).** Mehrere Handler
  gaben Fehlerobjekte direkt an `console.error` (u. a. `lib/audit/log.ts`,
  `lib/training/compliance.ts`, die Learn-Actions, die Authoring-Routen).
  Postgres-Fehler führen ein `detail`-Feld, das Schlüsselwerte (z. B.
  User-UUIDs) enthalten kann — der einzige Pfad, auf dem Rohwerte in die
  Container-Logs gelangen könnten, wo der Leserkreis größer ist als bei
  DB-Zugriff. Fix: alle betroffenen Stellen (24 Call-Sites, 20 Dateien)
  laufen jetzt durch `redactError` (`lib/log-redact.ts`), das nur
  `code`/`message` loggt.

**Kein Befund — bewusst dormant:** Die RLS-Policies referenzieren
`auth.uid()`/`auth.role()`. Diese Funktionen EXISTIEREN: `lib/db/auto-migrate.ts`
legt sie bei jedem Boot inline an (`AUTH_SCHEMA_BOOTSTRAP`, dort ausdrücklich
als kanonische Quelle bezeichnet). Die Policies greifen heute nur deshalb
nicht, weil die App als DB-Owner verbindet (RLS-Bypass) und niemand
`request.jwt.claim.*` auf der Verbindung setzt. Das ist der in ADR 0008
bewusst zurückgestellte Zustand (P7), kein Altlast-Rest — nicht entfernen.

## 🏗️ Plattform-Skalierung: Multi-Author, SSO, Mandantierung (trigger-gated)

> Strategie-Notizen, damit beim späteren Anschalten nichts neu gedacht werden
> muss. **Bewusst nicht versioniert** — kein „Phase 2.5"-Datum, sondern
> bedarfsgetrieben (siehe Trigger). Bis ein Trigger feuert: nicht bauen (YAGNI).
> Früher als `docs/PHASE-2.5-ROADMAP.md` geführt; hierher gemergt und gegen den
> Headless-Pivot abgeglichen.

**Trigger — aktivieren, sobald einer davon eintritt:**

- **FinKnow-Pilot trägt** und FINNOFLEET-Stakeholder geben grünes Licht für
  Roll-out, **oder**
- **mehrere Autor:innen** (z. B. Teamleiter:innen) müssen eigenständig Inhalte
  beitragen — der heutige Authoring-Weg (Bundle-Checkout/-Upload via CLI/Plugin
  + MCP) ist für Nicht-Entwickler:innen keine Option, **oder**
- **SSO** (Entra/Azure AD) wird zwingend — etwa wegen Konzern-Compliance.

**Schon vorbereitet (damit es keine Refactoring-Bombe wird):**

- **OIDC/Keycloak ist der Auth-Provider** (Keycloak hinter Entra ID, siehe
  `lib/auth/provider/oidc/*`) — der frühere GoTrue/Supabase-Ansatz ist mit
  dem Headless-Pivot entfallen.
- **Postgres-Schema** über den Payload-Postgres-Adapter (Drizzle darunter),
  Migrationen hand-authored (Projekt-Memory `payload-migration-hand-authoring`).
- **Eigenes Image** via GHCR, kein Vercel-Lock-in.
- **Brand-/Content-Trennung** über Env-Vars + Volume-Mounts — eine Codebasis
  bedient mehrere Apps (Projekt-Memory `brand-overlay-deployment`).

### 1. Multi-Author-Authoring

**Der Bedarf besteht** (mehrere Autor:innen, Rollen, Draft→Review→Publish),
**aber die Lösungsform hat sich mit dem Headless-Pivot geändert.** Der ursprüngliche
Plan „Payload-CMS-Admin als Editor-UI" ist **verworfen** (siehe unten) — `/admin`
ist abgeschaltet (Proxy-Redirect → `/manage`, `proxy.ts`). Payload
bleibt **Daten-/Content-Layer**, nicht Autoren-UI.

Stattdessen baut Multi-Author auf dem bestehenden **headless Authoring-Pfad** auf
(ADR 0001/0004): Bundle-Checkout/-Upload + MCP-Server + `/manage`-Fassade. Offen
für später:

- **Rollen & Permissions** auf `/manage` (Admin / Editor / Viewer, ggf. nach
  Abteilung/BU gegated) — heute ist `/manage` Kurator:innen-weit.
- **Draft → Review → Publish** als Workflow-Status (Upload landet bereits als
  Draft; Live-Schalten ist bewusst separat — Skill `course-publish`). Ein
  Reviewer-Schritt dazwischen fehlt noch.
- **Versions-Historie / Audit-Trail** über die `version`-Tokens hinaus.
- Niedrigschwelliger Authoring-Einstieg für Nicht-Entwickler:innen (der
  Git/CLI-Weg ist die heutige Grenze) — Form noch offen.

### 2. Entra (Azure AD) als SSO-Provider

**Bereits erledigt:** Auth läuft heute über OIDC gegen Keycloak, das seinerseits
hinter Entra ID sitzt (`lib/auth/provider/oidc/*`, Login-Flow unter
`app/(frontend)/auth/oidc/*`). Der frühere Plan „geteiltes GoTrue als zentrale
Auth, Entra als zusätzlicher OAuth-Provider obendrauf" ist mit dem
Headless-Pivot entfallen — GoTrue/Supabase wurde vollständig entfernt.

### 3. Single Identity (Lerner = Editor, ein Account)

Damit eine Person mit demselben Account lernt **und** (je nach Rolle) editiert:

- Rolle/Abteilung werden **app-/`/manage`-seitig** verwaltet, nicht in GoTrue.
  (Die frühere Payload-Custom-Auth-Strategy gegen GoTrue ist mit dem
  Headless-Pivot entfallen — Projekt-Memory `headless-payload-program`.)
- Just-in-Time-Provisioning beim ersten Login: User-Datensatz wird angelegt,
  Rolle defaulted auf Lerner, Editor-Rechte werden explizit vergeben.

### Ausbau-Idee: vertrauliche / zielgruppen-beschränkte Kurse

> Eigene Achse; hängt eng an **Zielgruppen-/BU-Sichtbarkeit** und
> **Mandantierung** oben (siehe Architektur-Überlegungen). Hier nur die
> Media-/Storage-Mechanik, weil die dort fehlt.

**Heutige bewusste Grenze:** Sichtbarkeit ist binär — `draft` (nur Editoren) /
`published` (**alle, inkl. anonym; Text *und* Assets**). Media liegt statisch
öffentlich in `public/media`. Details: `SECURITY_AUDIT.md`, Abschnitt
„Bewusste Design-Grenze: Sichtbarkeitsmodell".

**Wenn vertrauliche Kurse Requirement werden, braucht es beide Ebenen zusammen:**

- **Content-Sichtbarkeit:** ein `visibility`-Tier an `Course`
  (`public` / `enrolled-only` / `private`) + enrollment-/rollen-gegateter Read
  auf Course/Section/Lesson (statt nur `published = alle`).
- **Media dazu:** raus aus `public/`, in **privaten Storage** (Object Storage
  Infomaniak); Auslieferung nur über einen access-gegateten Endpoint mit
  derselben Sichtbarkeitsregel — **oder** kurzlebige **signierte URLs**, pro
  autorisiertem Render gemintet. (Media-Verzeichnis ist seit `534c9c4` bereits
  env-konfigurierbar via `MEDIA_STORAGE_DIR` — Vorarbeit Richtung externem Store.)

Trigger: konkreter Bedarf an internen/kostenpflichtigen/Embargo-Kursen. Bis dahin
bewusst nicht gebaut.

### Meilensteine (de-versioniert, trigger-gated)

| Schritt | Ziel |
|---|---|
| **Heute** | FinKnow lauffähig, Yves als einziger Autor, Email-Login, headless Authoring (CLI/Plugin + MCP). |
| **Multi-Author** | Rollen/Permissions + Review-Schritt auf dem `/manage`-/Bundle-Pfad; niedrigschwelliger Einstieg für Nicht-Entwickler:innen. |
| **SSO** | Entra als OAuth-Provider, Single-Identity zwischen Lerner und Editor. |
| **Enterprise** | SCIM-User-Provisioning aus Entra, HR-Reporting (wer hat welchen Onboarding-Kurs durch), ggf. Multi-Tenant/SAML. |

## ⛔ Verworfen

| Feature | Grund |
|---|---|
| **Editor-UX für AI-Autoren (Admin)** | Slug-Auto/Drag-&-Drop/Labels im Payload-Admin — Richtung mit dem Headless-Pivot aufgegeben. Authoring läuft jetzt über Bundle-checkout/edit/upload (CLI/Plugin), nicht über ein Web-Admin-Editor-UI. |
