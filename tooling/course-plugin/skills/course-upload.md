---
name: course-upload
description: |
  Lädt ein Bundle als **Draft** zur Plattform — packt den Folder, postet
  an `/api/authoring/import`, schreibt die vom Server vergebene `version`
  ins course.mdx-Frontmatter zurück. Bei Versions-Konflikt (409) NICHT
  blind überschreiben, sondern den User entscheiden lassen. Nutze diesen
  Skill wenn der User „hochladen" / „upload" / „commit" / „einspielen" sagt.
  Für „live schalten" → siehe `course-publish`.
arguments:
  - name: bundlePath
    description: Pfad zum Bundle-Folder (Default — aktuelles Verzeichnis)
    required: false
  - name: courseSlug
    description: Slug überschreiben (Default — Bundle-Folder-Name)
    required: false
---

# Skill: course-upload

Du committest das Bundle als **Draft** zur Plattform. Live geht erst der
separate `course-publish`-Skill. Das ist Absicht aus ADR 0001:

> Upload ≠ Publish. Jeder Upload landet als Draft (Blast-Radius klein);
> publish bleibt eine getrennte, explizite Aktion.

## Voraussetzungen

- Plugin-Config hat `platformBaseUrl` und `authoringToken` gesetzt
- Bundle-Folder hat `course.mdx` im Root
- Folder-Name ist gültiger Slug (`^[a-z0-9-]+$`)
- Optional, aber sehr empfohlen: vorher `course-validate` aufrufen

## Ausführung

1. **Bundle-Pfad bestimmen** — Default: aktuelles CWD; wenn `bundlePath`
   gesetzt, dort.

2. **Upload-Endpoint aufrufen** — env-Vars aus der Plugin-Config:

   ```bash
   EDU_PLATFORM_BASE_URL="$platformBaseUrl" \
   EDU_AUTHORING_TOKEN="$authoringToken" \
   node <plugin-root>/scripts/client.mjs upload <bundlePath>
   ```

   Bei abweichendem Slug:
   ```bash
   ... node <plugin-root>/scripts/client.mjs upload <bundlePath> --course-slug <slug>
   ```

3. **Erfolgs-Output verarbeiten** (JSON auf stdout):

   ```json
   {
     "ok": true,
     "command": "upload",
     "courseSlug": "...",
     "bundleSizeHuman": "28.4 KB",
     "fileCount": 12,
     "summary": { /* ImportSummary */ },
     "versionWriteBack": { "applied": true, "version": "01HXYZ...", "file": "..." },
     "status": "draft",
     "hint": "..."
   }
   ```

   Dem User klar berichten:
   - Was hochgeladen wurde (Slug, Datei-Count)
   - **Es liegt als Draft** — noch nicht live
   - Wenn `versionWriteBack.applied: true` → das Bundle ist jetzt
     self-identifying, der nächste Upload findet den Konflikt zuverlässig
   - Wenn `applied: false` → User sanft warnen: „der nächste Upload
     könnte einen unnötigen 409 auslösen; ggf. das `version`-Feld manuell
     vom Server-Stand übernehmen"
   - Nächster Schritt-Vorschlag: Draft in der Learner-Shell reviewen
     (Kuratoren sehen Drafts), dann `course-publish` zum Live-Schalten

## 409 — Versions-Konflikt (Pflicht-Handling)

Wenn `client.mjs` mit **Exit-Code 9** beendet und JSON auf stderr:

```json
{
  "ok": false,
  "error": "version_conflict",
  "message": "...",
  "server": { "courseSlug": "...", "expected": "<lokal>", "current": "<server>", "detail": "..." }
}
```

**Nicht blind überschreiben.** Dem User zeigen:

> Versions-Konflikt: Dein Bundle basiert auf Version `<expected>`, aber
> auf der Plattform ist inzwischen Version `<current>` aktiv. Wahrscheinlich
> hat eine andere Session / Person den Kurs zwischenzeitlich aktualisiert.
>
> Empfehlung: erst die Server-Version herunterladen (oder im Browser
> reviewen), Änderungen mergen, dann nochmal hochladen.
>
> Soll ich trotzdem überschreiben? (gefährlich — die Fremd-Änderungen
> gehen verloren)

Erst **nach expliziter Bestätigung** den Force-Path nehmen — und auch das
nur, wenn der Workflow ihn vorsieht (heute: manuell das `version`-Feld im
course.mdx auf den `current`-Wert setzen und neu uploaden; ein
`--force`-Flag ist bewusst nicht implementiert).

## Weitere Fehler-Codes

| Exit | Bedeutung                          | Reaktion                                                                                  |
|------|------------------------------------|-------------------------------------------------------------------------------------------|
| 2    | `invalid_token` / `not_logged_in`  | Token im Browser neu minten (POST /api/authoring/tokens), in Plugin-Config eintragen      |
| 3    | `insufficient_role`                | Plattform-Admin um Curator/Admin-Rolle bitten                                             |
| 4    | `bundle_validation_failed` / 400   | Detail aus `server.detail` zeigen (welche MDX-Datei, welche Zeile), fixen + nochmal       |
| 9    | `version_conflict`                 | siehe Abschnitt oben                                                                       |
| 13   | `bundle_too_large`                 | Bundle > 100 MB — Assets ausdünnen oder einzelne Lessons in eigene Bundles aufteilen     |
| 29   | `rate_limited`                     | `retry_after_sec` warten (10 Req/min), dann nochmal                                       |
| 5    | lokaler Fehler                     | Bundle-Pfad, course.mdx, Slug prüfen                                                      |

Bei 401 **niemals retryen** — der Token ist tot.

## Sicherheit

- Token NIE in stdout/Logs ausgeben (`client.mjs` redacted defensiv)
- Bei jedem Upload: serverseitige Re-Validierung läuft IMMER, der
  client-seitige `course-validate` ist nur Frühwarnung — niemals als
  Sicherheits-Argument benutzen
- Idempotenz: gleicher Slug + Bundle = Upsert, keine Duplikate
- Phase-1-Verhalten: im Bundle fehlende Sections/Lessons werden NICHT
  automatisch gelöscht (siehe `AUTHORING_BUNDLE.md`)

## Nach erfolgreichem Upload

- Course-URL: `<platformBaseUrl>/courses/<slug>` — als Kurator/Admin ist
  der Draft dort sichtbar (Learner-Shell zeigt Drafts via
  `viewerCanSeeDrafts()`)
- Nächste Schritte vorschlagen:
  - Draft in der Learner-Shell reviewen, Feedback einholen
  - `course-publish` wenn alles passt und live gehen soll
- `version`-Feld bleibt im course.mdx — beim nächsten Upload greift die
  Konflikt-Erkennung wieder
