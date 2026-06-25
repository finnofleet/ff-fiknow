# Course Authoring Plugin

Claude-Plugin für das Erstellen und Publishen von Online-Kursen auf einer
EDU-Platform-Instanz (verstande.ch, fiknow.ch oder eine andere Brand-
Variante).

Ab v0.2 ist das Plugin ein **authentifizierter Direkt-Client** zur
Plattform-API — Upload (Draft) und Publish (live) laufen direkt aus dem
Cowork-Chat heraus. Kein manueller Browser-Upload mehr nötig. Ab v0.4
entfällt der Preview-Endpoint; Review geschieht in der echten
Learner-Shell (Kuratoren sehen Drafts). Ab v0.5 komplettiert `checkout`
den Edit-Loop für bestehende Kurse: checkout → edit → upload → publish.

---

## Struktur

```
course-plugin/
  plugin.json           # Generisches Manifest (+ Bearer-Token-Config)
  system-prompt.md      # System-Prompt für den Authoring-Modus
  skills/
    course-init.md      # Neuen Kurs scaffolden (lokaler Scaffold)
    course-validate.md  # Bundle gegen Format-Spec prüfen (lokal, Frühwarnung)
    course-checkout.md  # Bestehenden Kurs herunterladen (inkl. Version-Token)
    course-upload.md    # Bundle als DRAFT zur Plattform hochladen
    course-publish.md   # Draft → live schalten (separat, explizit)
  scripts/
    publish.mjs         # Bundle → ZIP (CLI + Library)
    client.mjs          # HTTP-Client für checkout/upload/publish
  examples/
    minimal-course/     # Referenz-Bundle (kann als Vorlage dienen)
```

---

## Architektur — drei Kommandos, ein Token

```
checkout → KI-Edit → upload   (Commit als DRAFT, mit 409-Konflikt-Check)
                   → publish  (separat, explizit: Draft → live)
```

- **checkout** (neu ab v0.5): `GET /api/authoring/export/<slug>` — lädt das
  aktuelle Bundle als ZIP, Server injiziert die autoritative `version` ins
  `course.mdx`. Einstieg in den Edit-Loop für bestehende Kurse.
- **upload**: `POST /api/authoring/import` — Commit als Draft; 409 wenn
  jemand den Kurs seit dem Checkout geändert hat.
- **publish**: `POST /api/authoring/publish` — Draft → live, separater
  expliziter Schritt.

Neue Kurse starten mit `course-init` (lokaler Scaffold) statt checkout.

Review des Drafts geschieht in der echten Learner-Shell — Kuratoren sehen
Drafts über `viewerCanSeeDrafts()`. Same Token, same Bundle-Payload,
unterschiedlicher Effekt. Details: ADR 0001 Decision 6, `docs/AUTHORING_API.md`.

---

## Setup für End-User

### 1. Plugin installieren

Im Claude-Marketplace nach „Course Authoring" suchen + installieren.
*(Bis das Plugin gelistet ist: manuelles Setup — siehe „Manual Install"
unten.)*

### 2. Authoring-Token minten (einmalig)

Der Token authentifiziert das Plugin direkt gegen die Plattform-API.
Token-Properties: nur Authoring-Scope, kurze TTL (Default 12 h, max. 7
Tage), widerrufbar, **Klartext nur einmal sichtbar**.

Im Browser (eingeloggt auf der Plattform, Curator- oder Admin-Rolle):

```bash
# Beispiel via curl + Browser-Session-Cookie
curl -sS -X POST https://verstande.ch/api/authoring/tokens \
  -H "Cookie: <Plattform-Session-Cookie>" \
  -H "Content-Type: application/json" \
  --data '{"label":"Cowork-Plugin","ttlHours":168}'
```

Antwort:
```json
{
  "ok": true,
  "id": "<uuid>",
  "token": "cat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "expiresAt": "2026-06-17T08:00:00.000Z",
  "ttlHours": 168
}
```

