# Authoring-Bundle-Format

Ein **Authoring-Bundle** ist die Quelle eines Kurses. Es lebt als Ordner mit
MDX-Files plus Assets und wird vom Authoring-Client (Plugin oder CLI) direkt
via Upload-Endpoint hochgeladen — alternativ manuell im Browser via
`/manage/import`. Für den
direkten Upload authentifiziert sich der Client mit einem scoped
Authoring-Token (nur Authoring-Scope, kurze TTL, widerrufbar; siehe ADR 0001
+ `SECURITY_AUDIT.md`, Abschnitt „Authoring-Pipeline").

Dieses Dokument ist die Referenz für:

- Das Course-Authoring-Plugin (Claude Cowork) — produziert Bundles in diesem Format
- Die Plattform — akzeptiert genau dieses Format am Upload-Endpoint
- Manuelle Autor:innen (du, in VS Code) — orientieren sich an der gleichen Spec

---

## Ordnerstruktur

```
<course-slug>/
  course.mdx                          # Kurs-Metadaten (Pflicht)
  <NN>-<section-slug>/                # Sektion, NN = 2-stellige Reihenfolge
    section.mdx                       # Sektion-Metadaten (optional)
    <MM>-<lesson-slug>.mdx            # Lesson, MM = 2-stellige Reihenfolge
    <MM>-<lesson-slug>.mdx
  <NN>-<section-slug>/
    ...
  assets/                             # Bilder + andere Medien (optional)
    images/
      *.{png,jpg,svg,webp,gif}
```

**Regeln:**

- `course-slug` und alle Sub-Slugs: lowercase, Bindestriche, ASCII (Regex: `^[a-z0-9-]+$`)
- `NN-` und `MM-`-Präfixe: 2-stellige Zahl, definieren die Anzeige-Reihenfolge.
  Auf `01-` folgt `02-`, nicht `1-` / `2-` (Sortier-Stabilität)
- Lesson-Slugs sind innerhalb einer Sektion eindeutig; Section-Slugs innerhalb
  eines Kurses eindeutig; Course-Slugs plattformweit eindeutig
- Pro Kurs maximal eine `course.mdx` an der Wurzel
- Sektion-Ordner-Name = `NN-<slug>`; daraus wird `orderIndex=NN` und
  `slug=<slug>` abgeleitet
- Lesson-Datei-Name = `MM-<slug>.mdx`; daraus wird `orderIndex=MM` und
  `slug=<slug>` abgeleitet

---

## Frontmatter pro Datei-Typ

### `course.mdx`

```yaml
---
title: "Drohnen-Führerschein A2"
subtitle: "EU-Kompetenznachweis A2 sicher vorbereiten"
description: "Alles, was du für die A2-Theorieprüfung wissen musst — kompakt, mit Beispielen und Übungsfragen."
category: "Recht"
difficulty: "einsteiger"
estimated_minutes: 360
prerequisites: "Keine Vorkenntnisse nötig. Eine eigene Drohne hilft, ist aber kein Muss."
status: "draft"
cover: "assets/images/a2-drohne-cover.jpg"
cover_alt: "Drohne über alpiner Landschaft im Morgenlicht"
version: "01HXYZ..."        # vom Server gesetzt, nicht manuell editieren
---

Optionaler Markdown-Body als Kurs-Einleitung (wird derzeit nicht im Modell
gespeichert, kann aber für Bundle-übergreifende Beschreibung dienen).
```

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `title` | string | ✓ | Anzeige-Titel |
| `subtitle` | string | – | Kurze Zusatzzeile unter dem Titel |
| `description` | string | ✓ | Für Katalog + Meta-Description (≤ 200 Zeichen) |
| `category` | string | – | freitext, z.B. `Recht`, `Sprache`, `Onboarding` |
| `difficulty` | enum | – | `einsteiger` \| `fortgeschritten` \| `experte` |
| `estimated_minutes` | number | – | Gesamtdauer in Minuten |
| `prerequisites` | string | – | Voraussetzungen, freitext |
| `status` | enum | – | `draft` (default) \| `published` |
| `cover` | string | – | Bundle-relativer Pfad zu einem Bild-Asset (z. B. `assets/images/cover.jpg`); der Import verknüpft es mit `courses.coverImage` — es rendert auf Kurs-Kachel + Detailseite |
| `cover_alt` | string | – | Alt-Text für das Cover-Bild |
| `version` | string | – | Vom Server beim Download gesetzt. Wird beim Upload geprüft; bei Mismatch lehnt der Server mit 409 + Diff ab statt blind zu überschreiben. **Nicht manuell editieren.** |

### `section.mdx` (optional)

```yaml
---
title: "Grundlagen"
description: "Worum es bei A2 überhaupt geht und wo es rechtlich verankert ist."
---

Optionaler Markdown-Body als Sektion-Einleitung.
```

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `title` | string | ✓ | Anzeige-Titel |
| `description` | string | – | Kurze Beschreibung in der Sektions-Übersicht |

**Fehlt `section.mdx`,** wird `slug` (aus dem Ordnername) als Titel verwendet.

### `<MM>-<slug>.mdx` (Lesson)

**Reading-Lesson:**
```yaml
---
title: "Was ist die A2-Kategorie?"
type: "reading"
estimated_minutes: 10
summary: "Die EU teilt Drohnenflüge nach Risiko in drei Kategorien..."
---

# Was ist die A2-Kategorie?

Markdown-Body mit MDX-Komponenten.
```

**Quiz-Lesson:**
```yaml
---
title: "Quiz: Grundlagen A2"
type: "quiz"
estimated_minutes: 5
summary: "Fünf Fragen, um die Grundbegriffe zu festigen."
passing_score: 0.7
---

# Quiz: Grundlagen A2

<Question
  prompt="In welcher EU-Hauptkategorie bewegt sich A2?"
  explanation="A2 ist Unterklasse der Open-Kategorie."
>
  <Option correct={true}>Open</Option>
  <Option>Specific</Option>
  <Option>Certified</Option>
</Question>
```

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `title` | string | ✓ | Anzeige-Titel |
| `type` | enum | ✓ | `reading` \| `quiz` \| `video` \| `exercise` |
| `estimated_minutes` | number | – | Lesezeit / Dauer |
| `summary` | string | – | Kurze Beschreibung, taucht in Lektion-Karten + Meta auf |
| `passing_score` | number | – | Nur `quiz`: 0–1, wird zur Bestehensgrenze (default 0.7) |
| `video_url` | string | – | Nur `video`: URL der Video-Quelle |
| `transcript` | string | – | Nur `video`: vollständiger Transkript-Text |

---

## Verfügbare MDX-Komponenten

Im Body einer Lesson können diese Komponenten ohne `import` direkt verwendet
werden — die Plattform injiziert sie beim Rendern. Sie müssen exakt mit dem
hier gezeigten Namen geschrieben werden (PascalCase, props in JSX-Syntax).

### `<Callout>` — Hinweis-Box

```jsx
<Callout type="info" title="Wichtig zu wissen">
  Inhaltlicher Hinweis…
</Callout>
```

`type`: `info` \| `warning` \| `tip` \| `note`. `title`: optional.

### `<KeyTakeaways>` + Liste

```jsx
<KeyTakeaways>
  - Erster Take-Away
  - Zweiter Take-Away
  - Dritter Take-Away
</KeyTakeaways>
```

### `<Figure>` — Bild mit Beschriftung

```jsx
<Figure src="assets/images/klassen-uebersicht.png" alt="Übersicht der Klassen" caption="Quelle: BAZL, 2024." />
```

`src` ist relativ zum Bundle-Root. Das Plugin/Upload-Process rechnet das in
einen Plattform-Pfad um.

### `<Steps>` — Nummerierte Schritte

```jsx
<Steps>
  1. **Erster Schritt** — Beschreibung
  2. **Zweiter Schritt** — Beschreibung
  3. **Dritter Schritt** — Beschreibung
</Steps>
```

### `<DefinitionList>` + `<Definition>` — Glossar

```jsx
<DefinitionList>
  <Definition term="A2">Open-Unterklasse für nahe Flüge an Personen.</Definition>
  <Definition term="BAZL">Bundesamt für Zivilluftfahrt (CH).</Definition>
</DefinitionList>
```

### `<Pullquote>` — Hervorgehobenes Zitat

```jsx
<Pullquote>
  „Verstehen ist der Anfang, nicht das Ende des Lernens."
</Pullquote>
```

### `<Question>` + `<Option>` — Quiz-Block

Nur in Lessons mit `type: "quiz"` sinnvoll. Beispiel:

```jsx
<Question
  prompt="Wo gilt die Geo-Zone CTR?"
  explanation="CTRs umgeben Flugplätze mit Tower-Verkehr."
  type="single"
>
  <Option correct={true}>Rund um kontrollierte Flugplätze</Option>
  <Option>Über allen Stadtgebieten</Option>
  <Option>Nur über Nationalparks</Option>
</Question>
```

`type`: `single` (default) \| `multi`. Im `multi`-Modus können mehrere
`<Option correct={true}>` als richtig markiert werden.

---

## Asset-Handling

Bilder, SVGs und andere Medien landen unter `assets/images/` im Bundle-Root.
In MDX werden sie via relativem Pfad referenziert:

```mdx
<Figure src="assets/images/klassen-uebersicht.png" alt="…" />

oder klassisch:

![Klassen-Übersicht](assets/images/klassen-uebersicht.png)
```

**Beim Upload zur Plattform:**

1. Plugin/Endpoint lädt jede `assets/*`-Datei in die Payload-Media-Collection hoch
2. MDX-Pfade werden umgeschrieben: `assets/images/foo.png` → `/media/<id>/foo.png`
3. Bestehende Media-Einträge mit gleichem Filename werden überschrieben
   (Idempotenz)

**Erlaubte MIME-Types:** `image/jpeg`, `image/png`, `image/webp`, `image/gif`,
`image/svg+xml`. Andere werden beim Upload abgelehnt.

---

## Idempotenz

Das Bundle kann beliebig oft hochgeladen werden — bei jedem Upload:

- **Existierender Course (gleicher `slug`)**: wird aktualisiert
- **Existierende Section** (`course.id` + `slug` Match): wird aktualisiert
- **Existierende Lesson** (`section.id` + `slug` Match): wird aktualisiert
- **Neu hinzugekommene** Sections/Lessons: werden angelegt
- **Im Bundle fehlende** Sections/Lessons: werden **nicht** automatisch
  gelöscht (Phase-1-Verhalten). Manuelles Löschen via Payload-Admin nötig

→ Strategie ist „Bundle wins" für bestehende Records, aber konservativ
beim Löschen. Phase 2 wird einen geplanten Diff-Schritt vor dem Commit zeigen
(Record-Diff, kein Render-Preview).

---

## Konflikt-Erkennung

Das Bundle ist **selbst-identifizierend**: Beim ersten Upload generiert der
Server eine ID und gibt die aktuelle `version` beim Download ins
`course.mdx`-Frontmatter zurück. Jeder Re-Upload schickt diese Version mit.

- Stimmt die mitgeschickte `version` mit der Server-Version überein → das
  Update läuft normal durch.
- Weicht sie ab (jemand anderes — oder eine ältere KI-Session — hat
  zwischenzeitlich hochgeladen) → der Server antwortet mit **409 Conflict** +
  Diff-Vorschlag statt Last-Write-Wins.

Das verhindert stilles Überschreiben von Fremdänderungen. Das Feld wird
**nicht manuell editiert** — wer den Wert löscht, zwingt den Server, das
Bundle als „neu, ohne bekannte Version" zu behandeln (neuer Record oder
expliziter Override nötig). Hintergrund: ADR 0001, Konsequenz
„Konflikt-Erkennung".

