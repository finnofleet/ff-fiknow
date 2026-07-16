---
name: course-validate
description: |
  Prüft ein Bundle gegen die Format-Spec (Pflicht-Felder, Slug-Konventionen,
  Lesson-Typen, Asset-Pfade). Nutze diesen Skill vor course-publish, oder
  wenn der User „checken" / „validieren" / „ist das ok?" sagt.
arguments:
  - name: bundlePath
    description: Pfad zum Bundle-Folder (Default — aktuelles Verzeichnis)
    required: false
---

# Skill: course-validate

Du gehst das Bundle Datei-für-Datei durch und meldest Verstöße gegen die
Bundle-Format-Spec (`docs/AUTHORING_BUNDLE.md`).

## Was zu prüfen ist

### 1. Top-Level

- `course.mdx` muss existieren
- Folder-Name = Course-Slug, matcht `^[a-z0-9-]+$`

### 2. course.mdx-Frontmatter

Pflicht:
- `title: string` (nicht leer)
- `description: string` (nicht leer, ≤ 250 Zeichen empfohlen)

Empfohlen (Warnung wenn fehlt):
- `subtitle`, `category`, `difficulty`, `estimated_minutes`

Validierung:
- `difficulty` ∈ {`einsteiger`, `fortgeschritten`, `experte`} (falls gesetzt)
- `status` ∈ {`draft`, `published`} (Default `draft`)
- `estimated_minutes` ist eine positive Zahl (falls gesetzt)

### 3. Section-Ordner

- Ordner-Name matcht `^\d{2}-[a-z0-9-]+$`
- `NN`-Präfixe sind eindeutig pro Kurs (keine zwei `01-*`-Ordner)
- `NN`-Sequenz ist lückenlos und 1-basiert empfohlen (Warnung bei Lücken)

### 4. section.mdx (optional)

- Wenn vorhanden: `title: string` Pflicht

### 5. Lesson-Files

- Datei-Name matcht `^\d{2}-[a-z0-9-]+\.mdx$`
- `MM`-Präfixe eindeutig pro Sektion
- Pflicht-Frontmatter:
  - `title: string`
  - `type: enum` ∈ {`reading`, `quiz`, `video`, `exercise`}
- Type-spezifisch:
  - `type: quiz` → `passing_score: number` zwischen 0 und 1 (Default 0.7
    wenn nicht gesetzt — kein Error, nur Warning)
  - `type: video` → `video_url: string` Pflicht
- Empfohlen: `summary` für SEO + Lesson-Karte

### 6. Asset-Referenzen

- Suche im MDX-Body nach `src="assets/..."` oder `](assets/...)`
- Für jeden Pfad: prüfen ob die Datei tatsächlich unter `<bundle>/assets/...`
  existiert
- Warnung bei Asset-Files die im Bundle liegen aber nirgends referenziert
  werden (Tote Files)

### 7. MDX-Komponenten

- Suche nach `<Question`, `<Option`, `<Callout`, `<Figure`, `<Steps`,
  `<KeyTakeaways>`, `<Definition`, `<DefinitionList`, `<Pullquote`
- Wenn UNBEKANNTE Komponenten verwendet werden (z.B. `<MyComponent`),
  warnen — die wird die Plattform nicht rendern
- Bei `<Question>`: muss mindestens 2 `<Option>` Kinder haben, davon
  mindestens eines mit `correct={true}`

## Output-Format

Strukturiert in drei Sektionen:

```
✅ X Prüfungen OK
⚠️  Y Warnungen
❌ Z Fehler

ERRORS (blockieren publish):
  - <datei>: <kurze Beschreibung> + Vorschlag

WARNINGS:
  - <datei>: <kurze Beschreibung>

Tipp: bei Fragen siehe docs/AUTHORING_BUNDLE.md
```

Wenn KEINE Errors → User darf publishen. Wenn Errors → vorher fixen.

## Hinweis

Diese Validierung läuft client-seitig (Claude liest die Files). Die
gleichen Checks passieren server-seitig im Upload-Endpoint nochmal — der
Skill ist nur ein „Frühwarner", damit User nicht erst nach erfolglosen
Uploads merkt was nicht passt.
