---
name: course-checkout
description: |
  Checkt einen bestehenden Kurs von der Plattform aus — lädt das aktuelle
  Bundle (inkl. autoritativem `version`-Token) nach `<outDir>/<slug>/` und
  macht es bereit für lokale Edits. Gegenstück zu `course-init` (für NEUE
  Kurse). Nutze diesen Skill wenn der User „auschecken" / „herunterladen" /
  „bearbeiten" / „editieren" (einen bestehenden Kurs) sagt.
  Danach weiter mit `course-upload` (Draft) → Review im Learner-Shell →
  `course-publish`.
arguments:
  - name: slug
    description: Kurs-Slug (z.B. „telefon-disponent") — muss auf der Plattform existieren
    required: true
  - name: outDir
    description: Zielordner (Default — aktuelles Verzeichnis). Bundle landet unter `<outDir>/<slug>/`
    required: false
  - name: force
    description: Existierenden Bundle-Ordner überschreiben (Default — nein, Abbruch zum Schutz lokaler Edits)
    required: false
---

# Skill: course-checkout

Du checkst einen **bestehenden** Kurs aus der Plattform aus. Das ist der
Einstieg in den Edit-Loop für Kurse, die schon auf der Plattform sind —
das Gegenstück zu `course-init`, das einen ganz neuen Kurs scaffoldet.

Der Server packt das aktuelle Bundle frisch als ZIP und injiziert die
**autoritative `version`** ins `course.mdx`-Frontmatter (Self-Identifying
Bundle). Dieses Version-Token ist das Optimistic-Locking-Token: es stellt
beim späteren Re-Upload sicher, dass keine Fremd-Änderungen stillschweigend
überschrieben werden.

## Voraussetzungen

- Plugin-Config hat `platformBaseUrl` und `authoringToken` gesetzt
- Der Kurs existiert auf der Plattform (Slug bekannt)

## Ausführung

1. **Slug klären** — wenn nicht im Argument: User fragen. Der Slug steht
   in der Kurs-URL (`/courses/<slug>`) oder im Admin-Backend.

2. **Checkout-Kommando aufrufen**:

   ```bash
   EDU_PLATFORM_BASE_URL="$platformBaseUrl" \
   EDU_AUTHORING_TOKEN="$authoringToken" \
   node <plugin-root>/scripts/client.mjs checkout <slug>
   ```

   Mit explizitem Zielordner:
   ```bash
   ... node <plugin-root>/scripts/client.mjs checkout <slug> --out <dir>
   ```

   Existierenden Ordner überschreiben (lokale Edits gehen verloren —
   nur mit expliziter User-Bestätigung):
   ```bash
   ... node <plugin-root>/scripts/client.mjs checkout <slug> --force
   ```

3. **Erfolgs-Output verarbeiten** (JSON auf stdout):

   ```json
   {
     "ok": true,
     "command": "checkout",
     "courseSlug": "...",
     "bundleDir": "/abs/path/to/<slug>",
     "fileCount": 14,
     "version": "01HXYZ...",
     "hint": "..."
   }
   ```

   Dem User klar berichten:
   - Wo das Bundle liegt (`bundleDir`) und wie viele Dateien entpackt wurden
   - Die `version` — sie ist das Locking-Token für den nächsten Upload
   - Nächste Schritte: MDX/Assets im Bundle-Ordner editieren, dann
     `course-upload` (Draft) → Review in der Learner-Shell → `course-publish`

## WICHTIG: `version`-Feld nicht von Hand ändern

Das `version`-Feld im `course.mdx`-Frontmatter ist ein **Optimistic-Locking-
Token** — vom Server vergeben, vom Server erwartet.

> **Nicht manuell bearbeiten.** Wer den Wert löscht oder ändert, hebelt
> entweder den 409-Schutz aus (blindes Überschreiben fremder Änderungen) oder
> löst beim nächsten Upload einen unnötigen Versions-Konflikt aus.

Beim Re-Upload schreibt der Server die neue Version automatisch ins
`course.mdx` zurück — kein manueller Eingriff nötig.

## Fehler-Codes

| Exit | Bedeutung                                           | Reaktion                                                                                                         |
|------|-----------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| 2    | `invalid_token` / `not_logged_in`                   | Token im Browser neu minten (POST /api/authoring/tokens), in Plugin-Config eintragen                            |
| 3    | `insufficient_role`                                 | Plattform-Admin um Curator/Admin-Rolle bitten                                                                   |
| 4    | `course_not_found` / 404                            | Slug prüfen — Kurs existiert nicht oder noch nie hochgeladen. Neu anlegen mit `course-init` + `course-upload`  |
| 9    | `course_has_no_version` / `bundle_not_in_storage`   | Alt-Kurs ohne Storage-Eintrag — einmal komplett neu hochladen (`course-upload`), dann ist checkout möglich      |
| 5    | lokaler Fehler (Ordner existiert, Slug ungültig …)  | Fehlermeldung lesen. Mit `--force` überschreiben (nur nach expliziter User-Bestätigung — lokale Edits gehen verloren) |
| 29   | `rate_limited`                                      | `retry_after_sec` warten (30 Req/min), dann nochmal                                                            |

Bei 401 **niemals retryen** — Token ist tot, neu minten.

## Nach erfolgreichem Checkout

- Bundle-Ordner liegt lokal unter `<outDir>/<slug>/`
- Autor editiert MDX-Dateien und Assets nach Bedarf
- Nächste Schritte vorschlagen:
  1. Änderungen machen (Lektionen schreiben, Bilder tauschen, …)
  2. Optional: `course-validate` für einen lokalen Format-Check
  3. `course-upload` — Bundle als Draft hochladen; Server schreibt neue
     `version` automatisch zurück
  4. Draft in der Learner-Shell reviewen (`<platformBaseUrl>/courses/<slug>`,
     Kuratoren sehen Drafts)
  5. `course-publish` — wenn alles passt: live schalten
