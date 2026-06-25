---
name: course-diagram
description: |
  Authort ein didaktisches SVG-Diagramm und bettet es in eine Lesson ein.
  Nutze diesen Skill wenn ein Diagramm, Schema oder Ablauf den Inhalt
  klarer macht — Prozess, Beziehung, Vergleich, Hierarchie, Fluss.
arguments:
  - name: lesson
    description: Pfad zur Ziel-Lesson-MDX (optional — wird im Dialog geklärt)
    required: false
  - name: topic
    description: Was dargestellt werden soll (optional — wird im Dialog geklärt)
    required: false
---

# Skill: course-diagram

Du authorst ein SVG-Diagramm, das zum Brand der Plattform passt, und
platzierst es mit dem richtigen `<Figure>`-Tag in der Lesson-MDX.

## Ausführung

1. **Brand-Idiom bestimmen** — aus `platformBaseUrl` ableiten:
   - `verstande.ch` → **Sketch** (handgezeichnet, feste Elfenbein-Karte, Filter)
   - `fiknow.ch` / `finnofleet` → **Clean** (theme-adaptiv, `currentColor`, kein Filter)
   - Wenn unklar oder nicht konfiguriert: kurz nachfragen.

2. **Diagramm-Typ + Inhalt klären** — mit dem Autor abstimmen:
   - Was soll das Diagramm zeigen? (Prozess/Ablauf, Beziehung/Schema,
     Vergleich, Hierarchie)
   - Welche Elemente/Schritte/Knoten braucht es?
   - Wenn `topic`-Argument gegeben: sofort damit arbeiten, nicht nochmal
     fragen.

3. **SVG authoren** — strikt nach `examples/DIAGRAM-STYLE.md`:

   **verstande Sketch:**
   - `feTurbulence`+`feDisplacementMap`-Filter definieren; `seed` fix lassen.
   - Papier-Rect `fill="#F3EFE6"` als erstes SVG-Child.
   - Linienwerk in `<g filter="url(#rough)">`, Text AUSSERHALB (separate Gruppe).
   - Palette: Tinte `#4E463F`, Amber `#D9A441`, Terracotta `#B56E4D`, Grau `#C8C2B2`.
   - Cross-Hatching statt Schlagschatten; lavierende Füllungen (`fill-opacity` 0.2–0.5).
   - Fonts: `Newsreader, Georgia, serif` (Headlines); `'JetBrains Mono', ui-monospace, monospace` (Kicker).

   **fiknow Clean:**
   - **KEIN** `<filter>`, **KEIN** Hintergrund-Rect (SVG bleibt transparent).
   - Tinte/Linien = `currentColor` (NICHT `#333` oder eine feste Farbe).
   - Neutral-Füllungen = `currentColor` mit `fill-opacity` 0.06–0.16.
   - Gedämpfte Labels = `currentColor` mit `fill-opacity` ~0.55.
   - Lime `#99FF33` nur als Fläche/Highlight; **Text auf Lime-Fläche = `#22310F`** (fix dunkel).
   - Sekundäre/kategoriale Flüsse: Blau `#2D779B` / `#68B8DF` (fix, nicht `currentColor`).
   - Font: `Sora, system-ui, -apple-system, 'Segoe UI', sans-serif`.

   **Beide Idiome — immer:**
   - Pfeilköpfe: offene Chevrons aus zwei `<line>` mit `stroke-linecap="round"`,
     `markerUnits="userSpaceOnUse"`. KEINE gefüllten Dreiecke.
   - Pfeil-Fallen beachten: (1) gerade+Kurve als EIN Pfad `M…L…C…`, nur EIN
     `marker-end` am Ende. (2) Letzten Bezier-Kontrollpunkt so legen, dass
     die End-Tangente die gewünschte Richtung zeigt.
   - `viewBox` setzen, KEINE festen `width`/`height`.
   - `role="img"` + `<title id="t1">` + `<desc id="d1">` + `aria-labelledby="t1 d1"`.
   - KEIN `<script>`, KEIN `<foreignObject>`.

4. **Datei schreiben** — unter `assets/images/<kurs-slug>-<name>.svg` im Bundle.
   Dateiname plattformweit eindeutig halten.

5. **Platzierungs-Dialog** — dem Autor vorschlagen (er editiert keinen Code):
   - An welcher Stelle der Lesson-MDX die Figur sitzt (z. B. „nach dem Absatz,
     der X erklärt" oder „vor der Zusammenfassung").
   - Eine **Caption** (sichtbare Bildunterschrift, 1–2 Sätze).
   - Einen **Alt-Text** (a11y-Pflicht; beschreibt was zu sehen ist, nicht
     was es bedeutet).
   - Bestätigung abwarten, bevor du schreibst.

6. **Einfügen** — an der bestätigten Stelle in die Lesson-MDX:

   ```mdx
   <Figure
     src="assets/images/<kurs-slug>-<name>.svg"
     alt="<alt-text>"
     caption="<caption>"
   />
   ```

7. **Hinweis an den Autor** — kurz erwähnen:
   - fiknow-Diagramme sind **automatisch theme-adaptiv** (Light/Dark): die
     Plattform rendert das SVG inline, `currentColor` erbt den Karten-Grund.
     Keine eigenen fixen Tinten-Farben verwenden, das würde die Adaption
     brechen.
   - verstande-Diagramme haben eine **feste Elfenbein-Karte** und passen sich
     nicht ans Theme an — das ist Absicht.

8. **Validieren** — auf `course-validate` verweisen; der Upload re-sanitisiert
   das SVG serverseitig (Script/ForeignObject werden geblockt, Filter bleiben
   erhalten).

## Hinweise

- Ein Diagramm pro Lesson ist genug — mehr lenkt ab.
- Wenn sich ein Sachverhalt besser als **Tabelle** darstellen lässt
  (Vergleich mit Mehrfach-Attributen), empfehle stattdessen eine
  Markdown-Tabelle — die braucht kein SVG.
- Stil-Details und Minimal-Snippets: `examples/DIAGRAM-STYLE.md`.