---

## Upload-Flow

Der Authoring-Client (Plugin/CLI) arbeitet in zwei Einstiegen und drei Stufen:

**Neuer Kurs:** `course-init` scaffoldet das Bundle lokal.

**Bestehender Kurs:** `checkout` (`client.mjs checkout <slug>` →
`GET /api/authoring/export/<slug>`) lädt den aktuellen Stand als ZIP herunter;
der Server injiziert die autoritative `version` ins `course.mdx`-Frontmatter
(Self-Identifying Bundle für Konflikt-Erkennung).

Danach in beiden Fällen:

1. **edit** — Bundle lokal bearbeiten (KI-gestützt oder von Hand).
2. **`upload`** — Commit als Draft: das Bundle wird importiert (Idempotenz-
   Regeln gelten, Konflikt-Check läuft), Rückgabe ist eine Import-Summary.
   **Landet immer als Draft**, unabhängig vom `status`-Feld.
3. **Review im echten Learner-Shell** — Kurator:innen sehen Drafts via
   `viewerCanSeeDrafts()` im Learner-Frontend; volle Navigation + Kurs-Kontext.
4. **`publish`** — separat, explizit: Draft → live (`POST /api/authoring/publish`).

**Es gibt keinen separaten Preview-Endpoint.** Die Safety-Validierung
(`assertSafeMdx`) läuft beim Upload ohnehin; das echte Learner-Shell ist der
Review-Kanal.

