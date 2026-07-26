# ADR 0007 — Mandanten-Scoping & Auswerte-Ebenen für Compliance-Nachweise

- **Status:** Proposed / Geplant — **nicht implementiert.**
- **Datum:** 2026-07-26
- **Kontext-Phase:** Compliance / Zugriffssteuerung
- **Betroffene Bereiche:** `training_assignments`, `profiles` (beide
  `lib/db/schema.ts` — neue Felder geplant), `lib/auth/roles.ts` +
  `lib/auth/provider/oidc/role-map.ts` (Scope-Dimension zusätzlich zur
  App-Rolle, Keycloak-Gruppen-Mapping), `lib/training/compliance.ts` +
  `lib/training/compliance-compute.ts` (Compliance-Dashboard — künftig zwei
  Sichten: namentlich vs. aggregiert), neue Tabelle `audit_log` (Drizzle),
  Keycloak-Gruppenmodell (Entity/OpCo-Claim).
- **Verwandt:** [[0005-pflichtkurse-und-compliance-nachweis]],
  [[0006-datenschutz-aufbewahrung-und-loeschung]], `docs/ROADMAP.md`
  (Abschnitt „Zielgruppen-/BU-Sichtbarkeit" + „Mandantierung", bislang
  bewusst zurückgestellt).

---

## Kontext

Auslöser: ein Kollegen-Review im BR-/BV-Kontext (Punkte 6 und 7). Für die
Auswertung der Pflichtkurs-Nachweise (ADR 0005) sollen künftig zwei weitere
Parteien zugreifen können — **HR** und die **Geschäftsführungen der
einzelnen OpCos** — aber nicht gleichberechtigt und nicht mit demselben
Detailgrad. Der Bestand kann das heute in drei Punkten nicht abbilden:

1. **Kein Entity-/OpCo-Feld.** `training_assignments` (ADR 0005) kennt
   `userId`, `courseSlug`, Zeitstempel und Content-Snapshot — aber keine
   Zugehörigkeit zu einer Gesellschaft. „GF sieht nur die eigene Gesellschaft"
   ist damit nicht baubar; es gibt kein Feld, nach dem gefiltert werden könnte.
2. **Kein Audit.** Es wird nirgends protokolliert, wer wann Nachweise oder das
   Compliance-Dashboard eingesehen, einen namentlichen Drill-down geöffnet,
   einen Export gezogen — oder wer einen Kurs hochgeladen/editiert/publiziert
   hat. Yves möchte den Audit-Gedanken bewusst breiter fassen als nur
   Dashboard-Views: auch der Content-Authoring-Lebenszyklus soll
   nachvollziehbar sein. Grundbedürfnis ist Nachvollziehbarkeit, nicht nur
   Zugriffskontrolle.
3. **Rein rollenbasierte, immer namentliche Auswertung.** `getComplianceOverview()`
   (`lib/training/compliance.ts`) liefert für jeden mit `canManageCourses` (also
   jeden Curator/Admin, `lib/auth/roles.ts`) die **volle namentliche
   Teilnehmerliste** über alle Kurse — kein Aggregat, keine Abstufung. Für GF,
   die nur Steuerungszahlen braucht, ist das mehr Einblick als nötig
   (Datensparsamkeit) und für HR, die nur die eigene Gesellschaft betreut, zu
   viel (Mandantentrennung fehlt).

Diese ADR entscheidet das **Zielbild** (Entity als erste Klasse, gestufte
Scopes, Audit-Log) und benennt bewusst, was **App-seitige Behelfslösung** ist
und was auf DB-Ebene nachgezogen werden muss. Sie erfindet keine Entity-Quelle,
kein Gruppen-Namensschema und keinen Backfill-Plan — das sind offene
Org-/DSB-Fragen (siehe Ende).

## Entscheidung

### 1. Entity-/OpCo-Zuordnung als erste Klasse

