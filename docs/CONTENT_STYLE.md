# Inhalte schreiben — Stil- und Didaktik-Referenz

Diese Datei ist die **redaktionelle und didaktische** Schreib-Anleitung für verstande.ch-Kursinhalte. Sie ergänzt [`AUTHORING_BUNDLE.md`](./AUTHORING_BUNDLE.md), überschneidet sie aber nicht: Alles zum Bundle-Format, zur Ordnerstruktur, zu Frontmatter-Feldern und zu MDX-Komponenten-Syntax steht dort. Hier geht es um Stimme, Ton, Didaktik und Qualitätsstandards.

---

## 1. Marke & Stimme

- **Marke**: verstande.ch — „Nöd nur gwüsst. Verstande."
- **Versprechen**: Inhalte erklären, nicht nur auflisten. Lerner sollen *verstehen*, warum etwas so ist — nicht bloss, dass es so ist.
- **Tonfall**: Hochdeutsch, sachlich, ruhig, klar. Keine Marketingfloskeln. Keine Du-/Sie-Mischung — durchgängig **Du**, freundlich, aber nicht anbiedernd.
- **Editorial, nicht akademisch**: kurze Sätze bevorzugt; Fachbegriffe einführen statt voraussetzen; pro abstrakter Idee mindestens ein konkretes Beispiel.
- **Schweizerdeutsch**: nur in Marken- und Hero-Elementen (Slogan), niemals im Lerntext.

---

## 2. Didaktik-Default: 3 Lessons pro Section

Als Faustregel gilt: pro Section **3 Lessons** — eine Reading-Lesson, eine vertiefende oder Beispiel-Lesson und eine Quiz-Lesson. Das ist kein technisches Constraint (Sections dürfen 1–6 Lessons haben), aber als Default verhindert es Beliebigkeit und gibt Lernenden eine vorhersehbare Rhythmik.

Vorbild ist *Elements of AI* (Universität Helsinki/MinnaLearn), die mit genau dieser Struktur über 2 Millionen Teilnehmer durchgeführt haben — dort gilt die 3-Abschnitte-Symmetrie kursweit, ausnahmslos.

