# Verzeichnis der Verarbeitungstätigkeiten (RoPA) — FinKnow

**Rechtsgrundlage der Dokumentationspflicht:** Art. 30 DSGVO.

> **Hinweis zum Status:** Dieses Dokument beschreibt den Ist-Zustand der
> Plattform (Stand 2026-07-24, Tätigkeit 4 aktualisiert 2026-07-26 um den
> Embeddings-Anbieter) sowie geplante, aber noch nicht gebaute
> Bausteine (insbesondere die Löschmechanik aus ADR 0006, Phasen 7a–7c). Wo
> Angaben noch nicht final entschieden oder vom Datenschutzbeauftragten (DSB)
> zu bestätigen sind, ist dies mit **„[…] — DSB zu bestätigen"** markiert. Es
> werden keine Angaben erfunden; unbekannte Werte sind als Platzhalter `[…]`
> ausgewiesen.
>
> **Quellen:** `docs/adr/0006-datenschutz-aufbewahrung-und-loeschung.md`,
> `docs/adr/0005-pflichtkurse-und-compliance-nachweis.md`,
> `docs/adr/0003-rag-grounding-fuer-den-ki-tutor.md`, `lib/db/schema.ts`,
> `app/(frontend)/api/tutor/explain/route.ts`, `lib/embeddings/*`, `README.md`,
> `deploy/deploy-ibmcloud.md`.

---

## 1. Verantwortlicher

| Feld | Angabe |
|---|---|
| Verantwortlicher (Art. 4 Nr. 7 DSGVO) | `[Verantwortlicher / finnofleet …]` |
| Kontaktadresse | `[…]` |
| Datenschutzbeauftragter (DSB) | `[…]` |
| Kontakt DSB | `[…]` |

---

## 2. Übersicht der Verarbeitungstätigkeiten

| # | Tätigkeit | Kurzzweck |
|---|---|---|
| 1 | Nutzerkonto/Authentifizierung | Zugriff auf die Plattform via SSO/Keycloak |
| 2 | Lernbetrieb & Fortschritt | Kurse absolvieren, Fortschritt/Quiz/Notizen speichern |
| 3 | Pflichtkurs-/Compliance-Nachweis | Nachweis „wer hat wann welchen Pflichtkurs absolviert" (u. a. EU AI Act Art. 4) |
| 4 | Optionaler KI-Tutor (inkl. RAG-Embeddings) | Lektionsinhalt-gegroundete Erklärungen via externem LLM-Anbieter; Vektor-Retrieval via externem Embeddings-Anbieter |

---

## 3. Tätigkeit 1 — Nutzerkonto/Authentifizierung (SSO/Keycloak)

