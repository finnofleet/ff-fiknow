# ADR 0002 — KI-Tutor auf einer geteilten Annotations-Schicht (Lern-Begleiter)

- **Status:** Proposed
- **Datum:** 2026-06-11
- **Kontext-Phase:** Phase 3 (Lerner-Features)
- **Betroffene Bereiche:** Lern-Seite (`learn/[…]`), neuer Tutor-Endpoint, neue
  Annotations-Tabelle (+ RLS), LLM-Backend-Abstraktion, Deployment-Config
- **Verwandt:** [[0001-mdx-bundle-als-source-of-truth-db-als-index]],
  `docs/LEARNER-FEATURES.md`

---

## Kontext

Aus der Feature-Diskussion (siehe `LEARNER-FEATURES.md`): der **KI-Tutor** ist
die Headline-Wette mit dem höchsten „Magie"-Effekt und dient beiden Brands.
Beim Scoping kam die Frage auf, ob der Tutor die **Klammer** um weitere
Funktionen (Notizen, Markierungen, Flashcards) bilden kann.

Antwort dieses ADR: **Ja — aber das Fundament ist nicht der Tutor, sondern eine
geteilte Annotations-/Selektions-Schicht.** Der Tutor sitzt darauf als *ein*
Konsument. Begründung: Notizen und Markierungen sind lokal, gratis, privat und
immer verfügbar; der Tutor ist LLM-gebunden (Token-Kosten, Privacy,
Konto-/Handover-Thema). Koppelte man Markierungen *in* den Tutor, hinge eine
simple, immer funktionierende User-Data-Funktion an einem teuren, optionalen,
klassifizierungs-gegateten LLM-Feature.

Dieser Contract nagelt die Architektur fest, **bevor** Code entsteht — der Tutor
ist genau die Funktion, die man nicht ohne Spec anfängt (neue externe
Abhängigkeit, neue Security-Fläche, neues Datenmodell, Business-Implikation
Handover).

---

## Entscheidung

### 1. Annotations-Schicht ist das Fundament; der Tutor ist ein Konsument

Das gemeinsame Primitiv hinter Notiz, Markierung und Tutor-Frage ist **eine
Auswahl, verankert an einer Stelle im Content** (Lesson + Text-Range). Auf einer
Selektion sind mehrere Aktionen möglich: markieren · Notiz · „Erklär das"
(Tutor) · Flashcard erzeugen · „fürs Wiederholen merken".

- **Geteilter, unveränderlicher Content** (das MDX-Bundle, für alle gleich) +
  **benutzer-spezifisches Overlay** (Annotationen, pro User). Wie
  Kindle-Highlights / Google-Docs-Kommentare.
- Notizen/Markierungen funktionieren **ohne LLM** — auch dort, wo der Tutor aus
  ist (vertraulicher Kurs ohne Freigabe, Deployment ohne LLM-Key).
- Der Tutor ist eine Aktion, die Selektionen *liest* und gespeicherte
  Erklärungen als Annotationen *schreibt*.

### 2. LLM-Backend: pluggable, pro-Deployment, Handover-fähig

Der Tutor ruft **nicht** einen hartverdrahteten Anbieter, sondern ein
`CompletionProvider`-Interface. Konfiguration **pro Deployment** via Env-Vars
(`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`), nie
brand-übergreifend geteilt.

- **Default:** Claude API über einen **EU-/CH-Region- + Zero-Retention-Pfad**
  (AWS Bedrock / Google Vertex in EU, oder Anthropic-Enterprise-ZDR). Begründung
  Privacy: User-Notizen/-Fragen sind persönliche Daten.
- **Dokumentierte Alternativen:** Infomaniak Sovereign-API (CH-gehostet,
  Open-Models, managed) · self-hosted Open-Model (nur wenn ein Vertrag On-Prem
  erzwingt — Qualität ist bei einem Prüfungs-Tutor ein *Safety*-Merkmal,
  halluziniertes Recht ist schlimmer als kein Tutor).
