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
| **Konto-Self-Service** | Passwort ändern, E-Mail wechseln, Konto löschen im Profil (vormals read-only). `app/(frontend)/profile/`. |
| **Content-gegroundeter KI-Tutor (RAG)** | ADR 0003. **Phase 1+2 live** (verstande): `real[]` + App-Cosine statt pgvector, `lesson_chunks` + Voyage-Embeddings, Index beim Upload + Re-Index/Backfill; Retrieval im Tutor-Endpoint (Query-Embedding → Cosine-Top-k → Kontext-Injektion), Quiz-Guardrails b+c, Fallback auf Lektions-Injektion, `grounded`-Flag + Quellen an die UI. **Default = immer aus dem Kurs grounden**; der frühere automatische Scope-Router wurde verworfen (Self-Match → feuerte nie) → ersetzt durch Button **„Allgemeinwissen ergänzen"** (user-initiierte ungegroundete Antwort, angehängt). **Phase 3 (Eval + Schwellen-Tuning) aufgeschoben — bei Bedarf, nicht auf Spec**: kein Security-/Nutzungs-Trigger, der Button entschärft den Hauptgrund; Trigger für später = off-topic-Fehlantwort beobachtet / stark regulatorischer Kurs live / Skalierung auf Lernpfade (pfad-weites Retrieval). fiknow braucht Fix-Port + Backfill + eigenen `VOYAGE_API_KEY`. |

## 📋 Geplant (auf der Landing)

