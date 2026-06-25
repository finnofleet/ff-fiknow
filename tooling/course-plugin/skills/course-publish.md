---
name: course-publish
description: |
  Schaltet einen bereits hochgeladenen (Draft-)Course **live**. Separater,
  expliziter Schritt: ein Upload landet IMMER als Draft, Live-Schalten
  braucht eine bewusste Handlung. Nutze diesen Skill wenn der User
  „veröffentlichen" / „publishen" / „live schalten" / „freigeben" sagt.
  Hochladen selbst → siehe `course-upload`.
arguments:
  - name: courseId
    description: Numerische Course-ID (aus dem Upload-Output oder der Plattform-URL/Admin-UI)
    required: true
  - name: includeChildren
    description: |
      Default `true`. Auf `false` setzen, wenn nur der Course umgeschaltet
      werden soll, ohne Sections/Lessons (selten gebraucht — Sections und
      Lessons bleiben dann unsichtbar am Frontend).
    required: false
---

# Skill: course-publish

Du schaltest einen Course (und per Default alle seine Sections + Lessons)
von `draft` auf `published`. **Reine Status-Umschaltung — kein Re-Upload,
keine Content-Änderung.**

Hintergrund (ADR 0001):

> „Live gehen" bleibt eine bewusste Handlung — daher publish getrennt
> von upload, mit eigenem Endpoint und eigenem expliziten Schritt.

## Voraussetzungen

- Plugin-Config hat `platformBaseUrl` und `authoringToken` gesetzt
- Der Course ist bereits auf der Plattform (via `course-upload` oder
  Browser-Import). Du brauchst die **numerische Course-ID** — nicht den
  Slug. Wenn der User nur den Slug kennt: ihn die ID nachschlagen lassen
  (`<platformBaseUrl>/admin` → Courses).

## Ausführung

1. **Course-ID einholen** — wenn nicht im Argument:
   - Frag den User direkt („Wie ist die Course-ID? Steht in der
     Admin-URL: /admin/collections/courses/<ID>")
   - oder zeig die ID aus dem letzten Upload-Output, falls verfügbar.

2. **User explizit bestätigen lassen** — das ist eine sichtbare Aktion:

   > Ich publishe Course-ID `<courseId>` (`<slug-aus-frontmatter-falls-bekannt>`).
   > Per Default werden auch alle Sections und Lessons mitveröffentlicht.
   > OK so?

   Bei „nein, nur Course" → `--no-children` setzen.

3. **Publish-Endpoint aufrufen**:

   ```bash
   EDU_PLATFORM_BASE_URL="$platformBaseUrl" \
   EDU_AUTHORING_TOKEN="$authoringToken" \
   node <plugin-root>/scripts/client.mjs publish <courseId>
   ```

   Optional ohne Children:
   ```bash
   ... node <plugin-root>/scripts/client.mjs publish <courseId> --no-children
   ```

4. **Erfolgs-Output verarbeiten** (JSON auf stdout):

   ```json
   {
     "ok": true,
     "command": "publish",
     "courseId": 42,
     "includeChildren": true,
     "course": { "id": 42, "slug": "...", "status": "published" },
     "children": { "sections": 5, "lessons": 23 }
   }
   ```

   Dem User berichten:
   - Course + N Sections + M Lessons sind live
   - Live-URL: `<platformBaseUrl>/courses/<slug>`

## Fehler-Codes

| Exit | Bedeutung                          | Reaktion                                                                              |
|------|------------------------------------|---------------------------------------------------------------------------------------|
| 2    | `invalid_token` / `not_logged_in`  | Token im Browser neu minten, in Plugin-Config eintragen                               |
| 3    | `insufficient_role`                | Plattform-Admin um Curator/Admin-Rolle bitten                                         |
| 4    | `invalid_course_id` / 400          | Course-ID prüfen — positive Ganzzahl?                                                 |
| 4    | `course_not_found` / 404           | Course mit dieser ID existiert nicht (auch nicht als Draft) — Slug verwechselt?       |
| 29   | `rate_limited`                     | `retry_after_sec` warten (20 Req/min), dann nochmal                                   |

Bei 401 **niemals retryen** — Token tot, neu minten.

## Nach dem Publish

- Live-URL nennen: `<platformBaseUrl>/courses/<slug>`
- Hinweis, dass künftige Content-Änderungen wieder über
  `course-upload` (Draft) → Review in der Learner-Shell → `course-publish` (live)
  laufen
- Wenn der User stattdessen einen Course **zurückziehen** will: das geht
  in Phase 1 nur über die Admin-UI (kein dedizierter unpublish-Endpoint
  im Authoring-API-Vertrag)

## Sicherheit

- Token NIE in stdout/Logs ausgeben
- Bewusste Bestätigung vor dem Publish — kein „silent push" durch den Agent
- Publish wirkt sofort — alle Visitor:innen sehen den Kurs direkt
  (Caching der Plattform vorausgesetzt, oft ein paar Sekunden Delay)