Alle Stufen nutzen **denselben scoped Authoring-Token** (nur
Authoring-Scope, kurze TTL, serverseitig widerrufbar). Details: ADR 0001
(Decision 6, Nachtrag 2026-06-14) + `SECURITY_AUDIT.md`, Abschnitt
„Authoring-Pipeline".

Die konkreten HTTP-Verträge (Request/Response, Fehlercodes, Rate-Limits)
stehen in [`AUTHORING_API.md`](./AUTHORING_API.md).

---

## Status-Verhalten

- **Jeder Upload landet als Draft**, unabhängig vom `status`-Feld im
  `course.mdx`-Frontmatter. Das Feld bleibt im Spec für zukünftige
  Erweiterungen, wird aber aktuell ignoriert.
- **Publish ist eine separate, explizite Aktion** — entweder die
  `publish`-Stufe des Authoring-Clients oder der „Jetzt veröffentlichen"-Button
  im Browser-UI (`/admin/import`). Beides stellt Course + alle Sektionen +
  Lessons auf `published` um.
- Granulare Per-Lesson-Status werden in Phase 1 nicht unterstützt.

Hintergrund: Jeder Bundle-Upload soll explizit reviewbar sein. Wenn das
Frontmatter den Status sofort setzen könnte, hätten Autor:innen
versehentlich live-Schaltungen mit jedem Re-Upload — gerade bei Updates
eines schon publishten Kurses problematisch.