| Feature | Notiz |
|---|---|
| **Lernpfade** | Mehrere Kurse/Lektionen zu Reihen bündeln, eigenes Fortschrittstracking. Noch nicht begonnen (vermerkt in `payload/collections/courses.ts`). Achse **Führungsgrad**: von *geführt/linear* (Onboarding, Zertifizierung) bis *lose/empfohlen* (Wissens-Nugget-/Themen-Sammlung, nach Bedarf navigierbar) — beides derselbe Pfad-Primitiv bei unterschiedlicher Führung. Löst die heutige Interim-Lösung ab (manuelle „Weiterlesen"-Querlinks zwischen kurzen Lektionen). Schaltet auch pfad-weites RAG-Retrieval frei (ADR 0003). |
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
| **Zielgruppen-/BU-Sichtbarkeit** | Nicht jeder Inhalt gilt für alle (ein Tool betrifft nur eine Business Unit; Stack BU 1 ≠ BU 2). Günstige Vorarbeit läuft bereits: Autoren benennen die Zielgruppe (BU/Firma/Rolle) im `summary` — Konvention im Content-Style-Overlay. Offen: ob Relevanz ein echtes Frontmatter-/Datenfeld wird und ob es einen lernerseitigen Filter gibt (würde die bestehende Katalog-Filterung erweitern). |
| **Mandantierung** | Ob die Plattform getrennte Sichten/Rechte pro Business Unit / Firma braucht. Größere Architekturentscheidung; baut auf der Zielgruppen-Sichtbarkeit oben auf. Noch nicht entschieden — bewusst nicht bauen, bis der Bedarf bestätigt ist. |
| **Test-Absicherung** | Eingeführt, als die Codebasis komplex genug wurde (Lernpfade): **Vitest, vorerst nur Unit-Tests ohne DB/Payload** (`npm test`, CI-Gate `.github/workflows/test.yml`). Erster Test: `lib/paths-progress-compute.ts` (reine Aggregation, bewusst als Leaf-Modul von I/O getrennt → testbar). **Bewusst aufgeschoben:** DB-Integration (Payload Local API gegen Test-Postgres), Component-Tests (RTL), E2E (Playwright) — je bei Bedarf, eigenes Setup. Konvention: reine Logik in I/O-freie Leaf-Module ziehen, dann unit-testen. |
| **Maintenance-Seite bei Deploy** | Bei aktuell **einer** App-Node erzeugt jeder Restart / jede DB-Migration ein Fenster mit hässlichen 502/504. Idee: nginx-Flag-File-Pattern (`-f maintenance.on` → kontrollierte 503-Seite mit Branding + `Retry-After`), kein Reload nötig (per-Request ausgewertet). Wichtig: **IP-Whitelist** (live testen vor Freischalten, da keine zweite Node) + **Health-Gate** im Deploy-Skript (erst `rm` nach erfolgreichem `/health`). Setzt eigene Brand-Wartungsseite + Health-Endpoint voraus. Noch nicht umgesetzt. |

## 🏗️ Plattform-Skalierung: Multi-Author, SSO, Mandantierung (trigger-gated)

> Strategie-Notizen, damit beim späteren Anschalten nichts neu gedacht werden
> muss. **Bewusst nicht versioniert** — kein „Phase 2.5"-Datum, sondern
> bedarfsgetrieben (siehe Trigger). Bis ein Trigger feuert: nicht bauen (YAGNI).
> Früher als `docs/PHASE-2.5-ROADMAP.md` geführt; hierher gemergt und gegen den
> Headless-Pivot abgeglichen.

**Trigger — aktivieren, sobald einer davon eintritt:**

- **FiKnow-Pilot trägt** und FINNOFLEET-Stakeholder geben grünes Licht für
  Roll-out, **oder**
- **mehrere Autor:innen** (z. B. Teamleiter:innen) müssen eigenständig Inhalte
  beitragen — der heutige Authoring-Weg (Bundle-Checkout/-Upload via CLI/Plugin
  + MCP) ist für Nicht-Entwickler:innen keine Option, **oder**
- **SSO** (Entra/Azure AD) wird zwingend — etwa wegen Konzern-Compliance.

**Schon vorbereitet (damit es keine Refactoring-Bombe wird):**

- **Self-hosted GoTrue/Supabase läuft von Tag 1** als Auth-System
  (`lib/supabase/*`, OAuth-Callback-Route da) — Entra kommt später als
  *zusätzlicher* OAuth-Provider obendrauf, ersetzt das Auth-System nicht.
- **Postgres-Schema** über den Payload-Postgres-Adapter (Drizzle darunter),
  Migrationen hand-authored (Projekt-Memory `payload-migration-hand-authoring`).
- **Eigenes Image** via GHCR, kein Vercel-Lock-in.
- **Brand-/Content-Trennung** über Env-Vars + Volume-Mounts — eine Codebasis
  bedient mehrere Apps (Projekt-Memory `brand-overlay-deployment`).

### 1. Multi-Author-Authoring

**Der Bedarf besteht** (mehrere Autor:innen, Rollen, Draft→Review→Publish),
**aber die Lösungsform hat sich mit dem Headless-Pivot geändert.** Der ursprüngliche
Plan „Payload-CMS-Admin als Editor-UI" ist **verworfen** (siehe unten) — `/admin`
ist abgeschaltet (Proxy-Redirect → `/manage`, `lib/supabase/proxy.ts`). Payload
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

**Pattern: geteiltes GoTrue als zentrale Auth — Entra als zusätzlicher
OAuth-Provider.** Architektonisch weiterhin gültig (GoTrue/OAuth-Callback stehen).

GoTrue-Env-Vars:
```
GOTRUE_EXTERNAL_AZURE_ENABLED=true
GOTRUE_EXTERNAL_AZURE_CLIENT_ID=<aus Azure-App-Registration>
GOTRUE_EXTERNAL_AZURE_SECRET=<...>
GOTRUE_EXTERNAL_AZURE_REDIRECT_URI=https://<host>/auth/callback
GOTRUE_EXTERNAL_AZURE_URL=https://login.microsoftonline.com/<tenant-id>/v2.0
```

App-seitig: auf `/login` ein „Mit Microsoft anmelden"-Button
(`signInWithOAuth({ provider: 'azure', options: { redirectTo: '/auth/callback' }})`),
Email/Passwort-Flow bleibt parallel. Tenant-Restriktion (nur FINNOFLEET) via
Tenant-ID statt `common` in der URL. Aufwand: ~30 Min nach Azure-App-Registrierung.

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
| **Heute** | FiKnow lauffähig, Yves als einziger Autor, Email-Login, headless Authoring (CLI/Plugin + MCP). |
| **Multi-Author** | Rollen/Permissions + Review-Schritt auf dem `/manage`-/Bundle-Pfad; niedrigschwelliger Einstieg für Nicht-Entwickler:innen. |
| **SSO** | Entra als OAuth-Provider, Single-Identity zwischen Lerner und Editor. |
| **Enterprise** | SCIM-User-Provisioning aus Entra, HR-Reporting (wer hat welchen Onboarding-Kurs durch), ggf. Multi-Tenant/SAML. |

## ⛔ Verworfen

| Feature | Grund |
|---|---|
| **Editor-UX für AI-Autoren (Admin)** | Slug-Auto/Drag-&-Drop/Labels im Payload-Admin — Richtung mit dem Headless-Pivot aufgegeben. Authoring läuft jetzt über Bundle-checkout/edit/upload (CLI/Plugin), nicht über ein Web-Admin-Editor-UI. |
