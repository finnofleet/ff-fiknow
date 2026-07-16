# ADR 0005 — Pflichtkurse & Compliance-Nachweis

- **Status:** Accepted · **Phase 1–4 live** (2026-07-03), e2e gegen Postgres
  verifiziert: P1 Datenmodell, P2 Reconciler+Completion, P3 „Meine
  Pflichtschulungen", P4 Compliance-Dashboard `/manage/pflichtkurse`.
  Umsetzungs-Abweichung ggü. Plan: Materialisierung läuft **lazy am Lesepunkt**
  statt via afterChange-Hooks (Transaction-Visibility + Orphan-Risiko, via
  Live-Test belegt). **Phase 5 (CSV-Audit-Export) parkiert** (Bedarf unklar,
  siehe ROADMAP „Später").
- **Datum:** 2026-07-03
- **Kontext-Phase:** Compliance / Tracking
- **Betroffene Bereiche:** Course-Content (`payload/collections/courses.ts` —
  neuer `mandatory`-Toggle + Slug-Härtung), neue Payload-Collection
  `training-requirements`, neue Drizzle-Tabelle `training_assignments`
  (`lib/db/schema.ts`), Completion-Trigger (`lib/progress.ts`), User-Ansicht
  („Meine Pflichtschulungen"), Compliance-Dashboard + CSV-Export (unter
  `app/(frontend)/manage/`)
- **Verwandt:** [[0001-mdx-bundle-als-source-of-truth-db-als-index]],
  [[0002-ki-tutor-und-annotations-schicht]], `LEARNER-FEATURES.md`, `ROADMAP.md`

---

## Kontext

Pflichtschulungen entstehen aus vielen Treibern — regulatorisch (z. B. EU AI
Act), Zertifizierungen (z. B. ISO 27001), Security-Awareness, arbeitsrechtliche
oder branchenspezifische Vorgaben. Für jeden dieser Nachweise muss die Plattform
belegen können: **wer** hat **welchen Pflichtkurs** in **welcher Inhaltsfassung**
**wann** absolviert — und wie hoch die Erfüllungsquote je Zielgruppe ist. Der
eigentliche Wert ist die **Nachvollziehbarkeit**, nicht die Zuweisung selbst.
Das Modell ist bewusst treiber-agnostisch: es kennt keinen einzelnen Standard,
sondern liefert den generischen „wer/was/wann"-Nachweis, den alle brauchen.

Der Bestand liefert das nicht:

1. **Kein Kurs-Abschluss auf Datenebene.** Abschluss existiert nur pro Lektion
   (`lesson_progress`, Drizzle). „Kurs zu 100 % fertig" wird on-the-fly
   berechnet (`lib/paths-progress-compute.ts`), **nie persistiert**, ohne
   Zeitstempel, ohne Historie, ohne Event/Hook. Das Abschluss-Signal, auf dem
   ein Nachweis beruht, muss erst erschaffen werden.

2. **Zwei getrennte Datenschichten.** Payload (Schema `payload`) hält Content
   (Courses/Sections/Lessons); Drizzle (Standard-Schema, mit RLS) hält
   User-Tracking (`enrollments`, `lesson_progress`, `quiz_attempts`). Beide
   teilen **keine Foreign Keys** — die Verknüpfung läuft überall über
   `courseSlug` als nominelle Text-Referenz (dokumentiert `lib/db/schema.ts`).

3. **`courseSlug` ist heute editierbar.** Das Slug-Feld hat kein `readOnly`
   (`courses.ts:42-51`), die Feldbeschreibung sagt sogar „Ändert die Kurs-URL".
   Da das *gesamte* Tracking auf `courseSlug` keyt, verwaist ein Rename schon
   heute still den Fortschritt aller Nutzer — ein latenter Bug, der für einen
   mehrjährigen Audit-Trail untragbar ist.

4. **Kein Gruppen-/Team-Modell, kein Cron, kein Mail-Versand, kein Eintritts-
   datum am Profil.** (Bestandsaufnahme, Stand 2026-07.)

## Entscheidung

### 1. „Pflicht" — eine Wahrheit, zwei Eingänge

Die Frage „Ist dieser Kurs Pflicht?" darf **genau eine** autoritative Antwort
haben, sonst korrumpiert der Nachweis. Gleichzeitig soll der häufige Fall
(„Pflicht für alle") ohne Umweg im Kurs-Editor setzbar sein.

- **Kurs-Toggle `mandatory` ("Pflichtkurs")** auf `courses`, in der Sidebar
  neben `tutorEnabled`. Semantik: **Pflicht für alle nicht-gesperrten User** —
  ausdrücklich **inkl. Curator/Admin**, nicht nur Rolle `learner`. Begründung
  (mit Yves bestätigt, 2026-07): Compliance-Pflichten adressieren typischerweise
  die **gesamte Organisation, alle Personen** — nicht eine App-Rolle. Das gilt
  für regulatorische (EU AI Act), Zertifizierungs- (ISO), Security- und
  arbeitsrechtliche Treiber gleichermaßen; Staff (Curator/Admin) aus dem Nachweis
  zu nehmen wäre eine Compliance-Lücke. Curatoren/Admins zählen daher in den
  Nenner der Erfüllungsquote. Default-Frist-Regel. Das ist der intuitive
  Autoren-Eingang und der v1-Mechanismus. (Impl.: `nonSuspendedUserIds` in
  `lib/training/reconcile.ts`.)
- **`training-requirements`** (neue Payload-Collection) für **feingranulare**
  Pflichten: bestimmte Rollen/einzelne User, abweichende Fristen,
  Rezertifizierungs-Intervall.
- **Ein Reconciler** liest beide Quellen und erzeugt daraus Assignments über
  **denselben** Pfad — der Kurs-Toggle wirkt wie eine implizite „alle
  Lerner"-Regel, wird aber **nicht** als Requirement-Zeile dupliziert. „Ist
  Pflicht" = `courses.mandatory` ODER es existiert eine aktive Requirement für
  den Kurs. So bleibt es eine Wahrheit trotz zweier Eingänge.

### 2. `courseSlug` bleibt Join-Key — wird aber gehärtet + im Nachweis eingefroren

Kein neuer Kurs-Identifier. Eine separate `courseId` würde die Konsistenz
brechen: die Auswertung muss Assignments gegen `enrollments`/`lesson_progress`
joinen (daher kommt „gestartet"), und die keyen auf `courseSlug`. Ein neuer Key
zwänge zur Migration des gesamten Trackings oder zu einer Slug↔ID-Map (die
selbst wieder auf Slug basiert) — netto schlechter. Stattdessen:

- **Slug nach Anlage unveränderlich** — `beforeChange`-Guard auf `courses`, der
  einen Slug-Wechsel an bestehenden Docs ablehnt (Rename nur über bewusste
  Migration, die alle Tracking-Zeilen mitzieht). Das stabilisiert den Key
  **systemweit**, nicht nur für Pflichtkurse.
- **Content-Snapshot im append-Record.** Beim Abschluss werden `courseSlug`,
  `courseTitle` und das `version`-Token *wie zum Abschlusszeitpunkt* in die
  Assignment-Zeile eingefroren. Der Nachweis wird ein in sich geschlossener
  historischer Fakt — er überlebt spätere Umbenennung, Inhaltsänderung oder
  Kurslöschung, weil ein Prüfer die Zeile liest, nicht einen Live-Join auflöst.
  (`courses.version` ist laut ADR 0001 ein Import-/Konflikt-Token, kein Semver —
  es belegt „welche Inhaltsfassung", nicht „Version 3".)

### 3. Zuweisung + Nachweis in Drizzle, append-only

Neue Tabelle **`training_assignments`** (Drizzle, neben `enrollments`), eine
Zeile pro User × Pflicht × Zyklus:

- `id`, `sourceType` (`course_mandatory` | `requirement`), `sourceId`
  (`courseSlug` bzw. Requirement-ID), `userId`, `courseSlug`, `assignedAt`,
  `dueDate`, `completedAt` (nullable), `courseTitleSnapshot`,
  `courseVersionSnapshot`, `cycle` (int), `evidence` (jsonb).
- **`completedAt` wird nie überschrieben; Zeilen werden nie gelöscht.** Jede
  Rezertifizierung ist eine neue Zeile mit `cycle+1`. Die Tabelle **ist** der
  Audit-Trail — die Historie „2024 gemacht, 2026 wiederholt" fällt automatisch
  ab.
- **Kein gespeichertes `status`-Feld.** Status wird beim Lesen abgeleitet:
  `completedAt` gesetzt → erledigt; sonst `dueDate < now` → überfällig; sonst
  offen. Das entkoppelt „überfällig" von einem Cron.
- **RLS wie im Bestand**: User sieht eigene Zeilen; Curator/Admin sehen alle.
  Kein `UPDATE`/`DELETE` für Nicht-Admins (append-only auch per Policy).

### 4. Completion-Trigger an einer Stelle

In `lib/progress.ts::markLessonCompleted`: wird die letzte Lektion eines Kurses
abgeschlossen (Abschluss-Definition = **alle Lektionen erledigt**, die heute
schon berechnete Bedingung), und existiert eine offene Assignment für
`(userId, courseSlug)`, dann `completedAt = now` setzen und den Content-Snapshot
einfrieren. Der eine zentrale Trigger-Punkt. (Quiz-bestanden als strengeres
Kriterium ist ein v1.1-Schalter.)

### 5. Auswertung misst Teilnehmer

Compliance-Dashboard je Kurs/Requirement:

- **Nenner = zugewiesene Teilnehmer** (die Pflicht-Zielgruppe), nicht „alle
  Eingeschriebenen". Quote = `abgeschlossen / zugewiesen`.
- **Drei Teilnehmer-Zustände** im Drill-down: *nicht gestartet* (Assignment da,
  keine Einschreibung/kein Progress) · *gestartet* (`enrollments.startedAt` bzw.
  `lesson_progress` vorhanden) · *abgeschlossen* (`completedAt` gesetzt).
- Drill-down-Spalten: *Teilnehmer · Status · Startdatum · Abschlussdatum*.
- **CSV-Export** aus derselben Query (reines `text/csv`-Response, kein neuer
  Stack). PDF optional später.

## Begründung

- **Append-only + Snapshot = belastbarer Nachweis.** Ein Audit-Record, der auf
  einen Live-Join angewiesen ist, ist so stabil wie sein instabilster Key. Das
  Einfrieren macht die Zeile selbsttragend; das Nicht-Überschreiben macht die
  Historie prüfbar. Beides zusammen ist der eigentliche EU-AI-Act-Wert.
- **Slug härten statt Key wechseln** löst das Stabilitätsproblem an der Wurzel
  und nützt dem gesamten Tracking (enrollments/progress), nicht nur den
  Pflichtkursen — mit minimalem Eingriff (ein Guard) statt einer Migration.
- **Eine Wahrheit, zwei Eingänge** verhindert den klassischen Compliance-Bug
  „Toggle sagt Pflicht, aber keine Zuweisung existiert" — beide Quellen laufen
  durch denselben Reconciler.
- **Status ableiten statt speichern** eliminiert die Cron-Abhängigkeit für den
  wichtigsten Zustand („überfällig") und hält v1 ohne Job-Infrastruktur
  lauffähig.
- **Drizzle statt Payload für Assignments**: konsistent mit
  `enrollments`/`lesson_progress`, RLS greift, die Auswertungs-Queries joinen
  ohne Cross-Schema-Umweg. Nur die *Regel* (`training-requirements`) lebt in
  Payload, weil sie Config ist (Admin-UI, Curator pflegt sie).

## Konsequenzen

- **Slug-Immutabilität ändert bestehendes Verhalten.** Umbenennen ist heute
  erlaubt; künftig nur über eine bewusste Migration. Das ist eine gewollte
  Einschränkung — die Feldbeschreibung in `courses.ts` wird entsprechend
  angepasst.
- **Rezertifizierung ist in v1 „best effort".** Ohne Cron wird der nächste
  Zyklus lazy beim Reconcile materialisiert (z. B. beim Öffnen der Ansichten),
  nicht garantiert termingenau. Robuste, termingesteuerte Rezertifizierung +
  Reminder brauchen die Job-Infrastruktur → v1.1.
- **Kein Mail/Reminder in v1** (explizit descoped). Fristampel ist rein
  visuell in der User-Ansicht.
- **Gruppen-Targeting fehlt.** v1 zielt auf Rolle (`learner`, via Toggle) bzw.
  Rolle/Einzel-User (via Requirements, v1.1). Abteilungs-/Team-Gruppen sind ein
  eigenes Modell → später bei Bedarf.
- **`sourceType`-Diskriminator** hält die Tür offen, Toggle- und
  Requirement-basierte Assignments in derselben Tabelle sauber
  auseinanderzuhalten (Reporting gruppiert primär nach `courseSlug`).

## Umsetzung in Phasen (v1)

- **Phase 1 — Datenmodell.** Drizzle-Migration `training_assignments` (+ RLS,
  append-only-Policies); `mandatory`-Toggle + Slug-`beforeChange`-Guard auf
  `courses`; Payload-Collection `training-requirements` (Schema angelegt,
  Reconcile folgt in P2). *Delegierbar nach fixer Spec.*
- **Phase 2 — Reconcile + Completion-Trigger.** `reconcileAssignments()`
  (Toggle + Requirements → Assignments, idempotent); Completion-Trigger in
  `lib/progress.ts`; lazy Rezertifizierung. *Kernlogik — Hauptthread.*
- **Phase 3 — „Meine Pflichtschulungen".** User-Ansicht mit Fristampel, baut auf
  `dashboard/`.
- **Phase 4 — Compliance-Dashboard.** Quote + Teilnehmer-Drill-down unter
  `manage/`, Access `canManageCourses`/`canManageUsers`.
- **Phase 5 — CSV-Audit-Export.** Aus derselben Query.

**Descoped auf v1.1:** Mail-Reminder + Eskalation, Cron/Job-Infrastruktur,
termingenaue Rezertifizierung, feingranulares Requirements-Targeting über den
„alle Lerner"-Toggle hinaus, Gruppen-/Team-Modell, PDF-Export, Quiz-als-
Abschlusskriterium.
