# verstande.ch — Design-Entscheidungen

Stand: 2026-04-19
Quelle der Auswahl: `~/Downloads/verstande-review.json`

## Pro Template

| Template | Auswahl | Anmerkung |
|---|---|---|
| **landing** | Variante A | — |
| **catalog** | Variante A | — |
| **course** | Variante A | — |
| **auth** | Variante A | radialer Hintergrund-Verlauf entfernen (siehe „Verläufe") |
| **dashboard** | **Mix** | Header/Greeting/Continue-Card + Side-Stats aus **A**, Kursliste aus **B** (editoriale `b-item`-Zeilen mit Nummer + Progress rechts) |
| **lesson-reading** | Variante A | rechte TOC-Bullets (`.a-right-rail .toc`) entfernen; `.a-tools` (Notizen, Lesezeichen, Markieren etc.) bleibt im rechten Rail |
| **lesson-video** | **Mix** | Variante A als Basis (Theater + Sidebar), aber: Transkript togglebar (Default: aus), Funktionsbuttons (Notizen etc.) konsistent ins **rechte Rail** wie bei lesson-reading, nicht unter dem Video |
| **lesson-quiz** | Variante A | — |
| **profile** | Variante A | Hero-Verlauf entfernen |
| **certificate** | **drop** | beide Varianten nicht überzeugend; Phase-1-Scope sieht ohnehin keine Zertifikate vor |

## Globale Regel: keine Verläufe

Yves mag keine `linear/radial-gradient`. Konsequent ersetzen:

| Wo Verlauf bisher | Ersatz |
|---|---|
| **Dekorative Atmosphäre** (`auth.html` radial, `dashboard.html .a-cont::before`, `profile.html` Hero) | ersatzlos streichen |
| **Cover-Platzhalter** für Kurse (catalog, landing, course, dashboard) | flacher `var(--bg-elev-2)`-Block mit 1px `var(--line)`-Border und Display-Serif-Caption als Platzhalter, bis echte Cover-Bilder vorliegen |
| **Figure-Platzhalter** (`lesson-reading.html .figure .fig-body`) | wie oben: solide `bg-elev-2`-Fläche, Display-Caption |
| **Video-Player-Poster** (`lesson-video.html`) | solides `#0a0a0a` mit zentrierter Play-Overlay; reale Video-Embeds ersetzen das ohnehin |
| **Quiz-Hero** (`lesson-quiz.html`) | solider `bg-elev`-Block |
| **Design-System-Beispiel** | irrelevant, bleibt als Referenz im Archiv |

Spurensuche: `grep -n "gradient" design/templates/*.html` listet alle ~22 Stellen — werden bei der Implementierung systematisch ersetzt.

## Geltende Tokens (aus `shared/tokens.css`)

Unverändert übernommen — `tokens.css` wandert 1:1 in das Next.js-Projekt:
- Fonts: Newsreader, Manrope, JetBrains Mono
- Type-Scale: 11–112 px
- OKLCH-Farben, Dark default + Light-Toggle
- Spacing 4–96 px, Radius 4/8/14/22/999

## Daraus folgende Komponenten (für die Implementierung)

**Layout-Atomar**: TopNav, LessonTopNav (kompakt + Crumb + Progress), Footer, Sidebar (Curriculum), RightRail (Tools), VarSwitch (entfällt in Prod).

**MDX-Bausteine** (rendern Lesson-Content konsistent):
- `<Callout type="info|tip|warning">`
- `<KeyTakeaways>`
- `<Figure caption>` (solid Cover, später Bild)
- `<Pullquote>`
- `<Steps>`
- `<DefinitionList>`
- `<Question>` (Single-/Multi-Choice für Quiz)

**UI-Komponenten**: CourseCard, CourseRow (editorial), ProgressBar, Pill/Badge, Button (primary/ghost), Stat-Tile, ChapterAccordion, ToolsButton, ThemeToggle.

## Was bleibt offen

Nichts Entscheidendes — Implementierung kann starten.