**Den `token`-Klartext kopieren — er wird nicht ein zweites Mal angezeigt.**
Eine künftige UI unter `/manage/tokens` (Phase 2) ersetzt das manuelle
curl-Snippet.

### 3. Plugin konfigurieren

Plugin-Settings in Claude Desktop / Cowork öffnen und beide Felder
setzen:

```json
{
  "platformBaseUrl": "https://verstande.ch",
  "authoringToken": "cat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

Mehr ist nicht nötig. Das Plugin spricht direkt mit der Plattform-API;
keine separate Browser-Schritte beim Publishen.

### 4. Erste Session

Claude Desktop neu starten, neuen Cowork-Chat öffnen, und z.B. schreiben:

> „Erstelle einen Kurs zu Brandschutz-Grundlagen für neue Mitarbeitende.
> 3 Sektionen mit je 3-4 Lektionen, am Ende ein Quiz."

Das Plugin übernimmt — fragt nach Slug, scaffoldet, generiert Inhalte
sektion-für-sektion, lädt als Draft hoch (in der Learner-Shell
reviewbar), publisht auf deine Bestätigung.

---

## Token-Verwaltung

- **Listen**: `GET /api/authoring/tokens` (Session-Auth) — zeigt deine
  aktiven Tokens (kein Klartext, kein Hash)
- **Widerrufen**: `DELETE /api/authoring/tokens/<id>` — Token sofort tot
- **Ablauf**: passiert automatisch nach `ttlHours`. Im Plugin sichtbar
  als Exit-Code 2 (`invalid_token`) → neuen Token minten

Sicherheit:
- Plugin loggt den Token **nie**. `client.mjs` redacted ihn defensiv aus
  jedem JSON-Output.
- Bei Token-Verlust (z.B. Laptop weg): über Browser-Session widerrufen,
  neuen minten
- Token NIE in Git committen, NIE im Chat zurückkopieren

---

## Manual Install (vor Marketplace-Release)

Bis das Plugin im Marketplace ist:

1. Repo klonen oder dieses `tooling/course-plugin/`-Verzeichnis kopieren
2. `npm install adm-zip` darin ausführen (Script-Dependency)
3. Inhalt von `system-prompt.md` als Claude-Projektanweisung pasten
4. Skills aus `skills/*.md` als Projekt-Knowledge mitgeben
5. `scripts/publish.mjs` + `scripts/client.mjs` müssen von Claude per
   Bash-Tool aufrufbar sein
6. `platformBaseUrl` + `authoringToken` als Env-Variablen exportieren
   (`EDU_PLATFORM_BASE_URL`, `EDU_AUTHORING_TOKEN`), wenn der Cowork-
   Runtime das Config-Schema nicht durchreicht

Das ist umständlich — deshalb der MVP-Endzustand: korrektes
Marketplace-Plugin mit Config-UI.

---

## Workflow einer Authoring-Session

### Neuen Kurs erstellen

```
User    : "Ich will einen Kurs zu Telefon-Etikette für Disponenten."

Claude  : "Vorschlag: 4 Sektionen — Grundlagen / Begrüssung / Gespräche /
           Beschwerden. Pro Sektion 3 Lessons + Quiz am Ende. OK?"

User    : "Ja, aber nur 3 Sektionen — Beschwerden in Sektion 3 mit rein."

Claude  : → course-init { slug: "telefon-disponent", title: "..." }
          "Folder steht unter ./telefon-disponent/. Lass uns Sektion 1
           angehen. Erste Lesson: 'Was Kunden hören' — Wurf folgt."

          (schreibt MDX, der User iteriert)

Nach mehreren Iterationen + ggf. course-validate:

Claude  : → course-upload ./telefon-disponent
          "Hochgeladen als DRAFT, version 01HXYZ... ins course.mdx
           zurückgeschrieben. Course-ID: 42. Letzter Check unter
           https://fiknow.ch/courses/telefon-disponent (Editor sieht
           Drafts). Wenn alles passt: course-publish."

User    : "Geht so live."

Claude  : "Bestätige: Course-ID 42 (telefon-disponent), inkl. aller
           Sections + Lessons live schalten — OK?"

User    : "Ja."

Claude  : → course-publish 42
          "Live. https://fiknow.ch/courses/telefon-disponent ist jetzt
           öffentlich, 3 Sections / 9 Lessons / 3 Quizze."
```

### Bestehenden Kurs editieren

```
User    : "Ich möchte den Kurs 'telefon-disponent' überarbeiten — Sektion 2
           braucht ein Quiz am Ende."

Claude  : → course-checkout { slug: "telefon-disponent" }
          "Bundle liegt unter ./telefon-disponent/ (14 Dateien,
           version 01HXYZ...). Das version-Feld im course.mdx bitte
           nicht manuell ändern — es schützt vor dem Überschreiben
           fremder Änderungen."

          (editiert MDX, fügt Quiz-Lesson ein)

Claude  : → course-upload ./telefon-disponent
          "Hochgeladen als DRAFT, neue version 01JABC... zurückgeschrieben.
           Letzter Check unter https://fiknow.ch/courses/telefon-disponent."

User    : "Passt, live schalten."

Claude  : → course-publish 42
          "Live."
```

---

## Was im Plugin nicht ist (und auch nicht sein soll)

- **Lokaler Live-Preview-Server** — kein Plugin-Renderer. Review läuft
  in der echten Learner-Shell via Draft-Sichtbarkeit (ADR 0001 Decision 4:
  nur eine Render-Wahrheit).
- **Multi-User-Collab** — eine Authoring-Session = eine Person, ein
  Bundle. Mehrere Autor:innen am gleichen Kurs später via Browser-Studio
  (Phase 2).
- **Asset-Optimierung** — Bilder müssen vor dem Bundle bereits richtig
  dimensioniert sein. Plattform liefert sie 1:1 aus.
- **Custom-Komponenten** — nur die im System-Prompt gelisteten MDX-
  Komponenten sind plattform-side bekannt. ESM-Imports und
  `{…}`-Expressions werden serverseitig hart abgelehnt.
- **Token-Minting im Plugin** — Sicherheits-Entscheidung: Token-Erzeugung
  läuft ausschließlich über Browser-Session, nicht per Bearer-Token
  (kein Privilege-Chaining via Token-Self-Renewal).

---

## Versionierung

Plugin folgt SemVer. Beim Plattform-Update neuer MDX-Komponenten oder
geänderter Bundle-Spec: Major-Bump des Plugins. End-User updaten via
Marketplace.

Synchron-halten von `system-prompt.md` mit der Plattform-Realität ist
manueller Job — bei jedem Plattform-Release prüfen ob neue Komponenten
dokumentiert werden müssen.

---

## Entwicklung

Im edu-platform-Repo:

```bash
cd tooling/course-plugin
npm install adm-zip

# Bundle in-place packen (zur Inspektion, optional)
node scripts/publish.mjs ./examples/minimal-course
# Output: ./examples/minimal-course.zip + JSON-Summary auf stdout

# HTTP-Client gegen lokale Plattform
EDU_PLATFORM_BASE_URL=http://localhost:3000 \
EDU_AUTHORING_TOKEN=cat_dev_token_aus_browser \
node scripts/client.mjs checkout minimal-course

EDU_PLATFORM_BASE_URL=http://localhost:3000 \
EDU_AUTHORING_TOKEN=cat_dev_token_aus_browser \
node scripts/client.mjs upload ./examples/minimal-course

EDU_PLATFORM_BASE_URL=http://localhost:3000 \
EDU_AUTHORING_TOKEN=cat_dev_token_aus_browser \
node scripts/client.mjs publish 42
```

Exit-Codes von `client.mjs`:

| 0  | ok                      |
| 1  | server (500)            |
| 2  | auth (401)              |
| 3  | role (403)              |
| 4  | bad request (400/404)   |
| 5  | lokaler Fehler          |
| 9  | version_conflict (409)  |
| 13 | bundle_too_large (413)  |
| 29 | rate_limited (429)      |