**Abweichungen sind möglich**, sollten aber kurz begründet werden (z. B. „Section 04 enthält nur 2 Lessons, weil das Thema direkt ins Quiz führt").

### Aufbau einer Reading-Lesson (Soll-Struktur)

1. Frontmatter mit `title`, `type: reading`, `estimated_minutes`, `summary`
2. H1 = Titel der Lesson
3. Kurzer Aufschlag (1–2 Absätze): worum geht's, warum ist das relevant?
4. 2–4 H2-Abschnitte mit Erklärung, Beispielen, ggf. `<Callout>` oder `<Figure>`
5. `<KeyTakeaways>` am Ende mit 3–5 Bullets

**Länge**: 600–1 200 Wörter pro Reading-Lesson. Quiz-Lessons: 5–8 Fragen mit `explanation`.

Für die Syntax aller Komponenten (`<Callout>`, `<KeyTakeaways>`, `<Figure>`, `<Question>` usw.) siehe [`AUTHORING_BUNDLE.md`](./AUTHORING_BUNDLE.md).

---

## 3. Gotcha: Anführungszeichen in MDX-Attributen

> Innerhalb von Attribut-Werten — alles, was zwischen `="…"` steht — **niemals** typografische oder gerade Anführungszeichen verschachteln. Der MDX-Parser bricht sonst ab.
>
> ❌ `<Callout title="„Eine KI" gibt es nicht">` — das innere `"` beendet den `title` vorzeitig
> ❌ `<Question prompt="Was ist „X"?">`
>
> ✅ `<Callout title="Es gibt keine 'eine KI'">` — Single Quotes im Inneren
> ✅ `<Question prompt="Was ist 'X'?">`
> ✅ Im normalen Fließtext (ausserhalb von Attributen) sind Smart Quotes völlig OK.

---

## 4. Cowork-Master-Prompt

Diesen Block kopierst du als ersten Turn in eine neue Cowork-Session. Die Session arbeitet danach Lesson für Lesson.

> Du bist Co-Autor für **verstande.ch**, eine Lernplattform mit dem Slogan „Nöd nur gwüsst. Verstande." Wir schreiben gerade den Kurs **„[Kurstitel]"**.
>
> **Stimme**: Hochdeutsch, ruhig, sachlich, klar. Du-Form. Editorial, nicht akademisch. Ein konkretes Beispiel pro abstrakter Idee. Keine Marketingfloskeln.
>
> **Format**: Jede Lesson ist eine `.mdx`-Datei mit YAML-Frontmatter. Verfügbare Komponenten: `<Callout type="info|warning|tip|note">`, `<KeyTakeaways>`, `<Figure src="assets/images/…" caption="…">`, `<Pullquote>`, `<Steps>`, `<DefinitionList>` mit `<Definition term="…">…</Definition>`-Children, `<Question>` mit `<Option>`/`<Option correct={true}>`-Children (nur in Quiz-Lessons). Standard-Markdown für alles andere. In Attribut-Werten (z. B. `title="…"`) keine verschachtelten Anführungszeichen verwenden — wenn du Anführungszeichen im Wert brauchst, nimm Single Quotes.
>
> **Aufbau einer Reading-Lesson** (Soll-Struktur):
> 1. Frontmatter mit `title`, `type: reading`, `estimated_minutes`, `summary`
> 2. H1 = Titel der Lesson
> 3. Kurzer Aufschlag (1–2 Absätze): worum geht's, warum ist das relevant?
> 4. 2–4 H2-Abschnitte mit Erklärung, Beispielen, ggf. `<Callout>` oder `<Figure>`
> 5. `<KeyTakeaways>` am Ende mit 3–5 Bullets
>
> **Länge**: 600–1 200 Wörter pro Reading-Lesson. Quiz-Lessons: 5–8 Fragen mit `explanation`.
>
> **Struktur-Default**: Wenn du eine Outline vorschlägst, plane pro Section **3 Lessons** (Reading + Vertiefung/Beispiel + Quiz). Abweichungen sind möglich, aber begründe sie kurz.
>
> Wenn du bereit bist, bestätige kurz und ich gebe dir die erste Lesson.

---

## 5. Per-Lesson-Prompt-Vorlage

Pro Lesson danach ein knapper Folge-Prompt:

> Lesson: **`<Section> / <Lesson-Titel>`**
> Slug: `<dateiname-ohne-mdx>` (z. B. `01-was-ist-a2`)
> Ziel: Lerner soll danach erklären können, …
> Stichworte: …, …, …
> Länge: ~900 Wörter, Reading-Lesson.
>
> Schreib die komplette `.mdx`-Datei inklusive Frontmatter.

Das Ergebnis fügst du ins Bundle unter `<NN>-<section>/<MM>-<slug>.mdx` ein und lädst es danach via Authoring-Client als Draft hoch (siehe [`AUTHORING_BUNDLE.md`](./AUTHORING_BUNDLE.md), Abschnitt „Upload-Flow").

---

## 6. Qualitäts-Checkliste vor dem Upload

- [ ] Frontmatter vollständig (`title`, `type`, `estimated_minutes`, `summary`)
- [ ] H1 entspricht `title` aus Frontmatter
- [ ] Mindestens 1 konkretes Beispiel pro abstrakter Idee
- [ ] Mindestens 1 `<Callout>` oder `<KeyTakeaways>`
- [ ] Bei Faktenaussagen: Quelle oder Norm im Text genannt (z. B. „nach EU 2019/947 Art. 3")
- [ ] Keine Du-/Sie-Mischung
- [ ] Quiz-Fragen haben alle eine `explanation`
- [ ] Hinweis, dass verstande.ch vorbereitet, aber keine offizielle Prüfung ersetzt — wo passend, einmal pro Section
- [ ] Keine verschachtelten Anführungszeichen in MDX-Attribut-Werten
- [ ] Bundle hochgeladen als Draft → im echten Learner-Shell begangen → erst dann publishen

---

## 7. Beispiel-Kurs-Outline (A2-Drohne)

Dies ist ein Startvorschlag als **Beispiel**, keine Vorschrift. Angelehnt an den EASA-Themenkatalog, anpassbar.

```
01-grundlagen/
  01-was-ist-a2.mdx
  02-rechtsrahmen-eu-2019-947.mdx
  03-quiz-grundlagen.mdx

02-luftraum-und-zonen/
  01-luftraumstruktur.mdx
  02-uas-zonen-und-notams.mdx
  03-quiz-luftraum.mdx

03-betrieb-in-a2/
  01-mindestabstaende.mdx
  02-low-speed-mode.mdx
  03-quiz-betrieb.mdx

04-technik-und-aufbau/
  01-uas-komponenten.mdx
  02-akku-und-energie.mdx
  03-quiz-technik.mdx

05-meteorologie/
  01-wind-und-boeen.mdx
  02-sicht-und-wolken.mdx
  03-quiz-meteo.mdx

06-mensch-und-fehler/
  01-menschliche-leistungsfaehigkeit.mdx
  02-checklisten-und-routinen.mdx
  03-quiz-mensch.mdx

07-recht-und-versicherung/
  01-datenschutz.mdx
  02-haftpflicht.mdx
  03-quiz-recht.mdx

08-pruefungsvorbereitung/
  01-was-erwartet-dich.mdx
  02-uebungsklausur.mdx    # Quiz, ~30 Fragen
```

Ca. 22 Reading-Lessons + 8 Quizzes. Bei 10–12 Min pro Reading und 6 Min pro Quiz: ~5–6 Stunden Material.
