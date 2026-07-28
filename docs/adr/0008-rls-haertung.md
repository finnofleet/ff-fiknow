# ADR 0008 — RLS-Härtung: DB-seitige Durchsetzung als Defense-in-Depth

- **Status:** **Entschieden (2026-07-28): RLS-Durchsetzung (P7) zurückgestellt,
  Risiko bewusst getragen** — keine echte Mandantierung, kein REST-Loch (siehe
  Angriffsflächen-Analyse). Als kleinere, separate Härtung ist ein
  Least-Privilege-App-User *vorgeschlagen* (noch nicht entschieden — hängt an
  einer IT-Feasibility-Frage). Kein RLS-Enforcement-Code.
- **Datum:** 2026-07-28
- **Kontext-Phase:** Sicherheit / Mandantentrennung / Defense-in-Depth
- **Verwandt:** [[0007-mandanten-scoping-und-auswerte-ebenen]] (§10, P7),
  [[0006-datenschutz-aufbewahrung-und-loeschung]] (§Konsequenzen, RLS-Befund),
  `lib/db/schema.ts` (Policies), `lib/db/client.ts` (Pool),
  `lib/db/auto-migrate.ts` (auth.*-Bootstrap), `payload.config.ts` (Payload-Pool)

---

## Kontext

ADR 0006 und ADR 0007 §10 halten offen fest: die vorhandenen RLS-Policies sind
zur Laufzeit **faktisch wirkungslos**. Das Scoping (ADR 0007) wird **rein im
App-Code** durchgesetzt; die DB ist keine zweite Verteidigungslinie. P7 soll das
härten. Dieser Aufriss klärt zuerst den Ist-Zustand (auf Code-/Deploy-Ebene
verifiziert), dann die Optionen und die offenen Entscheidungen — bevor Code
entsteht.

## Entscheidung (2026-07-28) — audit-relevant

**RLS-Durchsetzung (P7) wird bewusst zurückgestellt; das Restrisiko wird
getragen.** Begründung:

- **Keine echte Mandantierung.** FIKNOW ist Single-Tenant mit Entitäts-*Sicht*-
  Filtern (Land/BU), keine harte Mandantentrennung — der Schutzbedarf, den RLS
  klassisch adressiert, ist entsprechend geringer.
- **Kein direktes REST-/Tabellen-Schlupfloch** (Angriffsflächen-Analyse unten):
  RLS wäre hier kein Gate gegen einen offenen Kanal, sondern nur ein Backstop
  gegen eigene App-Bugs.
- Die eigentliche Zugriffskontrolle (Capabilities + Scope, ADR 0007) liegt
  vollständig und e2e-geprüft im App-Code.

Dies ist eine **bewusste, begründete Risikoübernahme, kein Versäumnis** — so für
ein etwaiges **Security-Audit** dokumentiert. ADR 0006 hatte die RLS-Lücke offen
benannt; diese ADR schließt die Frage mit „bewusst getragen". **Neu bewerten,
falls** hinzukommt: echte Mandantierung, ein direkt-exponierter Daten-Endpoint,
oder eine DSB-/Audit-Auflage zu DB-seitigem Defense-in-Depth.

## Angriffsflächen-Analyse (warum das Risiko tragbar ist)

Anders als bei Supabase (PostgREST exponiert Tabellen roh über HTTP, RLS ist das
einzige Gate) gibt es hier **keinen generischen Tabellen-/SQL-Endpoint**:

- Die DB ist **nicht browser-erreichbar** — nur der Server-Prozess verbindet
  sich (privates Netz/Connection-String). Der Client spricht ausschließlich mit
  Next.js-HTTP-Endpunkten.
- **Jeder** Datenpfad läuft durch App-Code (Server-Components/Route-Handler/
  Server-Actions) inkl. dessen Scope-Filter + Gates.
- Die einzige tabellennahe HTTP-Fläche ist die **Payload-REST-API** — hinter dem
  `proxy.ts`-Login-Gate, mit Payloads eigener Access-Control, auf dem separaten
  `payload`-Schema (Content/Users), NICHT den Scope-Daten im `public`-Schema.

**Restrisiko, das RLS abfinge:** ausschließlich App-Code-Bugs (vergessener
Filter, neuer Endpoint ohne Gate, Injection). RLS hilft NICHT gegen einen
geleakten Connection-String / direkten DB-Zugriff (Owner umgeht ohnehin; ein
Angreifer mit Creds ist von RLS unberührt).