Eine Person gehört zu genau einer Gesellschaft (OpCo/Entity). Quelle
(empfohlen, nicht final entschieden): **Keycloak-Gruppe oder -Claim**,
gemappt über die bestehende `role-map.ts`-Infra — die liest bereits
`groups` aus den Token-Claims (`extractRoleKeys()` in
`lib/auth/provider/oidc/role-map.ts` zieht heute schon Gruppenpfade wie
`/FIKNOW/Curators` heran, um Rollen zu bestimmen). Dieselbe Infra kann
künftig zusätzlich eine Entity-Gruppe (z. B. `/FIKNOW/Entity/<OpCo>`) lesen
und in die Session heben — kein neuer Claims-Mechanismus, nur eine zweite
Auswertung derselben Quelle.

- **Am Nachweis eingefroren.** Analog zu `courseVersionSnapshot`
  (ADR 0005 §2 — Content-Snapshot im append-Record) wird die Entity beim
  Reconcile/Abschluss zusätzlich in `training_assignments` gesnapshottet
  (neues Feld, z. B. `entitySnapshot`). Begründung: historische Korrektheit.
  Ein Nachweis muss belegen, zu welcher Gesellschaft die Person **beim
  Abschluss** gehörte — nicht, wo sie heute (nach einem Wechsel/Austritt)
  geführt wird. Das ist dieselbe Snapshot-Logik, die ADR 0005 bereits für
  Kurstitel/-version etabliert hat, nur auf ein weiteres Feld angewandt.
- **Zusätzlich lebt die aktuelle Entity am Profil** (`profiles`, neues Feld)
  für Live-Sichten (z. B. „wer gehört heute zu OpCo X" für neue Zuweisungen,
  GF-Auflistung aktiver Mitarbeiter unabhängig von Nachweisen).
- **OFFEN — als Org-/IT-/DSB-Klärung markiert, nicht hier entschieden:**
  exakte Entity-Quelle (HR-System vs. Keycloak-Gruppen vs. manuelle Pflege),
  Gruppen-Namensschema, Backfill der Entity für Bestandsnutzer und bereits
  abgeschlossene Bestandsnachweise (die heute kein Entity-Feld haben und
  rückwirkend nicht zuverlässig zugeordnet werden können, wenn die Quelle
  erst später entschieden wird).

### 2. Gestufte Auswerte-Ebenen (Scopes), orthogonal zu den App-Rollen

Zusätzlich zur bestehenden App-Rolle (`learner`/`curator`/`admin`/`suspended`,
`lib/auth/roles.ts`) wird eine **Scope-Dimension** eingeführt, ebenfalls aus
Keycloak-Gruppen gemappt:

- **HR** — namentlich, beschränkt auf die eigene(n) Gesellschaft(en). Sieht
  denselben Teilnehmer-Drill-down wie heute Curator/Admin (ADR 0005 §5), aber
  gefiltert auf `entitySnapshot ∈ eigene Entities`.
- **GF / OpCo-Lead** — aggregiert, eigene Gesellschaft. Sieht nur Kennzahlen:
  Erfüllungsquote und Anzahl überfälliger Fälle je Kurs/Gesellschaft. **Keine
  Namen.**
- **Manager (optional, v2)** — namentlich, eigenes Team. Braucht ein
  Team-/Führungsmodell, das heute nicht existiert (ADR 0005 „Konsequenzen":
  Gruppen-/Team-Targeting fehlt) — hier nur vorgemerkt, nicht Teil dieser
  Umsetzung.

**Warum Scope ≠ App-Rolle:** Die bestehende Rolle beantwortet „was darf diese
Person in der App tun" (Kurse pflegen, Nutzer verwalten). Der Scope
beantwortet eine orthogonale Frage: „welchen Personenkreis und mit welchem
Detailgrad darf diese Person in der Auswertung sehen". Jemand kann `admin`
UND HR-gescopet sein (volle App-Rechte, aber Auswertung bleibt auf die eigene
Gesellschaft beschränkt); jemand kann `learner` sein und trotzdem
GF-gescopet (keine Kurs-Pflegerechte, aber Zugriff auf das Aggregat-Dashboard
der eigenen Gesellschaft). Eine einzelne Rollen-Hierarchie kann diese zwei
unabhängigen Achsen — Handlungsbefugnis vs. Sichtbarkeits-/Detailgrad — nicht
sauber abbilden; sie zu vermengen, würde entweder GF unnötig Namensvollzugriff
geben (Datensparsamkeitsverstoß) oder HR künstlich zu Admin machen (App-Rechte,
die HR nicht braucht). Getrennte Achsen halten das Prinzip der minimalen
Rechtevergabe in beiden Dimensionen unabhängig durchsetzbar.

