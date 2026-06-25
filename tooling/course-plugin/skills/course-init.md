---
name: course-init
description: |
  Scaffold einen neuen Kurs-Ordner mit korrekter Bundle-Struktur
  (course.mdx + Beispiel-Section + Beispiel-Lesson). Nutze diesen Skill
  wenn der User einen neuen Kurs anlegen möchte.
arguments:
  - name: slug
    description: URL-Slug des Kurses (lowercase, Bindestriche, ASCII)
    required: true
  - name: title
    description: Anzeige-Titel des Kurses
    required: true
  - name: location
    description: Wo der Kurs-Folder erstellt werden soll (Default — aktuelles Verzeichnis)
    required: false
---

# Skill: course-init

Du erstellst eine neue Bundle-Ordner-Struktur für einen Kurs. Diese
Struktur ist die Vorlage für den weiteren Authoring-Prozess.

## Ausführung

1. **Validate Slug** — Slug muss matchen `^[a-z0-9-]+$`. Wenn nicht, bitte den
   User um einen anderen Slug.
2. **Ziel-Pfad bestimmen** — Default: `./<slug>`. Wenn ein `location`-
   Argument gegeben ist, dann dort.
3. **Folder anlegen** mit folgender Struktur:

   ```
   <slug>/
     course.mdx
     01-einleitung/
       section.mdx
       01-willkommen.mdx
     assets/
       images/        # leerer Ordner, .gitkeep o.ä.
   ```

4. **course.mdx** mit folgendem Inhalt schreiben (Werte aus User-Argumenten):

   ```mdx
   ---
   title: "<title>"
   subtitle: "Kurze Zusatzzeile (anpassen)"
   description: "Was lernen Teilnehmende in diesem Kurs? (1-2 Sätze, max. 200 Zeichen)"
   category: "Allgemein"
   difficulty: "einsteiger"
   estimated_minutes: 60
   status: "draft"
   ---

   Optionale Markdown-Einleitung, die den ganzen Kurs übergreifend
   beschreibt.
   ```

5. **01-einleitung/section.mdx**:

   ```mdx
   ---
   title: "Einleitung"
   description: "Kurze Beschreibung dieser Sektion."
   ---
   ```

6. **01-einleitung/01-willkommen.mdx**:

   ```mdx
   ---
   title: "Willkommen"
   type: "reading"
   estimated_minutes: 5
   summary: "Einführung in den Kurs und was Teilnehmende erwarten dürfen."
   ---

   # Willkommen

   Schreib hier den ersten Lektionstext. Du kannst Standard-Markdown
   verwenden plus die spezielle MDX-Komponenten der EDU-Plattform — siehe
   die Komponenten-Referenz im System-Prompt für Details.
   ```

## Danach

- Bestätige dem User, dass der Folder erstellt wurde
- Schlage vor, jetzt mit dem Inhaltlichen zu starten — frag was der Kurs
  abdecken soll, dann erweitere die Struktur (mehr Sektionen, mehr
  Lessons, ggf. Quiz)
- Erwähne, dass `course-upload` das Bundle als Draft zur Plattform
  hochlädt (Kuratoren können den Draft in der Learner-Shell ansehen)
  und `course-publish` ihn live schaltet

## Bundle-Spec

Für die vollständige Format-Referenz siehe `docs/AUTHORING_BUNDLE.md` im
edu-platform-Repo (vom Plugin als Read-Reference im examples/ mitgegeben).