## Kleinere, separate Härtung: least-privilege App-User (vorgeschlagen)

Unabhängig von RLS und deutlich billiger: den heutigen **Owner** (DDL,
Migrationen) von einem **App-User** trennen, der nur Daten lesen/schreiben darf
(kein DDL). Reduziert den Blast-Radius — Injection/Pod-Kompromittierung kann
keine Tabellen droppen, kein Schema ändern, keine RLS-Policies abschalten. Zwei
Haken:

- **Migrationen laufen heute beim Boot** (`instrumentation.ts` →
  `runAutoMigrations`). Ein DML-only-User kann kein DDL → Migrationen in einen
  separaten, als Root laufenden Schritt herauslösen (App-Pods `SKIP_MIGRATIONS`).
  Das Muster ist im e2e-Harness bereits bewiesen (Migrate-Setup getrennt vom
  Runtime via `SKIP_MIGRATIONS`).
- **RLS-Wechselwirkung:** ein Nicht-Owner unterliegt RLS automatisch; da
  `request.jwt.claims` nie gesetzt ist, sähe er auf RLS-Tabellen NICHTS. Ausweg:
  **`BYPASSRLS`** auf den App-User (Nicht-Owner, aber Bypass wie heute) —
  **Gating-Frage für IT: lässt Managed-Postgres (IBM Cloud) `BYPASSRLS` an einen
  Nicht-Superuser vergeben?** Andernfalls zieht die Idee P7 (Claims) nach vorn.

Sequenz falls verfolgt: (1) IT-Feasibility `BYPASSRLS`, (2) Migrations-Job als
Root + `SKIP_MIGRATIONS` auf App-Pods, (3) App-User (DML + `BYPASSRLS`) anlegen,
`DATABASE_URL` umbiegen. Additiv, e2e-verifizierbar, verbaut P7 nicht.

## Ist-Analyse (verifiziert)

**Es gibt bereits 12 RLS-Tabellen mit Policies** (`lib/db/schema.ts`): `ownsRow`
= `auth.uid() = user_id` (profiles, enrollments, lesson_progress, quiz_attempts,
annotations, training_assignments) und `isStaffRole` =
`auth.role() in ('curator','admin')` (training_assignments, retention_purge_runs,
roles, role_capabilities, role_assignments, audit_log). Einige Tabellen sind
bewusst policy-frei (authoring_tokens, lesson_chunks, course_index_state) =
nur serverseitig sichtbar.

**Warum sie trotzdem nicht greifen — drei Ursachen, alle gleichzeitig wahr:**

1. **Owner-Bypass.** Die App verbindet als **DB-Owner** (`fiknow` in Prod,
   `postgres` lokal — `deploy/RUNBOOK.md`, `deploy/deploy-ibmcloud.md`). Ein
   Owner umgeht RLS per Postgres-Default, solange nicht `FORCE ROW LEVEL
   SECURITY` gesetzt ist. **`FORCE` ist nirgends gesetzt** (repo-weit 0 Treffer).
2. **Kein Session-Claim-Setup.** Nichts im Code setzt je
   `request.jwt.claim.sub` / `request.jwt.claims` (kein `set_config`/`SET LOCAL`
   für echte Requests). `auth.uid()`/`auth.role()` lesen also GUCs, die nie
   gefüllt sind → immer `NULL`/kein Match.
3. Die `auth.*`-Funktionen **existieren** in Prod (werden bei jedem Boot via
   `lib/db/auto-migrate.ts` + `instrumentation.ts` angelegt) — sie ins Leere
   laufen zu lassen liegt an (1)+(2), nicht an fehlenden Funktionen.

(1) und (2) sind **je für sich** hinreichend. Ein einzelner Fix genügt also
nicht — beide Achsen müssen adressiert werden.

**Der Kern-Konflikt:** Dieselbe Owner-Connection bedient **beide** Zugriffsarten:
- **Nutzer-bezogene Reads**, die eingegrenzt sein *sollten* (eigene Zeilen).
- **Privilegierte Server-Operationen**, die bewusst RLS umgehen *müssen* —
  namentlich: `getComplianceOverview()` (liest ALLE User),
  `reconcile.ts` (cross-user Writes), `annotations.ts`, RAG (`lesson_chunks`),
  Reconciler/Completion-Writes auf `training_assignments`, `audit_log`-Writes.

RLS wirksam zu machen heißt zwingend, diese zwei Modi **zu trennen** — sonst
bricht man entweder die privilegierten Pfade oder erreicht keine Trennung.