### 3. Aggregierte GF-Sicht als eigene Dashboard-Variante

Die GF-Sicht ist kein Filter auf der bestehenden namentlichen Query, sondern
ein **eigener Loader**, der von vornherein nur Zähler je Entity zurückgibt
(Erfüllungsquote, Anzahl überfälliger Fälle) — keine Teilnehmernamen, keine
User-IDs im Response. Die Datensparsamkeit wird damit auf **Loader-/
Query-Ebene** erzwungen, nicht erst in der UI weggeblendet: ein Loader, der
niemals Namen liest, kann sie auch nicht versehentlich rendern oder über eine
Netzwerk-Response leaken. Das ist dieselbe Denkweise wie die
`retention_purge_runs`-Tabelle in ADR 0006 (PII-frei by construction, nicht
durch nachträgliche Filterung).

### 4. Durchsetzung vorerst App-seitig — RLS-Härtung als Vorbedingung für Defense-in-Depth

ADR 0006 („Konsequenzen/Hinweise") hält fest: die DB-RLS-Policies
(`training_assignments_select_own`/`_select_staff` in `lib/db/schema.ts`)
sind zur Laufzeit **faktisch wirkungslos**, weil die App über einen einzigen
voll-privilegierten Connection-Pool läuft und keine SSO-Claims in die
DB-Session setzt (`auth.uid()`/`auth.role()` lösen serverseitig nicht aus,
wie sie es müssten). `getComplianceOverview()` dokumentiert das offen im
eigenen Kommentar: sie liest bewusst über die privilegierte Server-Connection
„ALLE User, nicht nur die des Aufrufers" — Autorisierung läuft ausschließlich
über den App-seitigen Rollen-Check der aufrufenden Page.

Diese ADR baut ehrlich auf diesem Befund auf, statt ihn zu verdrängen:
**Scoping wird zunächst im App-Code durchgesetzt** — die Loader filtern nach
Entity + Scope, bevor Daten die Query verlassen bzw. bevor sie an die UI
gereicht werden. Es wird **nicht** so getan, als würde RLS diese Trennung
erzwingen; das wäre angesichts des ADR-0006-Befunds irreführend. Die
**RLS-Härtung** (SSO-Claims in die DB-Session heben, ggf. ein eigener,
weniger privilegierter Pool/Role pro Scope) ist ein separater, hier nur
referenzierter Track — und eine **Vorbedingung**, bevor Scoping als
DB-seitig erzwungen (Defense-in-Depth) gelten kann. Bis dahin ist ein Bug im
App-Code die einzige Verteidigungslinie gegen einen Cross-Entity-Leak — das
ist ein bewusst benanntes Risiko, kein verschwiegenes.

### 5. Append-only Audit-Log (breiter Scope, Punkt 6 des Reviews)

Neue Tabelle **`audit_log`** (Drizzle, append-only, analog zum
Append-only-Prinzip aus ADR 0005 für `training_assignments`):

- **Felder:** `actor` (userId + zum Zeitpunkt der Aktion geltende
  Rolle/Scope), `action`, `target` (Typ + ID), `entity`, `timestamp`.
  **Keine sensiblen Payloads/Rohdaten** — analog zur PII-Freiheit von
  `retention_purge_runs` (ADR 0006): das Log belegt, *dass* und *von wem*
  etwas geschah, nicht den vollen Dateninhalt.
- **Geloggt an drei Stellen:**
  1. **Compliance-Zugriff** — Dashboard-View, CSV-Export, namentlicher
     Drill-down (bezieht sich auf den Export aus ADR 0005 §5/Phase 6d).
  2. **Content-Authoring-Lebenszyklus** — Import/Upload/Publish/Unpublish/
     Edit/Delete von Kursen und Lernpfaden.
  3. **Admin-Aktionen** — Rollenänderung, User-Purge (vgl. ADR 0006 Phase 7b,
     `scripts/purge-user.ts`), Reindex.
- **Nuance, explizit festzuhalten:** Das Protokollieren, **wer** Nachweise
  einsieht, ist selbst eine Form der Überwachung von Beschäftigten — das
  Audit-Log unterliegt damit derselben Mitbestimmungslogik (§ 87 Abs. 1
  Nr. 6 BetrVG), die ADR 0006 als Auslöser für die gesamte Datenschutz-Serie
  benennt, und einer Transparenzpflicht gegenüber den protokollierten
  Personen selbst (nicht nur gegenüber den im Nachweis erfassten Lernenden).
  Diese ADR entscheidet das nicht abschließend, sondern hält die Pflicht zur
  BR-Abstimmung fest.
- **Retention:** Das Audit-Log unterliegt selbst der Aufbewahrungspolitik aus
  ADR 0006 (Datenklassen, Fristlogik) — es wird nicht als Sonderfall
  „für immer" geführt, sondern braucht eine eigene Einordnung (vermutlich
  Klasse A/Nachweis-nah, siehe offene Fragen).

