# ADR 0003 — RAG-Grounding für den KI-Tutor

- **Status:** Proposed (Kern-Entscheidung) · Phase 1+2 umgesetzt + live
  — **zwei wichtige Nachträge am Ende:** (1) pgvector verworfen → `real[]` +
  App-Cosine; (2) automatischer Scope-Router verworfen → Button „Allgemeinwissen
  ergänzen" (user-initiiert), Phase-3-Schwellen-Tuning damit hinfällig
- **Datum:** 2026-06-14
- **Kontext-Phase:** Phase 3 (Lerner-Features)
- **Betroffene Bereiche:** Tutor-Endpoint (`api/tutor/explain`), neuer
  Embedding-Client, pgvector + `lesson_chunks`-Tabelle (Migration),
  Import-/Upload-Pipeline (Index-Generierung), Deployment-Config (Embedding-API-Key)
- **Verwandt:** [[0001-mdx-bundle-als-source-of-truth-db-als-index]],
  [[0002-ki-tutor-und-annotations-schicht]], `docs/LEARNER-FEATURES.md`,
  `SECURITY_AUDIT.md`, `docs/ROADMAP.md` (Abschnitt „Plattform-Skalierung")

---

## Kontext

Der KI-Tutor (ADR 0002) ist der zentrale WOW und der Moat: **lerner-seitige,
aus dem eigenen Content gegroundete KI** — das hat weder Articulate (statisch
authored) noch LearnWorlds (autoren-seitige KI).

Heutiger Stand: Der Tutor groundet per **Kontext-Injektion** — er lädt die
*aktuelle Lektion* (`getLesson` + `lib/tutor/prompt.ts`) und gibt Selection/
Lesson in den Prompt. Es gibt **kein Retrieval**, **keine** Embedding-/Vektor-
Infra, und **keine** Unterscheidung „im Kurs behandelt" vs. „nicht behandelt".

Zwei Lücken folgen daraus:

1. **Kein Cross-Lesson-Grounding.** Eine Frage, deren Antwort in Lektion 3
   steht, während der Lerner in Lektion 7 ist, wird nicht gefunden — der Kontext
   ist immer nur die gerade offene Lektion.
2. **Keine Scope-Trennung.** Lerner fragen auch Dinge, die der Kurs **nicht**
   abdeckt (Allgemeinwissen). Heute behandelt der Tutor beides gleich. Bei
   Prüfungsvorbereitung ist das vertrauenskritisch: eine ungegroundete
   LLM-Antwort kann **prüfungsfalsch** sein (BAZL/EU-Drohnenrecht ist
   jurisdiktionsspezifisch; LLM-Allgemeinwissen ist da gern veraltet/US-zentriert).
   Der Lerner muss erkennen, was *prüfungsrelevant* ist und was *allgemeine
   Einordnung*.

## Entscheidung

**Der Tutor wird auf echtes Retrieval umgestellt: Vektor-Suche über den
Kurs-Content (pgvector), wobei die Retrieval-Relevanz nicht nur Kontext liefert,
sondern als Router zwischen gegroundet und ungegroundet dient.**

Konkret:

1. **Vektor-Retrieval ersetzt die statische Aktuelle-Lektion-Injektion.**
   `pgvector` (Supabase/Postgres bringt es nativ mit) hält Embeddings der
   Lektions-Chunks. Pro Tutor-Anfrage wird die Frage embedded und gegen den
   Index gesucht. Der Vektor-Index ist — konsistent mit ADR 0001 — **nur ein
   weiterer generierter Index** über das Bundle (Bundle = Wahrheit).

2. **Retrieval-Relevanz ist der Router.** Eine Relevanz-Schwelle entscheidet:
   - **In-Scope** (Treffer über Schwelle) → gegroundete Antwort aus dem
     Kursmaterial, in der **exakten Terminologie/Framing des Kurses**,
     verankerbar an konkreten Lektionen.
   - **Out-of-Scope** (unter Schwelle / leer) → Allgemeinwissen, aber **sichtbar
     markiert** („nicht im Kurs behandelt / allgemeine Einordnung") und
     **vorsichtig** formuliert (besonders bei Regulatorik). Ungegroundete
     Antworten sind bewusst zweitklassig.

   Ein `grounded`-Flag wird an die UI durchgereicht, damit die Vertrauens-Stufe
   für den Lerner sichtbar ist.

3. **Embedding-Provider: Voyage** (von Anthropic empfohlen, kohärent zum
   Claude-Stack). Ein neuer, hinter einer Abstraktion gekapselter Client
   (analog `lib/llm/`) + ein neuer API-Key in der Deployment-Config. Provider
   austauschbar (OpenAI `text-embedding-3-small` als Alternative).

4. **Index-Generierung beim Upload, versions-gekeyt.** Die bestehende
   Import-Pipeline (`lib/authoring/import.ts`) chunked + embedded die Lektionen
   und legt die Vektoren ab — gekeyt an `courses.version` wie das Bundle-Storage.
   **Best-effort**: ein Embedding-API-Hänger darf den Upload **nicht** scheitern
   lassen → bei Fehler wird der Kurs als „needs-reindex" markiert; ein
   Re-Index-Trigger (Endpoint/Command) holt es nach. Plus ein **Backfill** für
   bestehende Kurse. Bei neuer Version wird neu embedded.

5. **Chunking pro Lektions-Abschnitt/Heading**, Token-Cap + kleiner Overlap.
   Figure-Alt/Caption bleiben als Text drin.

   **Quiz-Integrität (Pflicht, Defense-in-Depth) — der Tutor darf in KEINE
   Richtung zum Quiz-Löser werden:**
   - **(a) Index:** Quiz-`<Question>`-Lösungen (korrekte Optionen + Erklärungen)
     werden **nicht embedded** → kein Antwortschlüssel im Retrieval.
   - **(b) Kontext:** auch die als Kontext mitgegebene aktuelle Lektion wird vor
     dem Prompt von `<Question>`-Lösungsmarkern **bereinigt** → der Tutor *hat*
     die Antwort gar nicht erst.
   - **(c) Verhalten:** wenn die **Selection** (oder der Lektions-Kontext) eine
     Quiz-Frage IST — also der Lerner eine Frage markiert und nach der Lösung
     fragt — **verweigert** der Tutor die Antwort: er erklärt das zugrunde
     liegende Konzept oder gibt einen sokratischen Hinweis, nennt aber **nicht
     die richtige Option**. Gilt auch dann, wenn das LLM die Antwort selbst
     herleiten könnte (Prompt-Instruktion + serverseitige Erkennung, dass die
     Selection eine `<Question>` trifft).

   Begründung: Ohne diesen Guardrail hebelt der Tutor Quizzes und die
   Readiness-Engine (den eigentlichen Prüfungswert) trivial aus.

6. **Scope v1: der aktuelle Kurs.** Kursübergreifendes Retrieval ist heute
   selten nötig und macht Rauschen. **Zukunft:** Sobald **Lernpfade**
   (Course-Bündel, eigene Collection — siehe Roadmap) etabliert sind, muss sich
   das Retrieval **am ganzen Pfad** orientieren (mehrere Kurse als Scope), damit
   der Tutor pfad-übergreifend groundet. Vermerkt in
   `docs/INSPIRATION-ELEMENTSOFAI.md` §4 (Lernpfade).

7. **Datenresidenz.** Embeddings schicken Kurs-Text an den Provider — für
   **öffentliche** Kurse unkritisch. Für **vertrauliche/nicht-öffentliche**
   Kurse (heute nicht unterstützt, siehe `SECURITY_AUDIT.md` „Bewusste
   Design-Grenze" + Roadmap-Idee „restricted-audience") bräuchte es **lokale/
   private Embeddings** — ein weiterer Grund, dass restricted courses ein eigenes
   Modell brauchen.

## Begründung

- **Grounding = Prüfungs-Korrektheit + Moat.** Die exakte Framing des Kurses
  statt einer generischen (evtl. prüfungsfalschen) Antwort ist der Kaufgrund-nahe
  Differenzierer.
- **Kein neuer Infra-Baustein.** pgvector kommt mit Postgres/Supabase; keine
  separate Vektor-DB.
- **Konsistent mit ADR 0001.** Index-Generierung beim Upload, Bundle bleibt die
  Wahrheit, der Vektor-Index ist abgeleitet und reproduzierbar.
- **Scope-Router statt nur Kontext** ist die eigentliche Einsicht: dasselbe
  Retrieval beantwortet „was ist relevant" UND „ist es überhaupt im Kurs".

## Konsequenzen & Constraints

1. **Neue externe Abhängigkeit** (Embedding-API). Upload-Latenz/-Erfolg darf
   nicht daran hängen → best-effort + Re-Index-Pfad (Pflicht, nicht Kür).
2. **Migration**: pgvector-Extension + `lesson_chunks`-Tabelle (Drizzle).
   Vektor-Storage-Kosten einkalkulieren.
3. **Re-Embed-Pflicht bei Version-Bump** — sonst driftet der Index gegen den
   Content (analog dem Conflict-Token-Modell).
4. **Eval/Guardrails** sind Teil der Umsetzung, nicht optional: Out-of-Scope-
   Antworten müssen nachweislich vorsichtig sein (Regulatorik-Halluzination),
   die Relevanz-Schwelle wird empirisch kalibriert, kleines Eval-Set.
5. **`grounded`-Flag UI-seitig** — die Scope-Trennung ist nur dann ein
   Vertrauens-Feature, wenn sie für den Lerner sichtbar ist.
6. **Latenz**: Query-Embedding + Retrieval pro Anfrage ist klein; der
   Index-Build ist die Kostenstelle (einmal pro Upload/Version).

## Umsetzung in Phasen

1. **Infra + Index:** pgvector + `lesson_chunks` (Migration); Chunk+Embed in
   `import.ts` (versions-gekeyt, best-effort); Re-Index-Trigger + Backfill.
2. **Retrieval + Routing:** kurs-scoped Top-k + Relevanz-Schwelle im
   Tutor-Endpoint; Prompt-Routing gegroundet vs. markiert-allgemein;
   `grounded`-Flag an die UI.
3. **Eval + Tuning:** Schwellen-Kalibrierung, Regulatorik-Guardrails, Eval-Set.

---

## Nachtrag 2026-06-15 — pgvector verworfen → `real[]` + App-seitiges Cosine

Beim ersten Prod-Deploy von Phase 1 hat sich die Kern-Annahme „pgvector kommt
mit Postgres/Supabase" (Begründung-Bullet 2, Konsequenz 2) als **falsch für
diesen Deployment-Host** erwiesen und einen **kompletten Prod-Ausfall** ausgelöst.

**Was passierte.** Die Boot-Migration `CREATE EXTENSION vector` schlug fehl:
`extension "vector" is not available` (Postgres-Code 0A000) — das pgvector-Binary
ist auf dem Prod-Postgres (Jelastic) **nicht installiert und nicht installierbar**
(locked-down Container, kein `apt`). Weil die Migration als **harte Boot-Migration**
über `instrumentation.register()` lief, verweigerte Next den Start → globaler 500
auf allen Routen.

**Pivot (umgesetzt + live).** pgvector wird **nicht** verwendet:

- **Storage:** `lesson_chunks.embedding` ist ein plain **`real[]`** (natives
  Postgres-Array, keine Extension). Migration 0006 ist Vanilla-SQL (`real[]` +
  btree auf `(course_slug, version)`) und läuft auf jedem Postgres.
- **Retrieval (Phase 2):** **Brute-Force-Cosine in der App** über die per
  `course_slug + version` geladenen Chunks — KEIN ANN-Index. Für **Scope v1
  (aktueller Kurs**, Größenordnung Hunderte Chunks — `a2-drohne` = 219) ist das
  in Mikrosekunden erledigt; ein ANN-Index (hnsw) lohnt erst bei großem,
  **kursübergreifendem** Korpus. Sobald Lernpfade pfad-weites Retrieval brauchen
  (Decision 6), neu bewerten: pgvector-fähiges DB-Image oder externer Store.

**Unverändert gültig:** Scope-Router + Relevanz-Schwelle (Decision 2), Voyage als
Provider (3, `voyage-3.5-lite`/1024), Index beim Upload + best-effort +
Re-Index/Backfill (4), Chunking inkl. Quiz-Guardrails (5), Versions-Keying, das
`grounded`-Flag. Nur **Speicher-Typ** und **Suchverfahren** ändern sich — die
Embedding-Dimension (1024) bleibt relevant für Cosine-Konsistenz, wird aber nicht
mehr DB-seitig erzwungen. „Kein neuer Infra-Baustein" (Begründung) gilt sogar
*stärker* — nicht mal eine Extension nötig, nur ein Array-Feld.

**Lessons learned:** Ein **optionales** Feature darf nie über eine harte
Boot-Migration laufen, die den Start verweigern kann — sonst nimmt es die ganze
Plattform mit. Keine Postgres-Extension am Prod-Host voraussetzen, ohne sie dort
verifiziert zu haben. (Sofort-Restore bei Boot-Crash: Env `SKIP_MIGRATIONS=true`
+ redeploy.)

**Status Phase 1:** umgesetzt + **live-verifiziert** (Backfill `a2-drohne` →
`indexed`, 219 Chunks). Phase 2 (Retrieval/Routing als app-seitiges Cosine) ist
der nächste Bau-Schritt.

---

## Nachtrag 2026-06-16 — automatischer Scope-Router verworfen → Button „Allgemeinwissen ergänzen"

Phase 2 ist live. Dabei zeigte sich, dass **Decision 2 (Relevanz-Schwelle als
automatischer Scope-Router)** in der Praxis nicht trägt:

**Problem (Self-Match).** Der Lerner markiert Text, der *selbst Kursinhalt ist*.
Embeddet man die Selektion (± Zusatzfrage) und sucht im Index, matcht sie ihren
**eigenen Chunk** mit sehr hohem Cosine → der beste Treffer liegt fast immer
über jeder sinnvollen Schwelle → der Router entscheidet praktisch **immer
„in-scope"**. Der „out-of-scope → Allgemeinwissen"-Pfad feuerte damit kaum je;
eine Schwellen-Kalibrierung (geplante Phase 3) hätte daran nichts Grundsätzliches
geändert. Sowohl der Autor als auch Yves haben das unabhängig beobachtet.

**Entscheidung (umgesetzt).** Die Scope-Trennung wird **nicht automatisiert,
sondern user-initiiert:**

- **Default = immer aus dem Kurs grounden.** Retrieval bleibt; die Relevanz-
  Schwelle ist nur noch ein **Rausch-Filter** für die Kontext-Injektion (zu
  schwache Chunks nicht in den Prompt), **kein** gegroundet/ungegroundet-Router.
  Liefert das Retrieval nichts Relevantes oder ist es nicht verfügbar → Fallback
  auf die aktuelle Lektion (weiterhin gegroundet).
- **Button „Allgemeinwissen ergänzen".** Reicht die Kurs-Antwort nicht, holt der
  Lerner mit einem expliziten Klick eine **ungegroundete** Antwort aus dem
  Allgemeinwissen (`mode: "general"`) — sichtbar markiert („Außerhalb des
  Kurses") und vorsichtig formuliert. Sie wird **unter** die Kurs-Antwort
  **angehängt, nicht ersetzt** → der Lerner kann vergleichen, die Kurs-Antwort
  bleibt primär/autoritativ.

**Warum besser.** Die zweitklassige Allgemein-Antwort ist jetzt eine **bewusste
Lerner-Entscheidung** statt eines stillen, fragilen Schwellen-Urteils — das
trifft den Vertrauens-Gedanken der ADR genauer. Und: **macht die Phase-3-
Schwellen-Kalibrierung überflüssig** (kein Eval-Apparat auf Spec).

**Unverändert gültig:** Vektor-Retrieval (Decision 1), Voyage (3), Index/Backfill
(4), Chunking + Quiz-Guardrails a/b/c (5), `grounded`-Flag + Quellen an die UI.
Nur **Decision 2** wird ersetzt: Relevanz = Rausch-Filter, Scope = Button.

**Status:** Phase 1+2 live; dieser Nachtrag umgesetzt (Route `mode`-Param,
ungrounded nur noch button-initiiert, UI-Button + angehängter Block). Phase 3
(Eval/Tuning) **aufgeschoben — bei Bedarf, nicht auf Spec** (kein Security-/
Nutzungs-Trigger; der Button entschärft den ursprünglichen Hauptgrund).