| Feld | Angabe |
|---|---|
| **Betroffenenkategorien** | Lernende, Kuratoren, Admins — alle nicht-gesperrten Nutzer der Plattform |
| **Datenkategorien** | Identität kommt aus dem Identity-Provider (Keycloak, bei Bedarf via Entra ID föderiert) — Login, Credentials, Name, E-Mail liegen **nicht** in FinKnows eigener Datenbank. Lokal gespeichert (`profiles`): `user_id` (UUID, Referenz auf die IdP-Identität), `display_name`, `role` (`learner`/`curator`/`admin`/`suspended`), `created_at`. Zusätzlich für Autoring-Zugriff (`authoring_tokens`): gehashtes Token (`token_hash`, SHA-256 — **kein Klartext gespeichert**), `user_id`, `label`, `created_at`, `expires_at`, `last_used_at`, `revoked_at`. |
| **Zweck** | Authentifizierung, Autorisierung (Rollen), Zuordnung von Lern-/Nachweisdaten zu einer Person; Autoring-Tokens für den scoped CLI-/Plugin-Zugriff auf Content-Import/Export/Publish. |
| **Rechtsgrundlage** | `[…] — DSB zu bestätigen`. Kandidat: Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des Beschäftigungsverhältnisses/dienstliche Nutzung) bzw. lit. f (berechtigtes Interesse an funktionierendem Zugriffsmanagement). Die eigentliche Identitätsverwaltung (Login, Passwort, E-Mail) läuft vollständig über den IdP — dessen Rechtsgrundlage/RoPA liegt außerhalb des Scopes dieses Dokuments und ist separat zu führen (`[…]`, ggf. durch HR/IT). |
| **Aufbewahrung/Löschung** | Klasse B (siehe ADR 0006): `profiles` wird bei Austritt/auf Verlangen gelöscht — **keine** Vorhaltung. `authoring_tokens` sind ohnehin kurzlebig (TTL via `expires_at`, widerrufbar via `revoked_at`); folgt derselben Klasse-B-Löschlogik. **Löschmechanik ist Stand heute nicht gebaut** (ADR 0006, Phase 7b/7c — geplant, nicht live). |
| **Empfänger** | Identity-Provider (Keycloak; ggf. upstream föderiert an Entra ID/Azure AD) als Auftragsverarbeiter bzw. gemeinsam Verantwortlicher für die Identitätsdaten — `[…] AVV/Rollenverteilung DSB zu bestätigen`. Keine weitere externe Übermittlung. |
| **Hosting/Ort** | Applikation: IBM Cloud Kubernetes Service (IKS), Region `eu-de` (EU/Deutschland) — siehe `deploy/deploy-ibmcloud.md`. Keycloak-Instanz: `[…]` (Betreiber/Hosting-Ort zu bestätigen, falls nicht selbst betrieben). |
| **TOM-Verweis** | `[Verweis auf TOM-Dokument/Sicherheitskonzept …]`. Bekannter, separat zu adressierender Befund (ADR 0006, „Konsequenzen"): DB-Row-Level-Security greift laufzeitseitig faktisch nicht (App nutzt einen einzigen privilegierten Connection-Pool ohne SSO-Claims) — Zugriffskontrolle läuft aktuell ausschließlich über App-Code, kein Defense-in-Depth auf DB-Ebene. Härtung offen. |

---

## 4. Tätigkeit 2 — Lernbetrieb & Fortschritt

| Feld | Angabe |
|---|---|
| **Betroffenenkategorien** | Lernende (inkl. Kuratoren/Admins, sofern sie selbst Kurse absolvieren) |
| **Datenkategorien** | `enrollments` (Kurs-Slug, Start-/Abschlussdatum), `lesson_progress` (Kurs/Section/Lesson-Slug, Status, Abschlusszeitpunkt), `quiz_attempts` (Antworten `answers` als JSON, Score, bestanden/nicht bestanden, Zeitpunkt), `annotations` (Markierungen/Notizen/gespeicherte Tutor-Antworten inkl. Ankertext-Auszug aus dem Kursinhalt, Zeitstempel). |
| **Zweck** | Kurs-Teilnahme ermöglichen, Lernfortschritt sichtbar machen, Quiz-Auswertung, persönliche Notizen/Markierungen im Lernmaterial. |
| **Rechtsgrundlage** | `[…] — DSB zu bestätigen`. Kandidat: Art. 6 Abs. 1 lit. b DSGVO (Beschäftigungsverhältnis/dienstliche Weisung zur Schulungsteilnahme) und/oder lit. f (berechtigtes Interesse an Lernfortschritts-Tracking zur Bereitstellung der Funktion). Bei ggf. mitbestimmungspflichtigen Auswertungen (Verhaltens-/Leistungskontrolle, § 87 Abs. 1 Nr. 6 BetrVG — Auslöser dieser ADR-Reihe) ist die betriebliche Mitbestimmung/Vereinbarung zusätzlich zu prüfen `[…]`. |
| **Aufbewahrung/Löschung** | Klasse B (ADR 0006): Hard-Delete aller Zeilen (`enrollments`, `lesson_progress`, `quiz_attempts`, `annotations`) bei Konto-Löschung/Austritt oder auf Verlangen — keine Vorhaltefrist. **Noch nicht gebaut** — aktuell existiert kein funktionierender Lösch-/Kaskadenpfad (kein DB-Foreign-Key auf `user_id`, keine automatische Bereinigung); geplant in ADR 0006 Phase 7b (Konto-Löschung + Kaskaden) und 7c (Austritts-Trigger via nächtlichem Keycloak-Reconcile). |
| **Empfänger** | Keine externe Übermittlung. Intern: Kuratoren/Admins sehen ggf. aggregierte/eigene Auswertungen im Rahmen ihrer Rolle. |
| **Hosting/Ort** | IBM Cloud IKS, Region `eu-de` (EU). |
| **TOM-Verweis** | `[Verweis auf TOM-Dokument/Sicherheitskonzept …]`. |

---

## 5. Tätigkeit 3 — Pflichtkurs-/Compliance-Nachweis (u. a. EU AI Act Art. 4)

| Feld | Angabe |
|---|---|
| **Betroffenenkategorien** | Lernende **und ausdrücklich auch Kuratoren/Admins** — Pflichtkurse gelten für alle nicht-gesperrten Nutzer, nicht nur die Rolle „learner" (ADR 0005). |
| **Datenkategorien** | `training_assignments`: `user_id`, `course_slug`, `source_type`/`source_id` (Pflicht-Herkunft: Kurs-Toggle oder feingranulare Requirement), `assigned_at`, `due_date`, `completed_at`, eingefrorener Content-Snapshot (`course_title_snapshot`, `course_version_snapshot`), `cycle` (Rezertifizierungs-Zähler), `evidence` (JSON: u. a. Compliance-Treiber-Tags wie `eu_ai_act`/`iso_42001`/`iso_27001`/`dsg_dsgvo`/`security_awareness`/`arbeitsrecht`/`branchenspezifisch`/`sonstige`, deklarierte Kursdauer, Quiz-Ergebnis bei `assessmentRequired`, Verständnisbestätigungs-Zeitstempel bei `confirmationRequired`). |
| **Zweck** | Rechenschaftsfähiger, personenbezogener Nachweis „wer hat welchen Pflichtkurs in welcher Inhaltsfassung wann (und mit welchem Ergebnis) absolviert" — inkl. des rollenproportionalen KI-Kompetenz-Nachweises nach Art. 4 EU AI Act (Teilnehmer+Funktion, Datum, Curriculum/Version, Umfang, Lernkontroll-Ergebnis, Auffrischung, Geltungsbereich) sowie Erfüllungsquoten-Reporting für weitere Treiber (ISO 27001/42001, Security-Awareness, DSG/DSGVO, arbeitsrechtliche Vorgaben). |
| **Rechtsgrundlage** | **Append-only-Zeilen (abgeschlossene Nachweise):** Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse: Rechenschaftspflicht nach Art. 5 Abs. 2 DSGVO + Verteidigung möglicher Ansprüche) i. V. m. Art. 17 Abs. 3 lit. e DSGVO (Löschrecht greift nicht, soweit zur Rechtsverfolgung/-verteidigung nötig) — **ausdrücklich nicht lit. b**, da Art. 4 EU AI Act keine statutarische Aufbewahrungsfrist vorschreibt (ADR 0006). Für andere Compliance-Treiber (z. B. arbeitsrechtliche Pflichtschulung) kann zusätzlich lit. c (rechtliche Verpflichtung) einschlägig sein — `[…] — DSB zu bestätigen, je nach Treiber im Einzelfall`. |
| **Aufbewahrung/Löschung** | Klasse A (ADR 0006, „Entschieden 2026-07-24"): Aufbewahrung bis zur regelmäßigen zivilrechtlichen Verjährung nach **§ 195/§ 199 BGB — 3 Jahre ab Ende des Entstehungsjahres**, danach **Hard-Delete**. Kein Puffer; Frist ist als **konfigurierbarer Wert** vorgesehen, nicht hartkodiert. Append-only während der Frist (keine nachträgliche Veränderung von `completed_at`, keine Löschung einzelner Zeilen im Normalbetrieb) — Fristablauf-Löschung ist ein separater, auditierter Vorgang, kein Bruch des Audit-Trail-Prinzips. **Offener DSB-Check:** absolute Höchstfristen nach § 199 Abs. 3/4 BGB (10/30 Jahre, kenntnisunabhängig) für Sonderfälle — bei strikter 3-Jahres-Löschung ggf. nicht mehr belegbare Spätansprüche; DSB muss die finale Frist (Default 3 Jahre) formal abnehmen. **Retention-Cron noch nicht gebaut** (ADR 0006 Phase 7c, abhängig von Job-Infrastruktur aus ADR 0005 v1.1). |
| **Empfänger** | Intern: Kuratoren/Admins (Compliance-Dashboard `/manage/pflichtkurse`, CSV-Audit-Export). Extern ggf. Aufsichtsbehörden/Auditoren im Prüf-/Streitfall (Herausgabe des Nachweises) — kein regelmäßiger externer Empfänger. |
| **Hosting/Ort** | IBM Cloud IKS, Region `eu-de` (EU). |
| **TOM-Verweis** | `[Verweis auf TOM-Dokument/Sicherheitskonzept …]`. RLS beschränkt Lesezugriff auf eigene Zeilen bzw. Staff-Rollen (`curator`/`admin`); keine Insert/Update/Delete-Policies für Nicht-Admins (append-only auch auf DB-Policy-Ebene) — siehe aber Einschränkung zu RLS-Wirksamkeit unter Tätigkeit 1. |

---

## 6. Tätigkeit 4 — Optionaler KI-Tutor (inkl. RAG-Embeddings)

| Feld | Angabe |
|---|---|
| **Betroffenenkategorien** | Lernende (und Kuratoren/Admins, sofern sie den Tutor als Lernende nutzen), sofern der jeweilige Kurs `tutor_enabled` ist. |
| **Datenkategorien** | **Zwei getrennte externe Verarbeitungen.** (a) **LLM (Texterklärung):** an den LLM-Anbieter übermittelt werden markierter Textauszug der Lektion (`selection`), optionale Nutzerfrage (`question`), zur Kontext-Grounding ausgewählte Lektions-/Chunk-Inhalte des Kurses. (b) **Embeddings (RAG-Retrieval):** an den Embeddings-Anbieter übermittelt werden zum Indexierungszeitpunkt die **Kurs-Chunk-Inhalte** (kein Personenbezug — reiner Kursinhalt) und pro Tutor-Anfrage die **Nutzerfrage/Selektion** als Query-Embedding (potenziell personenbezogen, da Freitext). **Kein Logging** dieser Inhalte durch FinKnow selbst (Route-Kommentar, `app/(frontend)/api/tutor/explain/route.ts`: „Selektion/Frage/Antwort werden NICHT geloggt"; die Embeddings-Schicht `lib/embeddings/*` persistiert keine Klartexte). Bei Speicherung als Notiz (User-Aktion „Tutor-Antwort merken") landet die Antwort als `annotations`-Zeile vom Typ `tutor_explanation` (siehe Tätigkeit 2) — das ist eine bewusste, separate Nutzerhandlung. |
| **Zweck** | Kontextbezogene Erklärung von Kursinhalten auf Anfrage der/des Lernenden; optionaler „Allgemeinwissen ergänzen"-Modus für ungegroundete Antworten außerhalb des Kursinhalts. |
| **Rechtsgrundlage** | `[…] — DSB zu bestätigen`. Da es sich um eine explizite, optionale Nutzerhandlung mit Übermittlung an einen externen Dritten handelt, kommen in Betracht: Einwilligung (Art. 6 Abs. 1 lit. a, durch aktive Nutzung der Funktion) oder berechtigtes Interesse (lit. f, Bereitstellung einer optionalen Lernfunktion). Enthält die Selektion/Frage potenziell personenbezogene Angaben der/des Lernenden (freitextlich, nicht vorhersehbar), ist dies bei der Einordnung zu berücksichtigen. |
| **Aufbewahrung/Löschung** | Keine Aufbewahrung durch FinKnow selbst (kein Logging der Anfrage/Antwort, keine Klartext-Persistenz in der Embeddings-Schicht). Aufbewahrung/Löschung bei den externen Anbietern richtet sich nach deren AVV — `[…] AVV-Inhalt und Löschfristen je Anbieter zu bestätigen`. Wird eine Antwort explizit als Notiz gespeichert (`annotations`), gilt Klasse B (siehe Tätigkeit 2). |
| **Empfänger** | Zwei externe Auftragsverarbeiter: **(a) LLM-Anbieter** (v1: Anthropic; über `lib/llm` konfigurierbar) — empfängt Lektionsinhalt + Auswahltext + Frage je Anfrage. **(b) Embeddings-Anbieter** (`lib/embeddings`, über `EMBEDDING_PROVIDER` konfigurierbar): **Zielzustand IBM watsonx.ai** (`ibm/granite-embedding-278m-multilingual`) — **bewusste, konsequente Ablösung** des bisherigen Default **Voyage**. Begründung (mit Yves, 2026-07-26): IBM ist die **Betriebsplattform mit bestehendem Vertragsverhältnis**, während mit Voyage **kein Vertrag** besteht (kein AVV, US-Anbieter/Drittland) — das ist ein DSG-Nachteil ohne Vorteil, daher Voyage nicht als Dauerzustand. **Kein Logging clientseitig durch FinKnow** bei beiden. |
| **Hosting/Ort** | FinKnow-Applikation: IBM Cloud IKS, Region `eu-de` (EU). **Embeddings-Anbieter (Zielzustand):** IBM watsonx.ai, Region wählbar `eu-de` (EU) — verglichen mit Voyage (US) entfällt damit die Drittland-Problematik; ob das bestehende IBM-Vertragsverhältnis die watsonx.ai-Nutzung als Auftragsverarbeiter mit abdeckt, ist noch formal zu bestätigen (jedenfalls Vertragsbeziehung vorhanden, anders als bei Voyage). **LLM-Anbieter (Anthropic):** Hosting-/Verarbeitungsort `[…] — DSB zu bestätigen` — **das bleibt die wichtigste offene Stelle**: ADR 0006 legt EU-Hosting für die FinKnow-Infrastruktur fest, trifft aber keine Aussage zum Verarbeitungsort des LLM-Anbieters. Vor Produktivbetrieb ist zu klären, ob ein AVV nach Art. 28 DSGVO vorliegt und ob eine Drittlandübermittlung (Art. 44 ff. DSGVO, z. B. Standardvertragsklauseln) besteht. Offen ist, ob auch die **Text-LLM-Ebene** analog zu den Embeddings auf IBM (watsonx-gehostete Modelle) konsolidiert werden soll — siehe offene Punkte. |
| **TOM-Verweis** | `[Verweis auf TOM-Dokument/Sicherheitskonzept …]`. Zusätzliche technische Schutzmaßnahmen laut Code-Kommentar: Rate-Limit pro Nutzer (Kosten-/Missbrauchsschutz), Prompt-Injection-Abgrenzung (Selektion/Frage als Daten markiert), Output wird clientseitig sanitisiert gerendert (kein rohes HTML/JS), Feature nur für Kurse mit `tutor_enabled` (Gating). |

---

## 7. Betroffenenrechte

- **Auskunft/Berichtigung der Identität** (Name, E-Mail, Passwort): läuft vollständig über den Identity-Provider (SSO/Keycloak) — FinKnow selbst führt diese Daten nicht. Anfragen sind an die zentrale IdP-/HR-Verwaltung zu richten, nicht an die Anwendung (siehe `app/(frontend)/profile/`, Abschnitt „Konto-Verwaltung" verweist bereits als reiner Hinweistext dorthin).
- **Löschung lokaler Lerndaten (Klasse B):** Aktuell **kein funktionierender Self-Service-Löschpfad** — die „Danger-Zone"-UI im Profil existiert nur visuell, ohne verdrahteten Backend-Endpoint (Audit-Befund, ADR 0006). Bis zur Umsetzung von ADR 0006 Phase 7b (Kaskaden-/Anonymisierungslogik) und 7c (Austritts-Trigger) sind Löschbegehren **manuell** durch `[Verantwortlicher/DSB …]` zu bearbeiten.
- **Auskunft/Löschung zu Compliance-Nachweisen (Klasse A):** Löschung ist während der Aufbewahrungsfrist (§ 195/§ 199 BGB, 3 Jahre) gemäß Art. 17 Abs. 3 lit. e DSGVO eingeschränkt — Auskunft bleibt unberührt möglich.
- **Bearbeitungsfrist/Prozess für Betroffenenanfragen:** `[…] — DSB/Recht zu definieren]` (Zuständigkeit, Frist nach Art. 12 Abs. 3 DSGVO, Eskalationsweg).

---

## 8. Offene Punkte / Platzhalter — Zusammenfassung

Zur schnellen Übersicht, was vor Freigabe dieses RoPA noch zu klären ist:

1. Verantwortlicher, DSB-Kontakt (Abschnitt 1).
2. Finale Rechtsgrundlagen für Tätigkeiten 1, 2 und 4 (aktuell nur Kandidaten benannt).
3. Formale DSB-Abnahme der 3-Jahres-Frist für Klasse A sowie Prüfung der Höchstfristen § 199 Abs. 3/4 BGB (Tätigkeit 3).
4. **Externe KI-Anbieter (Tätigkeit 4):** (a) **Embeddings** — Ablösung von Voyage (kein Vertrag, US/Drittland) durch **IBM watsonx.ai, `eu-de`** ist entschieden (2026-07-26); noch formal zu bestätigen, ob das bestehende IBM-Vertragsverhältnis die watsonx-Nutzung als Auftragsverarbeiter abdeckt. (b) **LLM (Anthropic)** — AVV-Status, Verarbeitungsort und ggf. Drittlandmechanismus weiterhin offen; **derzeit größte offene Compliance-Lücke dieses RoPA**. (c) Zu entscheiden: ob auch die Text-LLM-Ebene auf IBM konsolidiert wird (analog zu (a)).
5. Betreiber/Hosting-Ort von Keycloak, sofern nicht selbst betrieben (Tätigkeit 1).
6. TOM-Dokument/Sicherheitskonzept-Verweis (alle Tätigkeiten) — inkl. Nachverfolgung des bekannten RLS-Wirksamkeits-Befunds.
7. Prozess/Frist für Betroffenenanfragen (Abschnitt 7).
8. Status „geplant, nicht gebaut": Konto-/Lerndaten-Löschung (ADR 0006 Phase 7a–7c) — dieses RoPA beschreibt die Zielarchitektur, nicht den heutigen technischen Ist-Zustand der Löschfähigkeit.
