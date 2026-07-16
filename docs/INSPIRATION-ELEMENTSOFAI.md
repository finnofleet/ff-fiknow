# Inspirations-Analyse: Elements of AI

Elements of AI ist ein kostenloser MOOC der Universität Helsinki und MinnaLearn, der seit 2018 über 2 Millionen Teilnehmer erreicht hat. Wir schauen hin, weil er inhaltlich anspruchsvoll, technisch schlank und lernpsychologisch gut durchdacht ist — und weil er eine ähnliche 3-Ebenen-Hierarchie wie unsere Plattform umsetzt.

Beide URLs live besucht: `www.elementsofai.de` (Marketing) und `course.elementsofai.com/de/` (Plattform), Stand 2026-05-16.

---

## 1. Modell / Hierarchie

Die Ebenen heissen **Kapitel → Abschnitt → Übung**, nicht Course/Section/Lesson. Ein Kurs hat genau **6 Kapitel**, jedes Kapitel hat genau **3 Abschnitte** — ausnahmslos, vermutlich kuratorische Entscheidung. Jeder Abschnitt enthält **1–4 Übungen** (Median ca. 2). Die Übungszahl wird auf der Kursübersicht als `0/2` etc. schon angezeigt, bevor man den Abschnitt öffnet. Es gibt zwei Kurse: „Elements of AI" (Einführung, kein Code) und „Building AI" (mit Python) — letzterer liegt auf einer separaten Domain (`buildingai.elementsofai.com`) und ist klar als Fortsetzung positioniert.

## 2. Layout & Navigation

Die Lesson-Page hat **keine Sidebar**. Das Layout ist konsequent single-column, ca. 600 px Contentbreite, zentriert — ähnlich einem langen Editorial-Artikel. Sticky-Element: Ein **4 px dünner grüner Fortschrittsbalken** (`position: fixed; top: 0`) zeigt den Scroll-Fortschritt innerhalb der Seite. Oben im Viewport gibt es eine **Breadcrumb-Leiste** (`Kursübersicht > Was ist KI? > Wie soll KI definiert werden?`), die mit der Seite scrollt (nicht sticky). Die Navigation zur nächsten Einheit ist ein **grosses Banner am Seitenende** (`Nächster Abschnitt → II. Verwandte Gebiete`). Abgeschlossene Abschnitte werden auf der Kapitel-Übersicht als ausgefüllte `X/X`-Zähler markiert (nur bei eingeloggten Nutzern sichtbar).

## 3. Quiz-Mechanik

Übungen sind **vollständig inline** in den Lesson-Text eingebettet — kein Seitenwechsel, kein Modal. Sie erscheinen nach dem Lehrtext, direkt vor dem „Nächster Abschnitt"-Banner. Beobachtete Frage-Typen:

- **Single Choice** (Ja / Nein / Gewissermaßen)
- **Multiple Choice** (Checkboxen, mehrere richtige Antworten)
- **Numerische Eingabe** (Tabelle mit Lücken zum Ausfüllen)
- **Interaktives Diagramm** (Regressionsgeraden mit draggable Endpunkten)
- **Freitext** (z. B. Übung 25: „Zähle Auswirkungen auf") — vermutlich Peer-Review
- **Euler/Venn-Diagramm** (Drag-and-Drop-Klassifikation)

Feedback: Antwort abgeben → richtige Lösung wird eingeblendet. Ohne Login zeigt die Plattform den Übungstext vollständig, blendet aber das Submit-Widget aus und fordert zur Registrierung auf. Am Kursende wird explizit auf **Peer-Evaluationen** hingewiesen.

## 4. Lernpfade / Multi-Course-UX

Es gibt **kein übergreifendes Dashboard**. Der Übergang von Kurs 1 zu Kurs 2 passiert am Ende der letzten Lektion: „Setze deine Reise fort, um deine erste KI-Idee umzusetzen." — mit einem Link auf `buildingai.elementsofai.com`. Building AI ist strukturell eigenständig (eigene Domain, eigenes Login). Ein gemeinsamer Progress-Tracker existiert nicht. Zertifikate werden erwähnt, aber erst nach Abgabe aller Übungen und Peer-Reviews ausgestellt. Cross-Course-Progress ist aus Nutzersicht nicht sichtbar — man merkt beim Klick, dass man die Domain wechselt.

---

## Konkrete Übernahmen für verstande.ch

1. **Strikte Symmetrie in der Struktur übernehmen**: 3 Abschnitte pro Kapitel (bei uns: 3 Lessons pro Section) als kuratorische Leitlinie — nicht als technische Regel, aber als Qualitäts-Default. Verhindert Beliebigkeit.

2. **Scroll-Progress-Indikator umsetzen**: Der 4 px fixed-top-Bar ist minimalistisch und trotzdem hochinformativ. Für unsere Reading-Lessons direkt adaptierbar. Kein Aufwand, hohe Wirkung.

3. **Übungszähler schon auf der Section-Übersicht**: `0/2` neben dem Abschnittstitel zeigt den Umfang, ohne dass man reingeht. Gutes Signal für Lernplanung — unser Modell kennt Quiz-Questions, das wäre direkt auswertbar.

4. **Inline-Quiz beibehalten, Freitext-Fragen anders lösen**: Elements of AI setzt auf Peer-Review für Freitext-Übungen — das skaliert nur bei Massenplattformen. Für verstande.ch (kleine Nutzerzahl, A2-Drohne) stattdessen: Freitext-Reflexionsfragen ohne Bewertung, als Denkimpuls markiert. Kein Peer-Review nötig.

5. **Multi-Course-Übergang explizit designen**: Elements of AI macht es eher implizit (Link am Kursende). Für unsere Lernpfade (Phase 5) sollte der Übergang zwischen Kursen auf dem Dashboard sichtbar sein — Progress-Ring je Kurs, klarer CTA „Nächster Kurs". Nicht erst am Seitenende vergraben.

   > **RAG-Scope-Implikation (siehe [ADR 0003](adr/0003-rag-grounding-fuer-den-ki-tutor.md)):** Der KI-Tutor groundet in v1 **kurs-scoped** (Retrieval nur über den aktuellen Kurs). Sobald Lernpfade etabliert sind, muss sich das Retrieval **am ganzen Pfad** orientieren — mehrere Kurse als Scope — damit der Tutor pfad-übergreifend antwortet (z. B. eine Frage, deren Antwort in einem früheren Kurs des Pfads steht). Beim Bau der Lernpfade mitdenken: der Vektor-Index muss pfad-weit abfragbar sein.

> **Offene Frage**: Building AI setzt Python-Kenntnisse voraus und kommuniziert das klar auf der Marketing-Seite. Wenn wir FiKnow-Kurse mit unterschiedlichen Vorkenntnissen bauen, brauchen wir eine ähnliche Voraussetzungs-Kommunikation auf der Course-Detail-Seite — heute fehlt das in unserem Modell.

---

## 6. Illustrations-Hover-Animationen (vertagt, dokumentiert)

EoA hat pro Kapitel auf der Plattform eine **Cover-Illustration mit
subtilen Hover-Animationen**: einzelne SVG-Elemente drehen, gleiten oder
pulsieren wenn man die Maus drüber hat. Wirkt wertig ohne aufdringlich.

**Beobachtetes Pattern (geschätzt — JS-gerenderte SPA, nicht im statischen
HTML sichtbar):**

- Inline-SVG (kein `<img src="*.svg">`), damit CSS auf Sub-Elemente greift
- Pure CSS-Transitions + Keyframes — kein Lottie/JS
- Bewegungen klein gehalten (< 10°, < 5px)
- Animation-Dauer 300–600ms ease

**Beispiel-Pattern für eine SVG-Illustration:**

```css
.illustration .head {
  transform-origin: center;
  transition: transform 0.4s ease;
}
.illustration:hover .head {
  transform: rotate(-8deg);
}

.illustration .gear {
  transform-origin: center;
}
.illustration:hover .gear {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

**Warum bei uns aktuell nicht umgesetzt:**

1. Brand-Logo (Sketch-Stil) ist noch nicht final
2. Cover-Illustrationen pro Kurs existieren nicht — A2-Drohne nutzt
   bisher kein Cover-Visual
3. Animation ohne Illustration ist leerlaufend

**Trigger für Adoption:**

Sobald verstande sein Logo hat + erste Kurse Cover-SVGs bekommen, lohnt
es sich, das Pattern in der `<CourseCard>` oder einer neuen
`<CourseHero>`-Komponente einzubauen. Aufwand pro Illustration: 15–30 Min
(CSS-only, keine JS-Dependency). `prefers-reduced-motion` respektieren
(`@media (prefers-reduced-motion: reduce) { ... animation: none; }`).