## Begründung

- **Datensparsamkeit.** GF bekommt aggregierte Steuerungszahlen statt
  Namensvollzugriff — der Detailgrad ist an den tatsächlichen Bedarf
  gekoppelt, nicht an eine bereits vorhandene, aber zu grobe App-Rolle.
- **Nachvollziehbarkeit.** Ein Audit-Log über Zugriff **und**
  Content-Lebenszyklus schließt die Lücke, die ADR 0006 bereits für
  Löschvorgänge (PII-freie `retention_purge_runs`) geschlossen hat — jetzt
  konsequent auch für Lese-/Autoring-Zugriffe.
- **Mandantentrennung ohne Voll-Multi-Tenancy.** Ein Entity-Feld plus
  App-seitiger Scope-Filter reicht aus, um „GF sieht nur die eigene
  Gesellschaft" zu erfüllen, ohne die Plattform in getrennte Mandanten-
  Deployments oder -Schemata aufzuspalten — die auf der ROADMAP unter
  „Mandantierung" als größere, bewusst zurückgestellte Architekturfrage
  geführte Vollversion bleibt unangetastet und wird durch diese ADR nicht
  präjudiziert.
- **Ehrlicher Umgang mit dem RLS-Befund.** Statt RLS als Kontrolle zu
  behaupten, die es zur Laufzeit nicht ist (ADR 0006), wird die
  App-seitige Durchsetzung explizit als Übergangszustand benannt und die
  RLS-Härtung als benannte Vorbedingung für echtes Defense-in-Depth
  vorgemerkt.

## Konsequenzen

- **Neue Schema-Felder:** Entity am `profiles` (aktuelle Zugehörigkeit) und
  Entity-Snapshot an `training_assignments` (eingefroren beim Abschluss,
  analog `courseVersionSnapshot`).
- **Neue Keycloak-Gruppen/Claim-Mappings:** Entity-Gruppe zusätzlich zur
  bestehenden Rollen-Gruppe; Scope-Gruppen (HR/GF/optional Manager) analog
  zum bestehenden Rollen-Mapping in `role-map.ts`.
- **Zwei Dashboard-Sichten** statt einer: die bestehende namentliche Sicht
  (weiterhin für Curator/Admin/HR, jetzt Entity-gefiltert für HR) und eine
  neue aggregierte GF-Sicht mit eigenem Loader.
- **App-seitige Scope-Filter** in allen Compliance-Loadern
  (`lib/training/compliance.ts` und Folgeprodukte) — bis zur RLS-Härtung die
  einzige Durchsetzungsebene, mit dem entsprechenden Restrisiko.
