# ADR 0007 — Rollen, Rechte & Mandanten-Scoping für die Compliance-Auswertung

- **Status:** Proposed / Geplant — **nicht implementiert.**
- **Datum:** 2026-07-26 (Modell grundlegend überarbeitet 2026-07-27 nach
  Architektur-Durchsprache — zwei-Achsen-Modell, Matrix statt Baum,
  App-verwaltete Autorisierung mit KC-Adapter).
- **Kontext-Phase:** Compliance / Zugriffssteuerung / Autorisierung
- **Betroffene Bereiche:** `lib/auth/roles.ts` (Capability-Definitionen —
  heute Single-Role, künftig additive Rollen + feste Capabilities),
  `lib/auth/provider/oidc/role-map.ts` + `config.ts` (Adapter KC→Domäne),
  `lib/auth/provider/oidc/session.ts` + `index.ts` (Session trägt heute nur
  `sub/email/name/role`; `profiles` ist server-seitig autoritativ),
  `profiles` + `training_assignments` (`lib/db/schema.ts` — neue Felder für
  Land/BU-Zugehörigkeit + Snapshot), `training-requirements` (ADR 0005 —
  optionale Land/BU-Zieldimension, Default „alle"), `lib/training/compliance.ts`
  + `lib/training/compliance-compute.ts` (Compliance-Dashboard — künftig zwei
  Sichten: namentlich vs. aggregiert), neue Tabellen `roles`,
  `role_capabilities`, `role_assignments`, `audit_log` (Drizzle),
  neue `/manage`-Oberfläche (Rollen-Matrix + Rechte-Inspektor).
- **Verwandt:** [[0005-pflichtkurse-und-compliance-nachweis]],
  [[0006-datenschutz-aufbewahrung-und-loeschung]], `docs/ROADMAP.md`
  (Abschnitt „Zielgruppen-/BU-Sichtbarkeit" + „Mandantierung", bislang
  bewusst zurückgestellt).

---

## Kontext

Auslöser: ein Kollegen-Review im BR-/BV-Kontext (Punkte 6 und 7). Für die
Auswertung der Pflichtkurs-Nachweise (ADR 0005) sollen künftig weitere
Parteien zugreifen können — **HR**, die **Geschäftsführungen/Leitungen der
einzelnen Gesellschaften**, eine **Gruppenleitung** und zentrale
**Competence Center / Group Functions** (z. B. People & Culture) — aber nicht
gleichberechtigt und nicht mit demselben Detailgrad. Der Bestand kann das
heute nicht abbilden:

1. **Kein Entity-Feld.** `training_assignments` (ADR 0005) kennt `userId`,
   `courseSlug`, Zeitstempel und Content-Snapshot — aber keine Zugehörigkeit
   zu einer Gesellschaft. „Leitung sieht nur die eigene Gesellschaft" ist
   damit nicht baubar; es gibt kein Feld, nach dem gefiltert werden könnte.
2. **Kein Audit.** Es wird nirgends protokolliert, wer wann Nachweise oder das
   Compliance-Dashboard eingesehen, einen namentlichen Drill-down geöffnet,
   einen Export gezogen — oder wer einen Kurs hochgeladen/editiert/publiziert
   hat. Der Audit-Gedanke soll bewusst breiter sein als nur Dashboard-Views:
   auch der Content-Authoring-Lebenszyklus soll nachvollziehbar sein.
3. **Rein rollenbasierte, immer namentliche, immer globale Auswertung.**
   `getComplianceOverview()` (`lib/training/compliance.ts`) liefert für jeden
   mit `canManageCourses` (also jeden Curator/Admin, `lib/auth/roles.ts`) die
   **volle namentliche Teilnehmerliste über alle Gesellschaften** — kein
   Aggregat, keine Abstufung, keine Mandantentrennung.

Diese ADR entscheidet das **Modell** (zwei orthogonale Achsen: additive Rechte
vs. Sicht-Scope; Matrix-Dimensionen; App-verwaltete Autorisierung mit
KC-Adapter; Audit-Log) und benennt bewusst, was **App-seitige Behelfslösung**
ist und was auf DB-Ebene nachgezogen werden muss.

Das Modell ist das Ergebnis einer expliziten Architektur-Durchsprache; die
begrifflichen Feinheiten (insbesondere die zwei „alle": *darf alles* vs.
*sieht alles*) sind unten bewusst unmissverständlich formuliert, weil ein
Missverständnis dort direkt zu falschen Rechtevergaben führt.

## Entscheidung

### 1. Zwei orthogonale Achsen: Rechte (additiv) ∥ Scope (Sichtfilter)

Das Bestandsmodell ist **eine** Achse: eine Single-Role mit Hierarchie
(`suspended < learner < curator < admin`, „höchste gewinnt", `roles.ts`).
Das ersetzen wir durch **zwei unabhängige Achsen**:

- **Achse A — Rechte.** Was jemand *tun/sehen darf*. Additiv: eine Person hält
  ein *Set* von Rollen, effektive Rechte = **Vereinigung**. Keine Hierarchie.
- **Achse B — Scope.** *Welche Zeilen* jemand sieht. Ein reiner Sichtfilter
  über die Subjekt-Dimensionen (§3). Gewährt nie ein Recht, grenzt nur ein.

**Die zwei „alle" — unbedingt auseinanderhalten:**

- **„darf alles"** = *alle Capabilities* (Kurse verwalten, Nutzer verwalten …).
  Das ist **Admin**. Eine Achse-A-Aussage.
- **„sieht alles"** = *alle Entitäten* (alle Länder, alle BUs). Das ist die
  **Gruppenleitung / ein group-level CC**. Eine Achse-B-Aussage.

Eine Gruppenleitung ist **nicht** „Admin mit allen Rechten": sie hat *wenige*
Capabilities (im Zweifel nur `compliance:view-aggregate`), aber unbeschränkte
**Breite**. Würde man Breite über die Rechte-Achse ausdrücken, bekäme sie
versehentlich Kurs-/Nutzerverwaltung — ein Verstoß gegen minimale
Rechtevergabe. Genau deshalb sind die Achsen getrennt.

**Warum getrennt (Begründung):** Eine einzelne Rollenhierarchie kann
„Handlungsbefugnis" und „Sichtbarkeits-/Detailgrad" nicht sauber abbilden;
sie zu vermengen gäbe entweder der Leitung unnötig Namensvollzugriff
(Datensparsamkeitsverstoß) oder machte HR künstlich zu Admin (App-Rechte, die
HR nicht braucht). Getrennte Achsen halten das Prinzip der minimalen
Rechtevergabe in beiden Dimensionen unabhängig durchsetzbar. Dies ist das
etablierte Muster von Azure RBAC (Rolle × Scope) und AWS IAM
(Policy + Resource-Condition).

### 2. Rechte-Achse: feste Capabilities (Code) + frei benennbare Rollen (Matrix)

- **Capabilities = feste Liste im Code.** Jede wird irgendwo im Code
  *durchgesetzt* und kann daher nicht in der UI „erfunden" werden — analog zu
  Confluences fixen Berechtigungstypen (View/Edit/Admin). Startvokabular:
  - `courses:manage` — Kurse/Bundles importieren, publishen, löschen
  - `users:manage` — Rollen ändern, sperren
  - `compliance:view-named` — namentlicher Teilnehmer-Drill-down *(scoped)*
  - `compliance:view-aggregate` — nur Kennzahlen je Entity *(scoped)*
  - `compliance:export` — CSV-Audit-Export *(scoped)*
  - `audit:view` — Audit-Log lesen
  - `reindex:run` — RAG-Reindex auslösen

  *(scoped)* markiert Capabilities, die über **entitäts-eigene Daten** laufen
  und deshalb einen Scope (§3) auswerten. Die übrigen sind
  plattformweit und kennen keinen Scope (siehe §5, „Admin außerhalb der
  Scope-Welt").
- **Rollen = frei benennbar, DB-verwaltet** (`roles`-Tabelle): „P&C-HR",
  „Leitung CH", „BU-Lead Payments", „Gruppen-Controlling" — beliebiger Name.
- **Rollen × Capabilities = editierbare Matrix** (`role_capabilities`), im
  `/manage`-Bereich pflegbar. Das ist das Confluence-artige Rechte-Grid:
  Rolle ankreuzen, welche Capabilities sie trägt.
- **Der `learner`-Grundzustand** bleibt implizit (jeder darf lernen, außer
  gesperrt) und ist keine verwaltete Rolle. **`suspended`** ist **kein
  additives Rollenmitglied**, sondern ein Deny-all-**Status** obendrauf (so
  behandelt der Code es faktisch schon) — sonst bräche „additiv".

### 3. Scope-Achse: Matrix-Dimensionen, nicht Baum

Die Org-Realität (Stand Durchsprache): 3 Ländergesellschaften; darin
fachliche **Business Units, die teils über 2 der 3 Länder spannen**; darüber
eine Gruppenleitung; quer dazu group-level Competence Center. Eine BU, die
2 von 3 Ländern überspannt, ist in **keinem Baum** abbildbar — Legal Entity
und Business Unit sind **orthogonal**. Daher: **zwei unabhängige Dimensionen**,
keine Hierarchie.

- **Dimension „Land"** — 3 Werte. Eine Person ist bei genau einer angestellt.
- **Dimension „Business Unit"** — N Werte, cross-country ist der Normalfall.

**Snapshot am Nachweis (analog `courseVersionSnapshot`, ADR 0005 §2):** beim
Abschluss werden `{land, bu}` der Person in `training_assignments` eingefroren
— der unveränderliche Fakt „gehörte zu Land X / BU Y, als bestanden wurde".
Offene/unfertige Assignments bleiben ohne Snapshot (`null`). **Sichtbarkeit**
wird zur Query-Zeit gegen die *aktuelle* Org aufgelöst; Reorganisationen der
BU-Struktur korrumpieren so keine Altnachweise. Zusätzlich lebt die
**aktuelle** Zugehörigkeit am `profiles`-Record (für Live-Sichten und neue
Zuweisungen).

**Scope-Semantik — allgemein und einheitlich:**

> **Ein Grant/Scope = UND über die Dimensionen. Sichtbarkeit einer Person =
> ODER über ihre Zuweisungen.**

Repräsentation je Zuweisung: pro Dimension eine Werteliste, wobei
*keine Einschränkung (null)* „alle" bedeutet:

- `{land: [CH]}` → alle CH-Nachweise (alle BUs darin)
- `{bu: [Payments]}` → alle Payments-Nachweise (alle Länder)
- `{land: [CH], bu: [Payments]}` → nur der Schnitt CH∩Payments
- `{land: null, bu: null}` → **alles** (Gruppenleitung / group-level CC)

Überlappungen (CH-Payments ist für CH-HR *und* Payments-Lead sichtbar) fallen
automatisch richtig heraus. Wer mehrere Zuweisungen hält, sieht deren
Vereinigung.

**Variante (A) gewählt** (gegen (B) „globale Rolle per Definition"): „Breite =
alle" ist ein **expliziter, erstklassiger Scope-Wert** (`null` je Dimension) am
*selben* View-Rollentyp — nicht eine eigene globale Rolle. Vorteile: kein
Rollen-Wildwuchs (nicht „Länder-HR" *und* „Gruppen-HR"), und **kein
Hybrid-Risiko** „welche Rollen ignorieren eigentlich den Filter?" — jede
scoped Zuweisung geht durch denselben Filter, global ist schlicht
`WHERE true`. Die Lesbarkeit, die (B) im Rollennamen gehabt hätte, liefert
stattdessen der **Rechte-Inspektor** (§8).

### 4. Kurs-/Anforderungs-Targeting (dieselben Dimensionen, Default = „alle")

Neben dem **Betrachter-Scope** (§3 — *wer sieht welche Nachweise*) gibt es eine
zweite, unabhängige Frage: **für wen gilt ein Kurs (verpflichtend)** — group-weit
oder auf Land/BU eingegrenzt. Beide sind sauber getrennt und dürfen nicht
verwechselt werden:

- **Ein Nachweis trägt immer das `{land, bu}` der Person** (§3-Snapshot) — die
  „Breite" eines Kurses ändert das nicht. Ein group-weiter Pflichtkurs
  (Datenschutz, AI-Act-Basics) erzeugt für eine Person in CH/Payments einen
  Nachweis `{CH, Payments}`; CH-HR sieht ihn (Land-Match), Payments-BU-Lead
  sieht ihn (BU-Match). Kurs-Globalität kompliziert die Betrachter-Seite also
  **nicht**.
- **Targeting nutzt dieselbe `null = alle`-Primitive.** Eine
  `training-requirement` **ohne** Land/BU-Angabe gilt für **alle** — das ist der
  **Default**, kein Sonderfall. Optionales Eingrenzen auf Land/BU ist die
  Ausnahme; man wird **nie gezwungen**, einem Kurs einen Scope zu geben.

**Verortung:** ein *optionaler* Land/BU-Filter als zusätzliche Zieldimension an
`training-requirements` (ADR 0005 targetet heute Rolle/User). Das berührt nur,
*wer ein Assignment bekommt* (Reconciler), nicht die Betrachter-Logik. Die
Umsetzung reitet auf P2 mit (dieselben Dimensionsfelder).

**Bewusst draußen:** die **Katalog-Sichtbarkeit** („welche BU *sieht* welchen
Kurs überhaupt im Katalog") ist der größere ROADMAP-/Vertraulichkeits-Track
(„Zielgruppen-/BU-Sichtbarkeit"), nicht Teil der Compliance-Auswertung und
nicht dieser ADR.

### 5. Detailgrad ist ein Recht, nicht ein Scope. Admin steht außerhalb.

Der alte ADR-Begriff „Scope (HR/GF)" **vermischte** Detailgrad (namentlich vs.
aggregiert) und Entität. Das wird aufgelöst:

- **Detailgrad = Capability:** `compliance:view-named` vs.
  `compliance:view-aggregate`. HR-typische Rollen tragen `view-named`,
  Leitungs-/Controlling-Rollen `view-aggregate`.
- **Entität = Scope** (§3), reiner Zeilenfilter.

Damit ist z. B. „Leitung CH" = Rolle mit `compliance:view-aggregate` + Scope
`{land: [CH]}`; „P&C-HR" (group-level CC) = Rolle mit `compliance:view-named` +
Scope `{land: null, bu: null}`.

**Admin steht außerhalb der Scope-Welt.** Seine Capabilities (`users:manage`,
`courses:manage`) laufen *nicht* über entitäts-eigene Daten — es gibt keinen
„CH-Kurs" oder „DE-Nutzer". Die Frage „welche Entität?" stellt sich für Admin
nie; er ist plattformweit, weil seine Rechte keine Entitäts-Dimension haben.
Nur *scoped* Capabilities (§2) werten überhaupt einen Scope aus.

### 6. Competence Center / Gruppenleitung = Rolle + Scope „alle", keine eigene Dimension

CCs sitzen auf **Gruppenebene**. Ein CC-getriebener Zugriff ist damit einfach
eine Rolle mit den passenden (wenigen) Capabilities + Scope `{null, null}` —
kein drittes Dimensions-Konzept. Das „nur bedingt komplett quer" ist
abgedeckt: betrifft ein CC ausnahmsweise nur 2 Länder, ist das ein auf der
Land-Achse eingeschränkter Scope — das Modell kann das bereits.

**CC muss keine Schema-Entität sein:** es ist der *Grund*, warum ein Admin
jemandem eine group-scoped Rolle zuweist, nicht selbst ein modelliertes Ding.
(Erst falls es CC-spezifische Pflichtkurse gäbe, würde CC zur Subjekt-Achse —
YAGNI bis dahin.) Dass P&C-Mitwirkende in ihrem Land/ihrer BU *angestellt* sind,
aber gruppenweite Sicht bekommen, ist der Grund, warum der Scope **an der
Zuweisung** hängt und nicht an der Person global.

### 7. App-verwaltete Autorisierung mit KC-Adapter — *keine* Umkehr

Der Kommentar in `role-map.ts` sagt „Keycloak ist Source of Truth für Rollen".
Der tatsächliche Code (`index.ts`/`session.ts`) ist differenzierter: die Rolle
wird beim Login aus den KC-Claims **gemappt und nach `profiles` geschrieben**,
und **server-seitig ist `profiles` autoritativ** (`liveRole()` liest pro
Request frisch aus `profiles`, damit ein Suspend/Demote sofort greift). Die App
hält die Autorisierung also **heute schon** in der eigenen DB; KC ist der
Login-Seed über einen dünnen Adapter (`OIDC_ROLE_MAP`).

Rollen, Rechte-Matrix und Scope-Zuweisung in App-Tabellen zu legen ist damit
die **Fortsetzung eines bestehenden Musters, keine Kehrtwende**:

- **Authentifizierung** (wer bist du) bleibt bei **Entra → Keycloak**.
- **Autorisierung** (Rollen, `role_capabilities`, `role_assignments`) ist
  **App-verwaltet** (admin-editierbar, §2).
- Das **Rollen-Mapping ist der Adapter**, der die KC-Welt in die App-Domäne
  überführt. Er bleibt der einzige Seam; pro Attribut entscheidet er:
  aus einem Claim importieren *oder* App-verwaltet.

**Provenienz ist damit eine *pro-Attribut*-Entscheidung, kein Grundsatzentscheid:**

- **Autorisierung** (Rollen/Matrix/Scope-Zuweisung, kleiner privilegierter
  Kreis, dynamisch) → **App-verwaltet.** Klar.
- **Land/BU-Zugehörigkeit** (betrifft *jeden* Lernenden, HR-Datenhoheit) → das
  *eine* Attribut, das sich upstream lohnt. **Ist heute nicht im Token:** die
  Session trägt nur `sub/email/emailVerified/name/role`; angefragt werden nur
  `openid profile email`; das *volle* ID-Token liegt beim Login zwar
  transient in `OidcClaims.raw` vor, wird aber verworfen. Daher: `profiles`
  bekommt `land`/`bu` als **app-befüllbare** Felder (Admin oder Bulk-Import);
  der Adapter *kann* sie später aus Claims importieren, **sobald** die
  Entra→KC→App-Verdrahtung sie ausliefert. **Nicht** darauf warten.
- **Empirisch offen:** was Entra→KC überhaupt an Claims emittiert
  (`groups`? `department`? Org-Attribut?). Klärbar über eine gegated
  `OIDC_DEBUG_CLAIMS`-Log-Zeile (`Object.keys` der Claims, PII-frei) bei einem
  echten Login. Ergebnis entscheidet, ob Land/BU je claim-gefüttert werden.

### 8. Rechte-Inspektor im Admin (Lesbarkeit für Variante A)

Neue `/manage`-Ansicht: für einen konkreten User seine **effektiven Rechte
anzeigen** — die Vereinigung der Capabilities über seine Rollen und, je scoped
Capability, den resultierenden Sicht-Scope (Union über die Zuweisungen). Das
gibt die Nachvollziehbarkeit, die eine global-benannte Rolle (Variante B) im
Namen gehabt hätte, ohne deren Rollen-Wildwuchs — analog Confluences
„inspect permissions". Dient zugleich der DSB-/BR-Transparenz und der
Fehlersuche bei Cross-Entity-Fragen.

### 9. Aggregierte Sicht als eigener Loader (PII-frei by construction)

Die aggregierte Sicht (`compliance:view-aggregate`) ist **kein Filter auf der
namentlichen Query**, sondern ein **eigener Loader**, der von vornherein nur
Zähler je Entity zurückgibt (Erfüllungsquote, Anzahl überfälliger Fälle) —
keine Namen, keine User-IDs in der Response. Datensparsamkeit wird auf
**Loader-/Query-Ebene** erzwungen, nicht erst in der UI weggeblendet: ein
Loader, der nie Namen liest, kann sie nicht leaken. Dieselbe Denkweise wie die
PII-freie `retention_purge_runs`-Tabelle in ADR 0006.

### 10. Durchsetzung vorerst App-seitig — RLS-Härtung als Vorbedingung

ADR 0006 hält fest: die DB-RLS-Policies in `lib/db/schema.ts` sind zur
Laufzeit **faktisch wirkungslos** (ein einziger voll-privilegierter Pool, keine
SSO-Claims in der DB-Session; `auth.uid()`/`auth.role()` lösen nicht aus).
`getComplianceOverview()` dokumentiert das offen. Diese ADR baut ehrlich darauf
auf: **Scoping wird zunächst im App-Code durchgesetzt** — die Loader filtern
nach Capability + Scope, bevor Daten die Query verlassen. Es wird **nicht** so
getan, als erzwänge RLS die Trennung.

**Risiko, ausdrücklich benannt:** ein *frei konfigurierbarer* Scope vergrößert
die Fläche, auf der ein App-Bug zu einem Cross-Entity-Leak wird — bis zur
RLS-Härtung ist der App-Code die einzige Verteidigungslinie. Die **RLS-Härtung**
(SSO-Claims in die DB-Session heben, ggf. ein weniger privilegierter Pool/Role
je Scope) ist ein separater, hier referenzierter Track (**P7**, eigener
Querschnitts-Track — getrennt vom optionalen Manager-Scope P6) und
**Vorbedingung**, bevor Scoping als DB-seitig erzwungen (Defense-in-Depth)
gelten darf.

### 11. Append-only Audit-Log (breiter Scope, Punkt 6 des Reviews)

Neue Tabelle **`audit_log`** (Drizzle, append-only, analog zum
Append-only-Prinzip aus ADR 0005 für `training_assignments`):

- **Felder:** `actor` (userId + zum Zeitpunkt geltende Rollen/Scope-Momentaufnahme),
  `action`, `target` (Typ + ID), Land/BU-Kontext, `timestamp`. **Keine
  sensiblen Payloads/Rohdaten** — analog zur PII-Freiheit von
  `retention_purge_runs` (ADR 0006): das Log belegt, *dass* und *von wem*
  etwas geschah, nicht den Dateninhalt.
- **Geloggt an drei Stellen:**
  1. **Compliance-Zugriff** — Dashboard-View, CSV-Export, namentlicher
     Drill-down (ADR 0005 §5/Phase 6d).
  2. **Content-Authoring-Lebenszyklus** — Import/Upload/Publish/Unpublish/
     Edit/Delete von Kursen und Lernpfaden.
  3. **Admin-Aktionen** — Rollen-/Zuweisungsänderung, User-Purge (ADR 0006
     Phase 7b, `scripts/purge-user.ts`), Reindex.
- **Mitbestimmungs-Nuance:** Zu protokollieren, **wer** Nachweise einsieht, ist
  selbst eine Form der Beschäftigten-Überwachung — das Audit-Log unterliegt
  damit derselben Mitbestimmungslogik (§ 87 Abs. 1 Nr. 6 BetrVG) und einer
  Transparenzpflicht gegenüber den protokollierten Personen. Praktische
  Konsequenz: **Authoring- und Admin-Logging kann sofort live** (kein
  MA-Monitoring), das **Compliance-Zugriffs-Logging wird gebaut, aber bis zur
  BR-Freigabe deaktivierbar gehalten** (Feature-Flag). Diese ADR entscheidet
  die BR-Frage nicht abschließend, sondern hält die Abstimmungspflicht fest.
- **Retention:** Das Audit-Log unterliegt selbst der Aufbewahrungspolitik aus
  ADR 0006 — kein Sonderfall „für immer", sondern eigene Einordnung (vermutlich
  Klasse A/nachweisnah; DSB-Abnahme offen).

## Begründung

- **Minimale Rechtevergabe in zwei Dimensionen.** Rechte und Breite unabhängig
  vergeben — die Leitung bekommt Kennzahlen statt Namensvollzugriff, HR sieht
  namentlich, aber nur die eigene Gesellschaft; niemand bekommt App-Rechte,
  die er nicht braucht.
- **Konfigurierbar dort, wo es zählt.** Rollen frei benennbar, Rechte per
  Matrix zuteilbar (Confluence-artig), Scope per Zuweisung — ohne eine
  ABAC-Policy-Engine zu bauen. Capabilities bleiben code-fest, weil sie
  code-durchgesetzt sind.
- **Ehrliche Provenienz.** Autorisierung app-verwaltet (Fortsetzung des
  `profiles`-autoritativen Musters, keine KC-Umkehr); Org-Zugehörigkeit
  upstream, sobald verfügbar; der Adapter ist der einzige Seam.
- **Mandantentrennung ohne Voll-Multi-Tenancy.** Zwei Dimensionsfelder plus
  App-seitiger Scope-Filter genügen — kein Aufspalten in getrennte
  Mandanten-Deployments/-Schemata. Die auf der ROADMAP unter „Mandantierung"
  geführte Vollversion bleibt unberührt und wird nicht präjudiziert.
- **Ehrlicher Umgang mit dem RLS-Befund.** App-seitige Durchsetzung als
  benannter Übergangszustand, RLS-Härtung als Vorbedingung für echtes
  Defense-in-Depth.

## Konsequenzen

- **Rollen-Modell-Umbau:** von Single-Role-Hierarchie zu additiven Rollen +
  festen Capabilities. `roles.ts` verliert die harten `role === "…"`-Checks
  zugunsten einer Capability-Ableitung aus dem Rollen-Set. Call-Sites bleiben
  stabil (sie fragen weiter „darf X", nur die Herleitung ändert sich).
- **Neue Tabellen:** `roles`, `role_capabilities`, `role_assignments`
  (Zuweisung trägt den Scope), `audit_log`.
- **Neue Schema-Felder:** `profiles.land` + `profiles.bu` (aktuell,
  app-befüllbar); `training_assignments.land_snapshot` + `.bu_snapshot`
  (eingefroren beim Abschluss).
- **Optionales Kurs-Targeting:** `training-requirements` bekommt optionale
  Land/BU-Zielfelder (Default „alle", §4); ändert nur die Reconciler-Auswahl,
  nicht die Betrachter-Logik.
- **Adapter-Erweiterung:** `role-map.ts`/`config.ts` werden pro Attribut
  provenienz-fähig (Claim-Import optional, sonst App-verwaltet). `mapRole`
  (höchste gewinnt) → Sammeln aller Treffer in ein Set, sobald additive Rollen
  aus Claims kommen; rückwärtskompatibel über Set-of-one.
- **Zwei Dashboard-Sichten** statt einer: namentlich (Entity-gefiltert, für
  `view-named`) und aggregiert (eigener PII-freier Loader, für
  `view-aggregate`).
- **Neue `/manage`-Oberfläche:** Rollen×Capability-Matrix-Editor (v1 schlank),
  Scope-Picker an der Rollen-Zuweisung, **Rechte-Inspektor** pro User.
- **Offboarding-Kopplung:** App-seitige Rollen-Zuweisungen müssen beim Austritt
  *app-seitig* widerrufen werden — hängt direkt am offenen
  DSG-7c-Keycloak-Reconcile (ADR 0006), sonst behält ein Ausgetretener seine
  Sicht bis zum manuellen Entzug.
- **MCP-/Authoring-Plugin-Abgleich (stehende Regel, alle Phasen).** Der
  headless Authoring-Pfad (MCP-Server + Plugin, ADR 0001) authentifiziert über
  Authoring-Tokens (`lib/auth/authoring-token.ts` / `authoring-auth.ts`) — ein
  von der OIDC-Session und `roles.ts` GETRENNTER Rechte-Pfad. Jede Capability,
  die Authoring/Content betrifft (z. B. `courses:manage`), muss dort explizit
  gespiegelt/geprüft werden, nicht nur im Session-Pfad — sonst greifen neue
  Regeln im MCP-/Plugin-Zugang nicht.
- **Kein Ersatz für die ROADMAP-Mandantierung.** Entity-Scoping für die
  Compliance-Auswertung, nicht volle Multi-Tenancy.

## Umsetzung in Phasen (geplant, nicht gebaut)

Proportional: der privilegierte Betrachterkreis ist klein (~10–30 Personen).
Datenmodell allgemein bauen, Admin-UI minimal starten.

**Shippability-Regel (Vorrang vor allem):** Jede Phase lässt `main` deploybar.
Neue Maschinerie wird additiv und zunächst *dormant/gated* ausgeliefert; der
bestehende funktionierende Pfad bleibt maßgeblich, bis sein Ersatz befüllt und
bewährt ist (Compat-Shim wie in P1). Verhalten ändert sich erst, wenn
Rollen/Scopes bewusst zugewiesen werden. Der Abbau der Single-Role-Hierarchie
ist eine eigene, spätere Cleanup-Phase — nie ein Big-Bang.

- **P1 — Rechte-Achse.** Feste Capability-Liste in `roles.ts`; `roles` +
  `role_capabilities` + `role_assignments` (Scope-Feld vorbereitet, zunächst
  nur voll/leer genutzt); Ableitung „Rollen-Set → effektive Capabilities";
  Call-Sites auf `can(user, cap)` umstellen; `suspended` als Status separieren.
  Rollen erst per Seed/Config, Matrix-UI schlank.
- **P2 — Scope-Achse + Dimensionsfelder** (zwei einzeln shippbare Teilschritte):
  - **P2a (rein additiv):** `profiles.land/bu` +
    `training_assignments.land_snapshot/bu_snapshot`, Snapshot beim Abschluss,
    Land/BU app-befüllbar (Admin/Import). Keine Verhaltensänderung.
  - **P2b (gated):** Scope-Auswertung (UND über Dimensionen, ODER über
    Zuweisungen) in den scoped Loadern — **gated auf vorhandene scoped
    Zuweisungen**: solange niemand scoped zugewiesen ist, bleibt das Verhalten
    „curator/admin sehen alles" (heutiger Stand). Erst eine bewusste Zuweisung
    schaltet die Einschränkung scharf.

  Reitet mit: das optionale Kurs-/Anforderungs-Targeting (§4) an
  `training-requirements` (P2a-Teil, additiv, Default „alle").
- **P3 — Namentliche + aggregierte Sicht.** `compliance:view-named` gefiltert
  auf den Scope; eigener PII-freier Aggregat-Loader für
  `compliance:view-aggregate`.
- **P4 — Audit-Log.** Tabelle + drei Logging-Punkte; Compliance-Zugriffs-Log
  hinter Feature-Flag (BR-Freigabe); Retention-Einordnung nach ADR 0006.
- **P5 — Rechte-Inspektor + Adapter-Provenienz.** `/manage`-Inspektor;
  optionaler Claim-Import für Land/BU, *nachdem* der empirische Claim-Check
  gezeigt hat, was Entra→KC liefert.
- **P6 (optional) — Manager-/Team-Scope.** Eine zusätzliche Scope-Art:
  ein:e Vorgesetzte:r sieht die Nachweise der direkten Reports — NICHT nach
  Land/BU, sondern nach *Führungsbeziehung*. Baut auf einem Team-/Führungsmodell
  auf, das heute fehlt (ADR 0005 hat bewusst kein Gruppen-/Team-Konzept) und ist
  **blockiert auf eine HR-Datenquelle für Führungsbeziehungen** (offene Frage
  unten). Optional/nachrangig: der primäre Betrachterkreis (HR/Leitung/CC via
  Land/BU) ist mit P2–P5 abgedeckt. Unabhängig von P7.
- **P7 — RLS-Härtung (eigener Querschnitts-Track, nicht sequenziell).** Hebt
  SSO-Identität/Scope in die DB-Session (ggf. ein weniger privilegierter
  Pool/Role je Scope), sodass die Mandantentrennung **auch DB-seitig erzwungen**
  wird — echtes Defense-in-Depth statt „App-Code ist die einzige
  Verteidigungslinie" (§10). Anders als P6 nicht fremdabhängig, sondern baubar;
  **Vorbedingung**, bevor Scoping als DB-seitig sicher gelten darf. Je
  frei-konfigurierbarer der Scope (ab P2b), desto größer die Fläche, auf der ein
  App-Bug zum Cross-Entity-Leak würde — P7 ist das Sicherheitsnetz darunter.
  Schließt die in ADR 0006/§10 offen benannte RLS-Lücke.

## Offene Org-/DSB-/IT-Fragen (nicht Teil dieser Entscheidung)

- **Empirischer Claim-Check:** Was liefert Entra→KC im Token (`groups`,
  `department`, Org-Attribut)? → `OIDC_DEBUG_CLAIMS`-Sonde bei einem echten
  Login. Entscheidet, ob Land/BU je claim-gefüttert werden.
- **Entity-Quelle** für Land/BU: HR-System-Export, Keycloak-/Entra-Claims oder
  manuelle Pflege im Admin? Und **Backfill** für Bestandsnutzer und bereits
  abgeschlossene Bestandsnachweise (kein Snapshot vorhanden — rückwirkend
  zuordnen oder „Altbestand/unbekannt" kennzeichnen?).
- **Gruppen-/Namensschema** in Entra/KC — nur relevant, falls claim-gefüttert;
  wer legt es fest (IT oder FIKNOW-Team)?
- **Retention-Klasse des Audit-Logs:** Klasse A oder eigene, kürzere Frist?
  DSB-Abnahme, analog zur Klasse-A-Frist in ADR 0006.
- **Mitbestimmung:** BR-Freigabe des Compliance-Zugriffs-Loggings (Protokoll
  über die einsehenden Personen selbst).
- **Manager-Scope (P6):** ob/wie ein Team-/Führungsmodell eingeführt wird —
  abhängig von einer HR-Datenquelle für Führungsbeziehungen, die heute fehlt.