- **Handover:** Bei FiKnow-Übergabe legt die Firma ihr eigenes Provider-Konto an
  → ihr Key in FiKnoms Env → unser Key raus. Eine Env-Var, kein Code-Change.
  (Das LLM-Konto reiht sich in die übrigen brand-spezifischen Konten ein:
  Supabase/GoTrue, DB, Storage, Domain, Entra-Tenant, GHCR.)

### 3. Grounding: v1 in-context, v2 RAG

Der Tutor antwortet **nur aus dem Kursinhalt** (sonst halluziniert er
Prüfungsstoff zusammen).

- **v1 — in-context:** „Erklär *diese* Selektion" groundet trivial auf der
  Lesson, die gerade gelesen wird (markierter Text + Umgebung sind schon als MDX
  im Bundle). **Keine Vektor-DB nötig.** Kleinste Risikofläche.
- **v2 — RAG:** freies „Frag irgendwas zum Kurs" braucht Retrieval über den
  ganzen Kurs (Embeddings). Späterer Slice.

### 4. Annotations-Datenmodell: user-scoped, RLS, robustes Anchoring

Neue Tabelle (passt ins bestehende RLS-Muster wie User-Progress):

```
annotations(
  id, user_id,                         -- RLS: jeder sieht nur seine eigenen
  course_slug, lesson_slug,            -- Anker-Ziel (zeigt in geteilten Content)
  bundle_version,                      -- gegen welche Version verankert (Drift)
  type,                                -- highlight | note | tutor_explanation | flashcard
  anchor_quote, anchor_prefix, anchor_suffix,  -- robustes Anchoring (text-quote)
  anchor_start, anchor_end,            -- text-position (schneller Fallback)
  color, body,                         -- Markierungsfarbe bzw. Notiz-/Erklärungstext
  created_at, updated_at
)
```

**Anchor-Drift** (erzwungen durch versionierte Bundles, ADR 0001): wird ein Kurs
neu hochgeladen, verschiebt sich Text → Offset-Anker zeigen falsch. Lösung wie
Hypothes.is/Kindle: **text-quote als primärer Anker** (markiertes Zitat +
Prefix/Suffix), **text-position als Fallback**. Driftet die Position, wird über
das Zitat neu lokalisiert; sonst wird die Annotation **sauber „verwaist"** (in
einer Liste sichtbar, nicht falsch inline gerendert) statt auf die falsche
Stelle zu zeigen.

### 5. Modell & Kosten

Die Claude API ist ein **separater, nutzungsabhängiger Kostenblock** (eigenes
Anthropic-/Cloud-Konto, pay-per-Token; nicht durch ein Abo gedeckt). Hebel,
die der Tutor-Endpoint von Anfang an mitbringt:

- **Modell-Tier konfigurierbar** — Start mit Haiku/Sonnet (für „erklär einfacher"
  meist ausreichend), Opus nur wo nötig; messen, dann hochstufen.
- **Prompt-Caching** des Lesson-Kontexts (mehrere Fragen zur selben Lesson →
  wiederholter Input ~0,1×).
- **`max_tokens`-Cap** pro Antwort.
- **Rate-Limit pro User** (vorhandene `lib/rate-limit.ts`).
- **Account-Spending-Limit** als harte Obergrenze.

### 6. UI-Surface