- **Neue Tabelle `audit_log`** plus drei neue Logging-Integrationspunkte
  (Compliance-Zugriff, Authoring-Lebenszyklus, Admin-Aktionen) und eine
  eigene Retention-Einordnung nach ADR 0006.
- **Kein Ersatz für die ROADMAP-Mandantierung.** Diese ADR liefert
  Entity-Scoping für die Compliance-Auswertung, nicht eine vollständige
  Multi-Tenancy (getrennte Deployments, getrennte Content-Kataloge o. Ä.).

## Umsetzung in Phasen (geplant, nicht gebaut)

- **P1 — Entity-Feld + Snapshot + Keycloak-Mapping.** Neues Feld an
  `profiles` (aktuelle Entity) + neues Feld an `training_assignments`
  (Entity-Snapshot, beim Reconcile/Abschluss eingefroren) + Erweiterung von
  `role-map.ts`/`extractRoleKeys()` um eine Entity-Gruppen-Auswertung.
  Voraussetzung: Entity-Quelle und Gruppen-Namensschema geklärt (siehe offene
  Fragen).
- **P2 — HR-Scope.** Namentliche Sicht, gefiltert auf eigene Entity(s);
  Scope-Mapping (HR) analog zum Rollen-Mapping.
- **P3 — GF-Aggregat-Sicht.** Eigener Loader, der nur Zähler je Entity
  zurückgibt (Quote + überfällig), kein Namenszugriff möglich.
- **P4 — Audit-Log + Logging-Punkte.** Tabelle `audit_log`, Integration an
  den drei benannten Stellen (Compliance-Zugriff, Authoring-Lebenszyklus,
  Admin-Aktionen), Retention-Einordnung nach ADR 0006, BR-Abstimmung zur
  Nuance „Überwachung der Einsehenden".
- **P5 (optional) — Manager/Team-Scope + RLS-Härtung.** Team-Modell für
  Manager-Scope (baut auf dem in ADR 0005 als fehlend benannten
  Gruppen-/Team-Modell auf); RLS-Härtung (SSO-Claims in die DB-Session,
  ggf. eigener Pool/Role je Scope) als Vorbedingung, um App-seitiges Scoping
  durch echtes Defense-in-Depth auf DB-Ebene zu ergänzen.

Abhängigkeit/Verwandtschaft: knüpft an die ROADMAP-Zeile
„Zielgruppen-/BU-Sichtbarkeit" + „Mandantierung" an (bewusst zurückgestellt,
durch das Kollegen-Review jetzt für den Compliance-Ausschnitt getriggert,
ohne die größere Mandantierungsfrage zu präjudizieren) sowie an den
RLS-Befund aus ADR 0006 („Konsequenzen/Hinweise").

## Offene Org-/DSB-Fragen (nicht Teil dieser Entscheidung)

- Exakte **Entity-Quelle**: HR-System-Export, Keycloak-Gruppen, oder manuelle
  Pflege im Admin-Bereich?
- **Gruppen-Namensschema** in Keycloak für Entity und für die Scopes
  (HR/GF/Manager) — wer legt es fest, IT oder das FIKNOW-Team?
- **Backfill** der Entity für Bestandsnutzer und bereits abgeschlossene
  Bestandsnachweise, die kein Entity-Feld haben — rückwirkend zuordnen oder
  als „unbekannt/Altbestand" kennzeichnen?
- **Retention-Klasse des Audit-Logs**: Klasse A (nachweisnah, lange
  Aufbewahrung) oder eigene, kürzere Frist? Formal vom DSB abzunehmen,
  analog zur Klasse-A-Frist in ADR 0006.
- **Mitbestimmung**: Freigabe des Audit-Log-Konzepts (Punkt 5) durch den
  Betriebsrat, insbesondere die Protokollierung von Dashboard-/Nachweis-
  Zugriffen als Kontrolle der einsehenden Personen selbst.
- **Manager-Scope (P5):** ob und wie ein Team-/Führungsmodell überhaupt
  eingeführt wird — abhängig von einer HR-Datenquelle für Führungsbeziehungen,
  die heute nicht existiert.
