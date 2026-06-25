# FiKnow — Wissensmodule mit KI-Hilfe erstellen

Anleitung für Teamleiter:innen und Fachverantwortliche, die ein Onboarding-
oder Schulungsmodul beisteuern wollen. Du brauchst dafür kein technisches
Wissen — nur ein KI-Tool deiner Wahl (Microsoft Copilot, ChatGPT, Claude.ai,
Anthropic Cowork etc.) und ~30 Minuten pro Modul.

Yves bekommt von dir am Ende eine oder mehrere Markdown-Dateien und checkt
sie in die Plattform ein. Damit das reibungslos klappt, halte dich an die
Struktur unten.

---

## Was du brauchst

- Ein **AI-Chat-Tool**, das längere Texte erzeugen kann (siehe oben)
- Eine grobe Vorstellung, **was Neulinge wissen sollten**, wenn sie bei dir
  im Team starten — Stichpunkte reichen
- ~30 Minuten Zeit pro Modul
- Optional: bestehende Confluence-/Word-Doku, aus der die KI Material
  übernehmen kann

---

## Schritt 1 — Master-Prompt in dein KI-Tool kopieren

Öffne dein KI-Tool und füge diesen Block als ersten Turn ein. Er bringt
der KI bei, **wie** sie für FiKnow schreiben soll.

> Du bist Co-Autor:in für **FiKnow**, eine interne Lernplattform der
> Firma FINNOFLEET. Wir ersetzen schrittweise statische Confluence-
> Doku durch strukturierte Lerneinheiten, mit denen sich Neulinge
> aktiv ins Team einarbeiten.
>
> **Stimme**: sachlich, freundlich, klar. Du-Form. Kein Marketing-
> Sprech, kein Imponiergehabe. Konkrete Beispiele und Bezüge auf
> realistische Arbeitssituationen sind willkommen.
>
> **Format**: jede Lerneinheit (Lesson) ist eine eigene Markdown-
> Datei (`.mdx`) mit YAML-Frontmatter und einem Body, der Headlines,
> Absätze, Listen und folgende Spezial-Komponenten verwenden darf:
>
> - `<Callout type="info|warning|tip" title="…">…</Callout>` — Hinweis-
>   boxen
> - `<KeyTakeaways>…</KeyTakeaways>` mit einer Liste am Ende — die
>   wichtigsten Punkte zum Mitnehmen
> - `<Steps>1. …</Steps>` — geordnete Anleitung
> - `<DefinitionList>` mit `<Definition term="…">…</Definition>`-
>   Children — Begriffsglossar
> - `<Pullquote>…</Pullquote>` — eine zentrale Aussage als Highlight
> - `<Question id="…" prompt="…" explanation="…">` mit `<Option>`/`<Option correct>`-
>   Children — Multiple-Choice-Frage (NUR in Quiz-Lessons); `id` immer
>   mitliefern, Konvention: `<modul-slug>-<section-slug>-q<nummer>`
>   (z. B. `vertrieb-onboarding-q1`)
>
> **Wichtig**: In Attribut-Werten (z. B. `title="…"`) keine verschachtelten
> Anführungszeichen verwenden — wenn du Anführungszeichen im Wert brauchst,
> nimm Single Quotes (`'…'`).
>
> **Aufbau einer Reading-Lesson** (Soll-Struktur):
> 1. Frontmatter mit `title`, `type: reading`, `estimated_minutes`,
>    `summary`
> 2. H1 = Titel der Lesson
> 3. Kurzer Aufschlag (1–2 Absätze): worum geht's, warum ist das
>    wichtig im Team-Kontext?
> 4. 2–4 H2-Abschnitte mit Erklärung, Beispielen, ggf. Callout
> 5. `<KeyTakeaways>` am Ende mit 3–5 Bullets
>
> **Länge**: 600–1200 Wörter pro Reading-Lesson. Quiz-Lessons:
> 5–8 Fragen mit `explanation` (Erklärung wird nach dem Absenden
> angezeigt — immer ausfüllen).
>
> **Struktur-Default**: Wenn du eine Outline vorschlägst, plane pro
> Section **3 Lessons** (Reading + Vertiefung/Beispiel + Quiz).
> Abweichungen sind möglich, aber begründe sie kurz.
>
> Wenn du bereit bist, bestätige kurz und sag mir, welches Modul wir
> zuerst angehen.

Die KI sollte „verstanden" antworten oder nachfragen.

> **Wichtig: Anführungszeichen in Attribut-Werten**
>
> Innerhalb von Attribut-Werten (alles, was zwischen `="…"` steht)
> **niemals** typografische oder gerade Anführungszeichen verschachteln —
> der MDX-Parser bricht sonst ab. Beispiele:
>
> ❌ `<Callout title="„Eine KI" gibt es nicht">` — das innere `"` beendet den Title vorzeitig
> ❌ `<Question prompt="Was ist „X"?">`
>
> ✅ `<Callout title="Es gibt keine 'eine KI'">` — Single Quotes im Inneren
> ✅ `<Question prompt="Was ist 'X'?">`
> ✅ Im normalen Fließtext (außerhalb von Attributen) sind Smart Quotes völlig OK.

---

## Schritt 2 — Modul beschreiben

Antworte der KI mit einer kurzen Modulbeschreibung. Beispiel:

> Wir machen ein Onboarding-Modul „Vertrieb bei FINNOFLEET — die
> ersten 30 Tage". Zielgruppe: neue Vertriebsmitarbeiter:innen.
> Inhalte sollen abdecken:
>
> - Wie unsere Verkaufspipeline aufgebaut ist (CRM-Stufen)
> - Welche Tools wir nutzen (Salesforce, Outlook, Teams)
> - Wer welche Rolle im Team hat (Sales Engineer, AE, BDR)
> - Wie ein typischer Erstkontakt aussieht (Discovery-Call)
> - Drei häufige Anfänger-Fehler und wie man sie vermeidet
>
> Bitte schlage 4–6 Lessons vor, die diese Themen sinnvoll aufteilen.

Die KI gibt dir eine **Outline** zurück — eine Liste von Lesson-Titeln.

> **Empfehlung: 3 Lessons pro Section als Default**
>
> Halte dich an die Faustregel: pro Section etwa **3 Lessons** — eine
> erklärende Reading-Lesson, eine vertiefende oder Beispiel-Lesson und
> eine Quiz-Lesson. Das ist kein technisches Constraint (1–6 Lessons
> sind technisch möglich), aber als Default gibt es Lernenden eine
> vorhersehbare Rhythmik und verhindert, dass Sections zu ungleich
> werden. Vorbild: Elements of AI (Universität Helsinki/MinnaLearn),
> die mit dieser Struktur über 2 Millionen Teilnehmer erreicht haben.

Korrigiere/ergänze sie, bis sie dir gefällt. Dann sagst du:

> Gut. Schreib jetzt Lesson 1 komplett aus.

Die KI liefert die fertige `.mdx`-Datei. Wiederhole für jede Lesson.

Am Ende solltest du eine **Quiz-Lesson** anhängen:

> Schreib zum Abschluss eine Quiz-Lesson mit 5–7 Multiple-Choice-
> Fragen, die das Gelernte abprüft. Verwende die `<Question>`-
> Komponente wie im Master-Prompt beschrieben.

**Optional, aber empfohlen: `id`-Attribut bei jeder Frage**
Pro `<Question>` ein eindeutiger Identifier (Konvention:
`<modul-slug>-<section-slug>-q<nummer>`, z. B. `vertrieb-onboarding-q1`).
Wird heute nicht ausgewertet, ermöglicht aber später Repetitionsfragen-
Funktionen (gezielter Pull einzelner Fragen aus abgeschlossenen Lektionen).
Wenn weggelassen: kein Fehler, nur die Spaced-Repetition-Migration wird
später aufwendiger.

---

## Schritt 3 — An Yves übergeben

Sammle alle Lesson-Inhalte (jeweils der vollständige `.mdx`-Block ab
`---` Frontmatter bis Ende) in eine Übergabe. Wahlweise:

- **Als Datei-Anhänge**: pro Lesson eine `.mdx` oder `.md`, plus eine
  kurze README mit Modul-Titel und Kurz-Beschreibung — Yves per E-Mail
  oder Teams.
- **Als Confluence-Seite**: jeder Lesson-Block in eine Untersection,
  Yves konvertiert daraus.
- **Als geteiltes OneDrive-Dokument**: Lesson-Texte hintereinander,
  klar getrennt.

**Bilder/Diagramme** (optional): wenn du Schaubilder brauchst, hänge
sie als PNG/SVG mit aussagekräftigen Dateinamen an. Yves baut sie ein.

---

## Qualitäts-Checkliste vor der Übergabe

Lies deine Lessons selbst noch einmal. Stimmt jeder Punkt?

- [ ] **Konkret statt abstrakt**: Mindestens 1 Beispiel pro Hauptkonzept
- [ ] **Aktiv statt passiv**: „Du legst die Opportunity an" statt „Die
      Opportunity wird angelegt"
- [ ] **Du-Form durchgehend** — keine Mischung mit Sie
- [ ] **Quellen genannt** wenn Faktenaussagen drin sind („nach Sales
      Playbook 2025, Kapitel 3")
- [ ] **Internes Wissen geschützt**: keine Kunden-/Vertragsdaten in
      Beispielen — verwende anonymisierte Beispiele
- [ ] **Quiz-Erklärungen ausgefüllt** (nicht nur die richtige Antwort)
- [ ] **KeyTakeaways am Ende jeder Reading-Lesson**

---

## FAQ

**Wie lang dauert ein Modul wirklich?**
Mit gutem Vorwissen und scharfen Stichpunkten: 30 Min. Mit Recherche
parallel: 1–2 Stunden. Die KI macht das Schreiben schnell, dein Input
zur Korrektheit ist der Engpass.

**Was, wenn die KI Fakten falsch hat?**
Korrigiere direkt im Output, oder antworte der KI: „Das stimmt nicht,
korrekt ist: …". Sie passt den Block an.

**Können Bilder direkt aus Confluence übernommen werden?**
Ja — als PNG exportieren, mit liefern. Yves baut sie als
`<Figure caption="…" />` ein.

**Wer entscheidet, ob ein Modul „gut genug" ist?**
Phase 1: Yves liest gegen, holt bei Unsicherheit Rückfrage bei dir
ein. Später (wenn Payload CMS kommt — siehe Roadmap): Reviewer-Rolle
in der Plattform.

**Kann ich auch Word/PDF direkt schicken?**
Ja, dann wandelt Yves um — Aufwand bei ihm steigt aber, daher
bevorzugt: Markdown direkt aus dem KI-Tool.

---

## Beispiel-Modul

Wenn du Inspiration brauchst, frag Yves nach dem ersten produktiv
veröffentlichten FiKnow-Modul — das ist die beste Vorlage für
Struktur, Tonfall und Detailtiefe.