Der Companion lebt im **rechten Rail** der Lesson (das Design kennt `.a-tools`:
Notizen/Lesezeichen/Markieren bereits). Selektion → Kontextmenü (Markieren ·
Notiz · „Erklär das"). Tutor-Antworten erscheinen im Panel und können als
`tutor_explanation`-Annotation gespeichert werden.

---

## Sicherheits-Anforderungen

Der Tutor öffnet eine **neue untrusted-Input-Fläche** (User-Input → LLM). Analog
zum Leitsatz aus ADR 0001 gilt: keine Injection, keine Kosten-Eskalation, kein
PII-Leak.

1. **Prompt-Injection.** User-Selektion und -Frage werden klar als Daten
   abgegrenzt; der System-Prompt instruiert, Kursinhalt als autoritativ und
   User-Text als reine Frage zu behandeln — keine verhaltensändernden
   Anweisungen aus User- oder Content-Text befolgen.
2. **Output ist untrusted Text.** Die Tutor-Antwort wird als **sanitisiertes
   Markdown** gerendert (kein rohes HTML/JS) — gleiche „Daten, nicht Code"-Haltung
   wie der MDX-Pfad.
3. **Kosten.** Rate-Limit pro User + `max_tokens`-Cap + Account-Spending-Limit.
4. **PII.** User-Notizen/-Fragen = persönliche Daten → ZDR/EU-Region-Pfad;
   Prompts mit PII nicht im Klartext loggen.
5. **Kurs-Klassifizierung / Gating.** Tutor nur für Kurse mit `tutor_enabled`
   (public/freigegeben). Vertrauliche Kurse → aus oder strikterer Backend.
6. **RLS auf Annotationen.** Row-Level-Security stellt sicher, dass jeder nur
   seine eigenen Annotationen liest/schreibt.

---

## Schichtung (Slices)

1. **Annotations-Schicht + „Erklär diese Selektion"** (in-context gegroundet,
   pluggable Backend, rate-limited) — der WOW-MVP, kleinste Risikofläche.
2. **Notizen + Markierungen** (lokal, kein LLM) — auf derselben Schicht.
3. **Cross-Course-Q&A** (echtes RAG).
4. **Flashcards aus Markierungen** (→ koppelt an Spaced Repetition der
   Readiness-Engine).

---

## Abgrenzung / Was diese Entscheidung NICHT sagt

- Sie macht den Tutor **nicht** zum architektonischen Container für Notizen/
  Markierungen — die liegen auf der Annotations-Schicht und funktionieren ohne
  ihn.
- Sie schreibt **kein** Self-Hosting des LLM vor — nur ein austauschbares
  Backend. Self-Host erst, wenn ein Vertrag On-Prem erzwingt.
- Sie deckt **nicht** SCORM-Import ab (bewusst weggelassen, siehe
  `LEARNER-FEATURES.md`).

## Alternativen

- **A) Tutor als Stand-alone-Chat ohne Annotations-Schicht.** Verworfen: verpasst
  die Klammer (Notizen/Markierungen/Flashcards teilen den Anker) und koppelt
  User-Data unnötig an das LLM.
- **B) RAG von Tag 1.** Verworfen für v1: „erklär diese Selektion" braucht keine
  Vektor-DB; RAG ist unnötige Komplexität/Kosten für den ersten Slice.
- **C) Hartverdrahteter LLM-Anbieter.** Verworfen: bricht die Handover-Story und
  die Privacy-Wahlfreiheit (EU/CH/self-host pro Deployment).
- **D) Gewählt:** Annotations-Schicht als Fundament + pluggable, gegroundeter
  Tutor obendrauf, in Slices.

## Offene Fragen

- Default-Modell für v1 konkret (Haiku 4.5 vs Sonnet 4.6) — nach erster Messung
  der Erklär-Qualität entscheiden.
- Konkreter EU/ZDR-Pfad (Bedrock vs Vertex vs Anthropic-Enterprise) — abhängig
  von vertraglicher ZDR-Verfügbarkeit für die jeweilige Region.
- Sichtbarkeit von Annotationen: v1 privat; später evtl. geteilte/Instruktor-
  Annotationen (FiKnow-Kohorte) — eigener Scope.

## Konsequenzen

- Neue Tabelle `annotations` + RLS-Policies (Drizzle-Migration).
- Neuer authentifizierter Endpoint (Tutor) mit Provider-Abstraktion, Grounding,
  Rate-Limit, Output-Sanitisierung, Gating.
- Neue Deploy-Vars pro Brand (`LLM_*`) — in die README-Deploy-Notiz + die
  FiKnow-Handover-Checkliste aufnehmen.
- Der Render-/Sanitisierungs-Ansatz aus `lib/mdx/` ist wiederverwendbar für die
  Tutor-Output-Darstellung.