**Payload ist separat.** Payload nutzt einen eigenen node-postgres-Pool
(`payload.config.ts`), gleiche `DATABASE_URL`/Owner-Rolle, aber ein isoliertes
Schema `payload` — und hat auf seinen Collections **gar keine RLS**. Payloads
Admin-Zugang wird über `proxy.ts` (Login-Gate) geschützt, nicht über RLS. P7
sollte Payload NICHT anfassen (kein neuer Payload-Kopplungspunkt,
vgl. [[minimize-payload-coupling]]).

**Scope steckt NICHT in den Policies.** Die vorhandenen Policies prüfen nur
Ownership (`user_id`) und Staff-Rolle — **kein Land/BU**. Selbst wenn RLS
griffe, würde es die ADR-0007-**Scope**-Trennung (Land/BU) NICHT durchsetzen.
Wichtiger noch: der App-seitige Scope-Filter löst gegen die **aktuelle** Org
(`profiles.land/bu`) auf (ADR 0007 §3, P2b-Korrektur), nicht gegen die
Zeilen-eigenen Snapshot-Spalten — RLS sieht aber nur die Spalten der Zeile, kein
Join auf die aktuelle Profil-Zugehörigkeit. Scope-aware RLS wäre also nicht nur
groß, sondern semantisch schlechter als der App-Filter.

## Zielbild & Nicht-Ziele

**Ziel (v1):** die *vorhandenen* Ownership-/Staff-Policies **real wirksam**
machen — so, dass ein App-Bug einen fremden **User**-Datensatz nicht mehr leaken
kann und Nicht-Staff die Staff-Tabellen DB-seitig nicht sehen. Das ist das
fehlende Defense-in-Depth-Netz unter dem App-Code.

**Ausdrücklich NICHT-Ziel (v1):** **scope-aware RLS** (Land/BU DB-seitig
erzwingen). Begründung oben: großer Aufwand, current-org-Semantik in RLS kaum
sauber abbildbar, dupliziert den App-Filter mit schlechterer Semantik. Die
Land/BU-Durchsetzung bleibt **App-seitig** (P2b/P3). Falls je gewünscht, ist das
ein eigener, späterer Schritt (P7b) — nicht Teil dieses Aufrisses.

## Optionen (Mechanismus)

### Option A — Zwei Rollen / zwei Pools (empfohlen)
- Eine **privilegierte „service"-Rolle** (Owner bzw. `BYPASSRLS`) für Server-/
  Admin-/Cron-/Reconcile-/Aggregat-Pfade + Payload — umgeht RLS wie heute.
- Eine **eingeschränkte „authenticated"-Rolle** (Nicht-Owner, kein BYPASSRLS →
  RLS greift automatisch) für **nutzer-bezogene, request-scoped Reads**. Pro
  Request in einer Transaktion `SET LOCAL request.jwt.claims = '{sub,role}'`,
  dann feuern `ownsRow`/`isStaffRole`.
- **Vorteile:** Default-Deny by construction (vergisst man den Claim → kein
  Zugriff, sicher); klarer Schnitt privilegiert vs. eingeschränkt;
  Industrie-Standard (Supabase-Muster); `FORCE RLS` nicht nötig (Nicht-Owner
  unterliegt RLS ohnehin).
- **Kosten:** neue DB-Rolle + GRANTs provisionieren (Deploy/Runbook); zweiter
  Pool in `lib/db/client.ts`; ein Transaktions-Wrapper, der die Claims setzt;
  jeden Read-Pfad bewusst einer Rolle zuordnen.

### Option B — Ein Owner-Pool + `FORCE RLS` + Service-Claim-Bypass
- Bei einem Pool bleiben, aber `ALTER TABLE … FORCE ROW LEVEL SECURITY`, damit
  auch der Owner RLS unterliegt. Privilegierte Pfade brauchen dann einen
  expliziten Bypass (z. B. permissive Policy `… OR current_setting(role)='service'`
  + Service-Claim in den privilegierten Aufrufen).
- **Vorteile:** keine zweite Rolle/kein zweiter Pool.
- **Kosten/Risiko:** `FORCE RLS` auf dem geteilten Pool macht **alle** Pfade auf
  einen Schlag scharf — Big-Bang-Bruchgefahr; der Bypass hängt an einem
  korrekt gesetzten Claim in JEDEM privilegierten Pfad (vergisst man ihn →
  Ausfall; setzt man ihn zu breit → stiller Voll-Bypass). Fragiler, schlechter
  stagebar.