---

## Konventionen + Best Practices

- **Slugs stabil halten** — wenn ein Slug umbenannt wird, entsteht im
  Datenbank ein neuer Record; der alte bleibt verwaist. Lieber Slugs beim
  ersten Wurf gut wählen.
- **Reihenfolge-Präfixe in 10er-Schritten geht NICHT** — wir nutzen
  2-stellige Schritte (`01`, `02`, `03`). Einfügen einer Sektion zwischen
  `02` und `03`? Dann müssen `03+` neu nummeriert werden. (In Phase 2 wäre
  ein semantischer Reorder via UI denkbar — aktuell ist's eine Bundle-Hand-
  Edit.)
- **Bilder optimieren bevor sie ins Bundle gehen** — die Plattform liefert
  sie unverändert aus. Faustregel: PNG/JPG ≤ 500 KB, SVG nur wenn vektoriell
  sinnvoll.
- **Lesson-Bodies sollten unter ~2.000 Wörter bleiben** — zu lange Lessons
  sind didaktisch fragwürdig, und die Editierbarkeit wird zäh.

---

## Beispiel-Bundle

Ein minimales gültiges Bundle:

```
mein-mini-kurs/
  course.mdx                           # title, description, status: draft
  01-einleitung/
    01-willkommen.mdx                  # title, type: reading
    02-quiz-warmup.mdx                 # title, type: quiz, mit <Question>
```

Diese Struktur reicht für einen produktiven Upload. Sektion-`section.mdx`-
Files sind optional.
