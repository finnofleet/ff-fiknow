# ADR 0009 — Frage-Domäne: wiederverwendbare, im Bundle autor-te Frage-Blöcke (DB als Index, per Referenz eingebettet)

- **Status:** Proposed / **Diskussion** — Trade-offs, noch NICHT entschieden,
  noch KEIN Code. Ausgelöst durch die 7c-Vorbereitung (ADR 0005) + den Bedarf
  für Repetitionsfragen (Spaced Repetition, ROADMAP).
- **Datum:** 2026-07-29
- **Kontext-Phase:** Content-Modell / Assessment / Wiederverwendung
- **Verwandt:** [[0001-mdx-bundle-als-source-of-truth-db-als-index]] (Prinzip +
  ID-Write-back), [[0004-mcp-authoring-frontend]] (Authoring-Pipeline),
  [[0005-pflichtkurse-und-compliance-nachweis]] (Abschlusstest 7a–7c),
  [[0002-ki-tutor-und-annotations-schicht]] (`flashcard`-Annotation),
  `docs/ROADMAP.md` („Repetitionsfragen").

---

## Kontext

Zwei Roadmap-Themen brauchen dasselbe, das heute fehlt: **Fragen als
adressierbare Einheiten mit Identität**.

- **7c — Fragen-Pool/Randomisierung** (ADR 0005 Nachtrag): ein Abschlusstest
  definiert einen Pool von M Fragen, pro Versuch werden N gezogen + Optionen
  gemischt (Seed pro Versuch). Braucht eine Pool-Deklaration + stabile
  Fragen-Identität.
- **Repetitionsfragen / Spaced Repetition** (ROADMAP; `flashcard` im
  Annotations-Enum reserviert): ein Scheduler zieht **einzelne** Fragen nach
  Thema/Fälligkeit — mit inline-MDX unmöglich.

Beide wollen strukturierte, wiederverwendbare Fragen. Diese ADR entscheidet, ob
und wie Fragen zu einer eigenen Domäne werden — **ohne** ADR 0001 („Bundle =
Source of Truth") zu brechen.

## Ist-Analyse (verifiziert)

- **Fragen sind heute inline-JSX im Lesson-`body`** (`<Question>/<Option>`),
  reiner MDX-Text in `payload.lessons.body` (textarea). **Keine Identität, keine
  ID, keine Struktur** — die Frage existiert nur als Text.
- **Vierfach geparst zur Laufzeit:** Render (`components/mdx/question.tsx`),
  Abschlusstest-Grading (`lib/quiz/exam-grade.ts`, MDX-AST), RAG-Guardrail
  (`lib/rag/chunking.ts`), `questionCount`-Regex (lesson page). Vier Parser
  derselben Blöcke, keine gemeinsame Wahrheit.
- **Grading matcht über den Prompt-STRING** (`exam-grade.ts` — kein stabiler
  Key). Ändert ein Autor den Prompt, bricht die Zuordnung; doppelte Prompts
  kollidieren.
- **Index-Muster existiert bereits:** `lessonChunks` + `courseIndexState`
  (`lib/db/schema.ts`) sind **Drizzle-Index-Tabellen** (keine Payload-Collection,
  kein FK zu Payload), versions-gekeyt an `courses.version`, beim Bundle-Upload
  via `indexCourse()` (`lib/rag/indexing.ts`) im „ganzer-Kurs-ersetzen"-Muster
  (Delete+Insert je Version) befüllt. DB bleibt Index, nicht Autoren-Fläche.
- **ADR 0001 liefert den ID-Mechanismus:** Upload = Upsert über stabile Slugs;
  beim ersten Upload generierte IDs werden **ins Frontmatter zurückgeschrieben**
  (Idempotenz). Genau dieser Mechanismus gibt Frage-Blöcken stabile IDs.
- **Spaced Repetition:** nur der Enum-Wert `flashcard` ist reserviert
  (`lib/annotations.ts`) — sonst NICHTS (keine Scheduling-Felder, keine Tags,
  keine Frage-Identität). Reines Platzhalter-Substrat.
- **Nachweis referenziert auf Quiz-Ebene** (section+lesson-Slug), nicht auf
  Frage-Ebene — bleibt so (Frage-Level-Analytics wäre optionaler Zusatz).

## Zielbild

**Fragen werden first-class Bundle-Blöcke mit Identität, in einen Drizzle-Index
gespiegelt, von Lektionen/Prüfungen per Referenz eingebettet.**

- **Autor-t im Bundle** (bleibt Source of Truth): Fragen als eigene Blöcke im
  Kurs-Bundle (z. B. `questions/`-Ordner), im selben gehärteten
  `<Question>/<Option>`-Vokabular (rich Optionen + Whitelist bleiben) plus eine
  stabile `id` (per ID-Write-back wie bei Lektionen, ADR 0001) und optionale
  Metadaten (`tags`/Thema, `difficulty`).
- **Indexiert** in eine neue Drizzle-Tabelle `questions` (analog `lessonChunks`:
  versions-gekeyt, Upload-Hook-befüllt, ganzer-Kurs-ersetzen) mit strukturierten
  Feldern: `id`, `courseSlug`, `version`, `prompt`, `type`, `options` (jsonb:
  Label-MDX + `correct`), `explanation`, `tags`. **Keine Payload-Collection** —
  sonst zweiter Schreibpfad (ADR-0001-Verstoß).
- **Per Referenz eingebettet:** eine Abschlusstest-Lektion deklariert einen
  **Pool** (`question_pool: [ids]` + `questions_per_attempt: N`) statt Fragen
  inline. (Formative Quizze könnten übergangsweise inline bleiben oder per
  `<Question ref="id"/>` referenzieren.)

## Warum das 7c + Spaced Repetition sauber freischaltet

- **7c wird trivial + robust:** Pool = Referenz-IDs; N per Seed ziehen ist ein
  Array-Select; Optionen mischen ist eine Permutation auf strukturierten Daten;
  Grading liest die `correct`-Flags aus dem Index — **die fragile MDX-Extraktion
  in `exam-grade.ts` entfällt** für Prüfungen, ebenso das Prompt-String-Matching
  (stabile ID statt Text). Konsolidiert die 4 Parser auf eine Quelle.
- **Spaced Repetition wird möglich:** der Scheduler zieht Fragen per `id`/`tags`
  aus dem Index; ein späteres `question_reviews`-Table (userId, questionId,
  dueDate, interval, ease) trägt den Scheduling-State. Der reservierte
  `flashcard`-Typ bekommt endlich ein Substrat.
- **Ein Autoren-Vokabular, mehrere Konsumenten** (Exam-Pool, formatives Quiz,
  Wiederholung, künftig Frage-Analytics) ohne Duplizierung.

## Versöhnung mit ADR 0001 (der Knackpunkt)

- **Bundle bleibt Source of Truth:** Fragen werden im Bundle autor-t, nicht im
  DB-Admin. Der `questions`-Index ist generiert (wie `lessonChunks`), nicht
  editierbar.
- **Einziger Schreibpfad bleibt der Bundle-Upload;** der Index wird im selben
  Upload-Hook befüllt/ersetzt.
- **ID-Write-back** ist ADR-0001-eigen — nur auf Frage-Blöcke ausgeweitet.
- **MDX = Daten:** Option-Inhalt bleibt gehärtetes `<Option>`-MDX; die
  Whitelist/`assertSafeMdx`-Härtung gilt weiter.
→ Diese ADR **erweitert** ADR 0001 (Frage-Index + Referenz-Render), verletzt es
nicht.

## Konsequenzen / Impact

- **MCP-/Authoring-Impact (stehende Regel, groß):** neues Frage-Block-Format
  muss überall verstanden werden — `lib/authoring/bundle-parser.ts`,
  `import.ts` (`mapLessonFields` + neuer Fragen-Index-Sync), `types.ts`,
  `lib/mdx/allowed-components.ts` (`ref`-Attribut?), `validate-bundle.ts`,
  `lib/authoring/guide.ts` + `docs/AUTHORING_BUNDLE.md` + Plugin-Beispiele, die
  MCP-Tools (`import_course`, `validate_bundle`, `get_authoring_guide`).
- **Render-Umbau:** eine Pool-Prüfung hat keine inline-Fragen → die Lesson-Seite
  lädt die gezogene Frage-Menge aus dem Index und rendert sie strukturiert
  (Option-Labels als kleine MDX-Fragmente). Neues „Komponente rendert
  referenzierte, server-aufgelöste Daten"-Muster (heute nicht vorhanden).
- **Grading-Transition:** `exam-grade.ts` (7a, MDX-Extraktion) wird für
  referenzierte Pools durch index-basiertes Grading ersetzt. **7a bleibt live**
  (inline) bis Prüfungen auf Pools migriert sind — die Domäne SUPERSEDET den
  inline-Exam-Mechanismus schrittweise, kein Big-Bang.
- **Migration** der bestehenden inline-Quizze: entweder automatisiert
  (Body parsen → Frage-Blöcke + Referenzen emittieren) oder Koexistenz
  (inline für formativ, referenziert für Pools) während der Übergangsphase.
- **RAG:** `lib/rag/chunking.ts` strippt heute Quiz-Lösungen aus dem Body vor der
  Indexierung — bei referenzierten Fragen entfällt das (Fragen sind nicht mehr
  im Body); der Guardrail muss angepasst werden.
- **Nachweis (ADR 0005) bleibt quiz-level;** Frage-Level-Referenz im Nachweis
  ist bewusst NICHT Teil davon (Datensparsamkeit; der Nachweis sagt „Test
  bestanden", nicht „Frage 7 richtig").

## Offene Entscheidungen (Input nötig, bevor Code)

1. **Authoring-Format der Frage-Blöcke:** (a) MDX-Dateien mit `<Question>`-Block
   + `id`/`tags`-Frontmatter in `questions/` (reuse Härtung + rich Optionen,
   Autoren-Vertrautheit) — vs. (b) strukturiertes YAML/JSON-Fragen-Bank — vs.
   (c) `<Question>` inline lassen, nur `id` + `pool`-Referenz ergänzen. *(Neige
   zu (a).)*
2. **Einbettung:** Pool per Lesson-Frontmatter (`question_pool`+`questions_per_attempt`)
   vs. Referenz-Tag `<Question ref="id"/>` im Body vs. beides.
3. **Migration:** automatisiert Big-Bang (alle inline-Quizze → Blöcke) vs.
   Koexistenz (inline weiter erlaubt, Pools neu) — Übergangsdauer.
4. **Umfang ADR 0009:** nur die Domäne + 7c-Konsum (empfohlen) — vs. gleich den
   Spaced-Repetition-Scheduler mitdenken (eigene Phase/ADR, konsumiert die
   Domäne; die Domäne muss ihn aber vorsehen: Identität + Tags).
5. **`questions` als Drizzle-Index (empfohlen, ADR-0001-konform) — bestätigt?**
   (Alternative „Payload-Collection" wäre ein zweiter Schreibpfad → abgelehnt.)

## Bezug zu 7c (aus der Diskussion)

Diese ADR ersetzt den zuvor erwogenen pragmatischen inline-MDX-7c-Ansatz
(AST-Auswahl/-Shuffle auf Roh-MDX). Sobald die Domäne steht, ist 7c ein kleiner
Aufsatz (Referenz-Pool + Seed-Auswahl auf strukturierten Daten). **7a/7b bleiben
unberührt und live** (verbindlicher, server-gewerteter Abschlusstest +
Versuchszähler) — sie funktionieren mit inline-Fragen bis zur Migration.