**Empfehlung: Option A** — sicherer Default (deny), sauber stagebar, kein
Big-Bang.

## Bruchstellen / was NICHT bricht
- **Bleiben auf der privilegierten Rolle** (unverändert): `getComplianceOverview`,
  `reconcile`, Completion-Writes, `audit_log`-Writes, RAG/`lesson_chunks`,
  `authoring_tokens`, `annotations`-Server-Writes, Purge, alle CLIs/Cron.
- **Payload-Pool** bleibt privilegiert und unangetastet.
- **Wandern auf die eingeschränkte Rolle** (kandidatenweise, geprüft): die
  nutzer-eigenen Reads (eigene Enrollments/Progress/Quiz-Attempts/Annotations/
  Assignments), wo RLS die App-Prüfung spiegeln soll.

## Rollout (additiv, `main` bleibt shippable)
1. **Provisioning + Rolle dormant:** eingeschränkte Rolle + GRANTs anlegen
   (Runbook/Migration), zweiter Pool gebaut, aber **noch nicht genutzt**. Kein
   Verhaltensunterschied.
2. **Claim-Setup-Infra:** Transaktions-Wrapper, der `SET LOCAL request.jwt.claims`
   setzt — zunächst nur von einem opt-in-Testpfad benutzt.
3. **Shadow/Verify:** eine kanonische Nutzer-Query gegen beide Pools laufen und
   Ergebnis-Gleichheit prüfen (e2e mit echter Postgres — Muster wie
   `audit.spec.ts`), bevor scharfgeschaltet wird.
4. **Pfad-für-Pfad-Migration** der nutzer-bezogenen Reads auf die eingeschränkte
   Rolle, je einzeln verifiziert. App-seitiges Scoping bleibt die **primäre**
   Durchsetzung, RLS wird die zweite Ebene darunter.
5. **Nie** `FORCE RLS` global auf dem Owner-Pool in einem Schritt.

## Entscheidungen für den Fall einer Neubewertung (durch obige Entscheidung vorerst obsolet)

> Punkte 1–2 sind durch die Zurückstellung gegenstandslos; 3–4 nur relevant,
> falls P7 später doch gebaut wird. Belassen als Referenz.

1. **Umfang v1:** nur Ownership/Staff-RLS wirksam (empfohlen) — oder doch
   scope-aware (Land/BU) DB-seitig (groß, semantisch heikel, m. E. nein)?
2. **Mechanismus:** Option A (zwei Rollen/Pools, empfohlen) vs. B (FORCE +
   Service-Claim)?
3. **DB-Provisioning-Hoheit:** Wer legt die eingeschränkte Rolle + GRANTs in den
   Ziel-DBs an (IBM Cloud / Managed-Postgres) — FIKNOW-Team oder IT? Auto-Migrate
   läuft heute als Owner; eine zweite Rolle braucht ggf. einen manuellen
   Provisioning-Schritt.
4. **Aufwand/Nutzen jetzt:** Der reale Restnutzen ist Defense-in-Depth gegen
   App-Bugs bei *User-Ownership* — die *Scope*-Trennung (der ADR-0007-Kernbedarf)
   bliebe ohnehin App-seitig. Lohnt der Umbau jetzt, oder als bewusst
   zurückgestellter Härtungs-Track?

## Housekeeping-Befund (nebenbei)
Stale Referenzen im Code auf ein nicht existierendes `scripts/setup-auth.sql`
und auf „GoTrue" (Altlast aus einem früheren Supabase-Design) in
`lib/db/auto-migrate.ts`, `lib/db/schema.ts`, `lib/auth/provider/types.ts`,
`instrumentation.ts`. Kein Funktionsfehler, aber irreführend — separat
aufräumen (nicht Teil von P7).

## Konsequenzen (falls P7 nach Option A gebaut wird)
- Neue DB-Rolle + GRANT-Verwaltung (Deploy-Prozess-Änderung).
- Zweiter Pool + Claim-setzender Transaktions-Wrapper in `lib/db/client.ts`.
- Read-Pfade explizit einer Rolle zugeordnet (privilegiert vs. eingeschränkt).
- Payload unberührt; App-seitiges Scoping (P2b/P3) bleibt maßgeblich.
- MCP-/Authoring-Pfad: schreibt über die privilegierte Rolle → unverändert
  (stehende Regel geprüft: keine Enforcement-Änderung dort).
