# Lernpfade authoren (MCP)

Ein **Lernpfad** bündelt bestehende Kurse zu einer Reihe — geführt (linear) oder
als lose Empfehlung. Anders als ein Kurs ist ein Pfad **kein Bundle**: kein MDX,
keine Sections/Lessons, keine Assets. Er ist ein flaches, strukturiertes Objekt
und wird direkt über MCP-Tools geschrieben (nicht als ZIP/Datei).

> Pfade referenzieren Kurse **per Slug** — sie besitzen sie nicht. Ein Kurs kann
> in mehreren Pfaden sein; Pfade lassen sich vor oder nach den Kursen anlegen.

## Felder

| Feld | Pflicht | Anmerkung |
|---|---|---|
| `slug` | ✓ | kebab-case, `^[a-z0-9-]+$`, landet in `/paths/<slug>` |
| `title` | ✓ | |
| `subtitle` | – | |
| `description` | – | kurzer Pitch für die Detailseite |
| `fuehrungsgrad` | ✓ | `linear` (geführt) oder `lose` (empfohlen) — **nur Darstellung**, sperrt nichts |
| `courses` | ✓ (≥1) | geordnete Liste; Position = Reihenfolge im Pfad |

Pro Kurs in `courses`:

| Feld | Pflicht | Werte |
|---|---|---|
| `courseSlug` | ✓ | Slug eines bestehenden Kurses (`list_courses`) |
| `role` | ✓ | `required` (Kern) / `recommended` (Empfohlen) / `optional` (Optional) |

Doppelte `courseSlug` werden dedupliziert (erstes Vorkommen gewinnt). Unbekannte
Slugs sind ein Fehler (Tippfehlerschutz). Ein referenzierter Kurs darf ein Draft
sein — er erscheint dann für Lerner als „nicht verfügbar", bis er published ist.

## Fortschritt

Pfad-Fortschritt wird **abgeleitet** (Coursera-Muster „X/Y Kurse"): ein Kurs gilt
als fertig, wenn alle seine Lektionen abgeschlossen sind. Kein eigenes Tracking.

## Lebenszyklus (Draft → Publish)

Ein Pfad landet beim Anlegen/Ändern **immer als Draft** — nie sofort live. Autoren
und Admins sehen Drafts unter `/paths` (Badge „Entwurf") und können sie im echten
Learner-Shell testen, bevor sie live gehen.

## MCP-Tools

| Tool | Zweck |
|---|---|
| `list_courses` | Kurs-Slugs finden (Discovery) |
| `import_path` | Pfad anlegen/ändern (Upsert by Slug) → **Draft** |
| `get_path` | Pfad vollständig abrufen (zum Editieren: ziehen → ändern → `import_path`) |
| `list_paths` | alle Pfade inkl. Drafts |
| `publish_path` | live schalten |
| `unpublish_path` | offline nehmen (zurück auf Draft, reversibel) |
| `delete_path` | endgültig löschen (berührt keine Kurse) |

### Flow: neuen Pfad anlegen
1. `list_courses` — die richtigen Kurs-Slugs heraussuchen.
2. `import_path` — Slug, Titel, `fuehrungsgrad`, `courses[]` mit Rollen. → Draft.
3. Als Admin `/paths/<slug>` öffnen, Reihenfolge/Rollen prüfen.
4. `publish_path` — live.

### Flow: bestehenden Pfad ändern
1. `get_path(slug)` — aktuellen Stand vollständig ziehen.
2. Felder/Kursliste anpassen.
3. `import_path` — zurückschreiben (landet wieder als Draft).
4. `publish_path` — erneut live.
