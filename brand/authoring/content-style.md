# Inhalte schreiben — Stil- und Didaktik-Referenz (FIKNOW)

Diese Datei ist die **redaktionelle und didaktische** Schreib-Anleitung für FIKNOW-Kursinhalte. FIKNOW ist die FINNOFLEET-interne Plattform für **geführte Wissensvermittlung** — sie macht beliebige Themen schulbar (mehr dazu unter „Positionierung"). Sie ergänzt das Topic `bundle-format` (via `get_authoring_guide` bzw. die Resource `authoring://format/bundle`), überschneidet sie aber nicht: Alles zum Bundle-Format, zur Ordnerstruktur, zu Frontmatter-Feldern und zu MDX-Komponenten-Syntax steht dort. Hier geht es um Stimme, Ton, Didaktik und Qualitätsstandards.

---

## 1. Marke & Stimme

- **Marke**: FIKNOW — Claim „mit Wissen auf Kurs". Der Markenname wird durchgängig in Versalien geschrieben (**FIKNOW**), analog zu **FINNOFLEET**.
- **Claim**: **„mit Wissen auf Kurs"** (deutsch). „Kurs" trägt drei Bedeutungen zugleich: die Schiffsrichtung (Orientierung), den Lernkurs (das Produkt) und das Idiom „jemandem Kurs geben". Das maritime „Kurs"-Motiv knüpft bewusst an das Navigations-Thema der Gruppe an — daher konsistent halten.
- **Tonfall**: Hochdeutsch, klar, professionell, zugänglich. Keine Marketingfloskeln. Keine Du-/Sie-Mischung — durchgängig **Du**, respektvoll und direkt, ohne Distanz oder Anbiederung.
- **Sachlich, nicht akademisch**: mittlere Satzlänge; Fachbegriffe einführen statt voraussetzen; pro abstrakter Idee mindestens ein konkretes Beispiel aus dem Arbeitsalltag bei FINNOFLEET.
- **Nicht verspielt**: FIKNOW ist kein Edutainment-Produkt. Der Ton ist clean und präzise — wie ein gut geschriebenes internes Fachdokument, das trotzdem lesbar ist. Kein Humor auf Kosten der Substanz.
- **Kein Dialekt, keine umgangssprachlichen Abkürzungen** im Lerntext.

### Positionierung

FIKNOW macht **beliebige Themen schulbar**. Der Kern ist **geführte Wissensvermittlung** — didaktisch strukturiert, statt einer losen Sammlung von Dokumentlinks. Onboarding ist der prominenteste Anwendungsfall (und der, der heute oft jedes Mal neu als Checkliste mit losen Links erfunden wird), aber nur **einer** von mehreren:

| Kurstyp | Beispiel |
|---|---|
| Onboarding | „FINNOFLEET und ich" für neue Teammitglieder |
| Tool-Schulung | „Arbeiten mit System X" für ein bestimmtes Team |
| Interne Zertifizierung | „Kreditprozess-Zertifikat" mit Abschluss-Quiz |
| Nutzerschulung | „Funktion Y im Kundenportal" für Anwender |

**Wichtig fürs Schreiben**: Die Didaktik (3-Lessons-Rhythmus, Nuggets, Niveau-Stufen) ist **kurstyp-unabhängig**. Der Kurstyp bestimmt nur Anlass und Thema, nicht die Bauweise.

### Markenattribute (aus dem FINNOFLEET-Brandbook)

Die drei Säulen der Marke — **Mensch & Orientierung**, **FinTech** (IT-, Software- und Finanz-Know-how) und **Innovation** (Mut, Offenheit, Veränderungsbereitschaft) — spiegeln sich auch in der Kurssprache:

| Attribut-Gruppe | Was das im Text bedeutet |
|---|---|
| Mensch & Orientierung | Lernende abholen; erklären, warum etwas für *sie* relevant ist; Schritt für Schritt orientieren. |
| FinTech / Fachkompetenz | Präzise Terminologie; Zahlen und Prozesse korrekt darstellen; Quellen nennen. |
| Innovation / Offenheit | Neue Themen (KI, Digitalisierung) mutig angehen; Veränderung als Chance framen, nicht als Bedrohung. |

### Do & Don't

| Do | Don't |
|---|---|
| „Kreditmanagement bezeichnet …" (Fachbegriff einführen) | „Wie du sicher weisst, ist Kreditmanagement …" (Vorwissen annehmen) |
| „In der Praxis bedeutet das: …" + konkretes Beispiel | Abstraktion ohne Bezug zur Arbeitswirklichkeit |
| „FINNOFLEET verarbeitet jährlich über 600 Mrd. Euro Kreditvolumen — dahinter stehen Prozesse, die du in diesem Kurs kennenlernst." | Zahlen ohne Kontext (blosse Statistiken aufzählen) |
| Kurze, aktive Sätze; Fachbegriffe fett beim ersten Auftreten | Nominalstil, Schachtelsätze, Passiv-Konstruktionen ohne Grund |
| Kursinhalt an realen FINNOFLEET-Produkten/Abläufen verankern | Generische Beispiele ohne Bezug zur Gruppe |

> **Glossar**: Es gibt (noch) keine zentrale FINNOFLEET-Terminologieliste für den Lerntext. FIKNOW pflegt stattdessen ein **eigenes Mini-Glossar**, das mit den Kursen mitwächst — dort landen wiederkehrende Fachbegriffe und bei Bedarf auch Subbrand-Namen (SUBITO, engram, …), damit der Style-Guide selbst sie nicht kennen muss.

---

## 2. Didaktik-Default: 3 Lessons pro Section

Die folgende Struktur gilt **kurstyp-unabhängig** — egal ob Onboarding, Tool-Schulung, Zertifizierung oder Nutzerschulung.

Als Faustregel gilt: pro Section **3 Lessons** — eine Reading-Lesson, eine vertiefende oder Beispiel-Lesson und eine Quiz-Lesson. Das ist kein technisches Constraint (Sections dürfen 1–6 Lessons haben), aber als Default verhindert es Beliebigkeit und gibt Lernenden eine vorhersehbare Rhythmik.

Vorbild ist *Elements of AI* (Universität Helsinki/MinnaLearn), die mit genau dieser Struktur über 2 Millionen Teilnehmer durchgeführt haben — dort gilt die 3-Abschnitte-Symmetrie kursweit, ausnahmslos.

**Abweichungen sind möglich**, sollten aber kurz begründet werden (z. B. „Section 03 enthält nur 2 Lessons, weil das Thema direkt ins Quiz führt").

### Aufbau einer Reading-Lesson (Soll-Struktur)

1. Frontmatter mit `title`, `type: reading`, `estimated_minutes`, `summary`
2. H1 = Titel der Lesson
3. Kurzer Aufschlag (1–2 Absätze): worum geht's, warum ist das für die Zielgruppe relevant?
4. 2–4 H2-Abschnitte mit Erklärung, Beispielen, ggf. `<Callout>` oder `<Figure>`
5. `<KeyTakeaways>` am Ende mit 3–5 Bullets

**Länge**: 600–1 200 Wörter pro Reading-Lesson. Quiz-Lessons: 5–8 Fragen mit `explanation`.

Für die Syntax aller Komponenten (`<Callout>`, `<KeyTakeaways>`, `<Figure>`, `<Pullquote>`, `<Steps>`, `<DefinitionList>`, `<Question>` usw.) siehe das Topic `bundle-format` (via `get_authoring_guide` bzw. die Resource `authoring://format/bundle`).

### Niveau & Relevanz: zwei Achsen pro Kurs

Jeder Kurs (und jedes Nugget) wird auf zwei unabhängigen Achsen verortet. Sie zu klären, ist **der erste Schritt** vor dem Schreiben.

**1. Niveau — wie viel Vorwissen?**

| Stufe | Vorwissen | Umgang mit Fachbegriffen |
|---|---|---|
| **Einsteiger** | keines | *jeden* Fachbegriff einführen |
| **Fortgeschritten** | Grundbegriffe sitzen | Grundlagen voraussetzen, Prozesse/Zusammenhänge erklären |
| **Experte** | Rollen-/Domänenwissen | nur Neues/Spezielles erklären; regulatorische & technische Tiefe |

Das Niveau steuert direkt, wie viel du einführst vs. voraussetzt. Ein Einsteiger-Kurs, der Fachbegriffe als bekannt annimmt, ist genauso falsch wie ein Experten-Nugget, das bei Adam und Eva anfängt.

**2. Relevanz — für wen überhaupt?**

Nicht jeder Inhalt gilt für alle: Ein Tool betrifft vielleicht nur eine Business Unit, ein Entwickler in BU 1 arbeitet auf einem anderen Stack als einer in BU 2. **Halte die Zielgruppe darum bewusst fest** — gilt ein Inhalt nicht gruppenweit, nenne Business Unit / Firma / Rolle im `summary`. Das hält den Kontext eindeutig und kostet beim Schreiben nichts. Gilt ein Inhalt gruppenweit, entfällt der Hinweis.

### Beispiel-Kurs-Outline (Kurstyp: Onboarding)

Dies ist ein Startvorschlag als **Beispiel** für *einen* Kurstyp — keine Vorschrift und kein vorgegebener Katalog.

```
01-finnofleet-und-ich/
  01-die-gruppe-im-ueberblick.mdx
  02-produkte-und-kunden.mdx
  03-quiz-grundlagen.mdx

02-kreditmanagement-basics/
  01-was-ist-kredit.mdx
  02-der-kreditprozess.mdx
  03-quiz-kredit.mdx

03-systeme-und-tools/
  01-softwarelandschaft.mdx
  02-arbeiten-mit-dem-system.mdx
  03-quiz-tools.mdx

04-compliance-und-recht/
  01-regulatorischer-rahmen.mdx
  02-datenschutz-und-it-sicherheit.mdx
  03-quiz-compliance.mdx

05-zusammenarbeit-in-der-gruppe/
  01-teams-und-standorte.mdx
  02-kommunikationswege.mdx
  03-quiz-zusammenarbeit.mdx
```

Ca. 10 Reading-Lessons + 5 Quizzes. Bei 10–12 Min pro Reading und 6 Min pro Quiz: ~2–2,5 Stunden Material.

> **Kein zentraler Themenkatalog**: FIKNOW ist *keine* zentrale HR-Onboarding-Vorgabe. Kurse entstehen bedarfsgetrieben — wer ein Thema schulbar machen will, autort es. Die Outline oben ist reine Illustration, kein Platzhalter für eine Zulieferung.

### Wissens-Nuggets — die schlanke Schwester des vollen Kurses

Neben vollen Kurs-Modulen liefert FIKNOW **Wissens-Nuggets**. Das ist FIKNOWs **Micro-Learning**-Format: ein einzelner, in sich abgeschlossener Lern-Happen, der **eine** konkrete Frage aus dem Arbeitsalltag beantwortet — „Was ist eigentlich ein Kreditrisiko?", „Wie läuft eine Mahnstufe bei uns?". Micro-Learning meint bewusst kleine, fokussierte Einheiten, die man **dann** zieht, wenn man sie braucht (Pull), statt sie wie eine Lernstrecke durchzuarbeiten (Push).

Der Unterschied zum vollen Kurs ist nicht „Pfad ja/nein", sondern **Anlass und Tiefe**:

| | Kurs / Modul | Wissens-Nugget |
|---|---|---|
| Anlass | geplante Lernstrecke (Push) | Frage aus dem Alltag (Pull) |
| Umfang | mehrere Sections, ~2–2,5 h | **1 Reading-Lesson**, 3–6 Min |
| Quiz | ja, als Lernkontrolle | **kein Quiz** |
| Roter Faden | geführte Section-Kette | wird vom **Lernpfad** gestiftet (s. u.) |

Onboarding und Nugget-Sammlung sind nicht zwei Formate, sondern derselbe Gedanke bei unterschiedlichem **Führungsgrad**: ein **geführter** Lernpfad (linear, Reihenfolge gemeint — Onboarding, Zertifizierung) bis zu einem **losen** Lernpfad (nach Bedarf navigierbar — Nugget-Sammlung). Wie Inhalte zu solchen Pfaden gebündelt werden, ist ein **Plattform-/Roadmap-Thema** und nicht Sache des einzelnen Nuggets. Fürs Authoring zählt nur: Jedes Nugget steht **für sich** und ist allein verständlich; die Reihenfolge stiftet später der Lernpfad.

**Soll-Struktur einer Nugget-Lesson:**

1. Frontmatter mit `title`, `type: reading`, `estimated_minutes` (3–6), `summary`
2. H1 = die konkrete Frage oder das Stichwort
3. Direkter Einstieg — **keine** lange Hinführung; der Nugget beantwortet sofort, worum es geht
4. 1–2 H2-Abschnitte, mind. 1 konkretes FINNOFLEET-Beispiel, gern 1 `<Callout>`
5. `<KeyTakeaways>` mit 2–3 Bullets
6. *Interim, bis Lernpfade live sind*: optionaler Verweis am Ende auf 1–2 verwandte Nuggets („Weiterlesen") — Übergangslösung, keine Dauerverdrahtung

**Stimme**: identisch zum vollen Kurs (Du, sachlich, präzise) — nur kürzer und stärker auf *eine* Sache fokussiert. **Länge**: 250–500 Wörter.

---

## 3. Gotcha: Anführungszeichen in MDX-Attributen

> Innerhalb von Attribut-Werten — alles, was zwischen `="…"` steht — **niemals** typografische oder gerade Anführungszeichen verschachteln. Der MDX-Parser bricht sonst ab.
>
> ❌ `<Callout title="„Kreditrisiko" definieren">` — das innere `"` beendet den `title` vorzeitig
> ❌ `<Question prompt="Was ist „Bonität"?">`
>
> ✅ `<Callout title="'Kreditrisiko' definieren">` — Single Quotes im Inneren
> ✅ `<Question prompt="Was ist 'Bonität'?">`
> ✅ Im normalen Fließtext (ausserhalb von Attributen) sind Smart Quotes völlig OK.

---

## 4. FIKNOW-Master-Prompt

Diesen Block kopierst du als ersten Turn in eine neue Authoring-Session (Cowork oder anderes KI-Tool). Die Session arbeitet danach Lesson für Lesson.

> Du bist Co-Autor für **FIKNOW** (immer in Versalien), die interne Lernplattform von FINNOFLEET — einer FinTech-Gruppe mit Spezialkredit-Software für das Kreditmanagement. FIKNOW macht beliebige Themen schulbar: **geführte Wissensvermittlung** statt loser Dokumentlinks — Onboarding, Tool-Schulungen, interne Zertifizierungen, Nutzerschulungen. FIKNOW-Claim: „mit Wissen auf Kurs".
>
> Wir schreiben gerade den Kurs **„[Kurstitel]"** (Kurstyp: [Onboarding/Tool-Schulung/Zertifizierung/Nutzerschulung], Niveau: [Einsteiger/Fortgeschritten/Experte], Zielgruppe/BU: [...]).
>
> **Stimme**: Hochdeutsch, klar, professionell, zugänglich. Du-Form. Sachlich, nicht akademisch. Ein konkretes Beispiel aus dem FINNOFLEET-Arbeitsalltag pro abstrakter Idee. Keine Marketingfloskeln, kein Edutainment-Ton. Kurze aktive Sätze bevorzugt; Fachbegriffe bei der ersten Erwähnung fett und kurz erklären.
>
> **Niveau**: Richte die Begriffstiefe am genannten Niveau aus — Einsteiger: jeden Fachbegriff einführen; Fortgeschritten: Grundlagen voraussetzen; Experte: nur Neues/Spezielles erklären.
>
> **Format**: Jede Lesson ist eine `.mdx`-Datei mit YAML-Frontmatter. Verfügbare Komponenten: `<Callout type="info|warning|tip|note">`, `<KeyTakeaways>`, `<Figure src="assets/images/…" caption="…">`, `<Pullquote>`, `<Steps>`, `<DefinitionList>` mit `<Definition term="…">…</Definition>`-Children, `<Question>` mit `<Option>`/`<Option correct={true}>`-Children (nur in Quiz-Lessons). Standard-Markdown für alles andere. In Attribut-Werten (z. B. `title="…"`) keine verschachtelten Anführungszeichen verwenden — wenn du Anführungszeichen im Wert brauchst, nimm Single Quotes.
>
> **Aufbau einer Reading-Lesson** (Soll-Struktur):
> 1. Frontmatter mit `title`, `type: reading`, `estimated_minutes`, `summary`
> 2. H1 = Titel der Lesson
> 3. Kurzer Aufschlag (1–2 Absätze): worum geht's, warum ist das für die Zielgruppe relevant?
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
> Slug: `<dateiname-ohne-mdx>` (z. B. `01-was-ist-kreditmanagement`)
> Ziel: Lernende sollen danach erklären können, …
> Stichworte: …, …, …
> Bezug zu FINNOFLEET: … (z. B. „SUBITO GmbH als Produktbeispiel", „Onboarding neuer Kolleginnen in Kiel")
> Länge: ~900 Wörter, Reading-Lesson.
>
> Schreib die komplette `.mdx`-Datei inklusive Frontmatter.

Das Ergebnis fügst du ins Bundle unter `<NN>-<section>/<MM>-<slug>.mdx` ein und lädst es danach via Authoring-Client als Draft hoch (siehe das Topic `bundle-format` (via `get_authoring_guide` bzw. die Resource `authoring://format/bundle`), Abschnitt „Upload-Flow").

---

## 6. Qualitäts-Checkliste vor dem Upload

- [ ] Frontmatter vollständig (`title`, `type`, `estimated_minutes`, `summary`)
- [ ] H1 entspricht `title` aus Frontmatter
- [ ] Niveau bewusst gewählt (Einsteiger / Fortgeschritten / Experte) und Begriffstiefe entsprechend
- [ ] Zielgruppe im `summary` benannt (Business Unit / Firma / Rolle), falls der Inhalt nicht gruppenweit gilt
- [ ] Mindestens 1 konkretes Beispiel pro abstrakter Idee — idealerweise mit Bezug zu FINNOFLEET-Produkten, -Prozessen oder -Standorten
- [ ] Mindestens 1 `<Callout>` oder `<KeyTakeaways>`
- [ ] Fachbegriffe beim ersten Auftreten erklärt (passend zum Niveau)
- [ ] Bei regulatorischen oder Compliance-Aussagen: Quelle oder Norm im Text genannt (z. B. „gemäss KWG § 18" oder „laut interner Richtlinie vom …")
- [ ] Keine Du-/Sie-Mischung
- [ ] Quiz-Fragen haben alle eine `explanation`
- [ ] Keine verschachtelten Anführungszeichen in MDX-Attribut-Werten
- [ ] Bundle hochgeladen als Draft → im echten Learner-Shell geprüft → erst dann publishen

> **Entschieden (kein Disclaimer)**: FIKNOW-Kurse brauchen *keinen* Compliance-Disclaimer am Kursende. FIKNOW ist rein ergänzend; ein rechtlicher Hinweis ist nicht nötig. (Sollte sich das ändern, hier und in der Checkliste ergänzen.)

---

## Entschieden

- **Positionierung**: FIKNOW macht *beliebige Themen schulbar* — geführte Wissensvermittlung (Onboarding, Tool-Schulungen, interne Zertifizierungen, Nutzerschulungen). Onboarding ist ein Anwendungsfall, nicht der Zweck. Differenzierer: geführt & didaktisch statt loser Dokumentlinks.
- **Markenname**: durchgängig in Versalien — **FIKNOW**, analog zu **FINNOFLEET**.
- **Claim**: **„mit Wissen auf Kurs"** (deutsch, FIKNOW-eigen).
- **Anrede**: durchgängig **Du** — direkt, respektvoll, ohne Distanz; keine Du-/Sie-Mischung.
- **Niveau-Stufen**: Einsteiger / Fortgeschritten / Experte (steuert die Begriffstiefe).
- **Zielgruppe festhalten**: gilt ein Inhalt nicht gruppenweit, Business Unit / Firma / Rolle im `summary` benennen; gruppenweit = kein Hinweis nötig.
- **Lernpfade**: Onboarding (geführt) und Nugget-Sammlung (lose) sind derselbe Lernpfad-Gedanke bei unterschiedlichem Führungsgrad. Nuggets bleiben eigenständig; das Bündeln zu Pfaden ist Plattform-/Roadmap-Sache.
- **Glossar**: kein zentraler externer Glossar; FIKNOW pflegt ein eigenes, mitwachsendes Mini-Glossar (auch für Subbrand-Begriffe).
- **Subbrands**: FIKNOW gilt gruppenweit; Töchter (SUBITO, engram, …) dürfen im Kurstext als Beispiele genannt werden — Erklärung läuft bei Bedarf übers Glossar, der Style-Guide muss sie nicht kennen.
- **Compliance-Disclaimer**: keiner (FIKNOW ist rein ergänzend).
- **Kein zentraler Themenkatalog**: Kurse entstehen bedarfsgetrieben, nicht aus einer HR-Vorgabe.

> **Abgrenzung**: Architektur- und Produktfragen (z. B. wie Lernpfade technisch abgebildet werden, ob Relevanz ein echtes Frontmatter-Feld wird, ob es eine Mandantierung gibt) gehören **nicht** in dieses Dokument, sondern zu den ADRs/Roadmap. Hier steht nur, *wie Inhalte aufgebaut werden*.
