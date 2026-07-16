# Lerner-Features — Kandidaten & Ausbaustufen

Stand: 2026-06-11. Anker fürs Feature-Scoping nach Abschluss des
Security-Fundaments (ADR 0001 Schritt 1 + SECURITY_AUDIT vollständig).

Hergeleitet aus Wettbewerbs-Recherche — Elements of AI
(`INSPIRATION-ELEMENTSOFAI.md`), Articulate (Storyline/Rise),
LearnWorlds — und dem eigenen Domänen-Kontext: **Prüfungs-Vorbereitung**
(verstande.ch → A2-Drohne/BAZL) bzw. **Compliance-Onboarding** (FiKnow).

**Leitgedanke / Moat:** *Bundle-as-Code (KI schreibt Kurse) + lerner-seitige,
content-gegroundete KI.* Articulate ist statisch authored, LearnWorlds' KI ist
autoren-seitig. Eine lerner-seitige, aus *eurem* Inhalt gegroundete KI hat
keiner von beiden. Features werden danach ausgewählt, ob sie in diesen Moat
einzahlen — nicht ob sie LearnWorlds' Checkliste matchen.

---

## Headline-Wetten (echtes WOW, differenzierend)

1. **KI-Tutor inline** — „Ich versteh das nicht" / „Frag mich ab" / „Warum ist
   *meine* Antwort falsch?" auf jeden Absatz. Gegroundet im Kursinhalt (RAG
   über das Bundle). Der Magie-Moment; dient beiden Brands. Höchstes
   WOW-pro-Aufwand-Verhältnis und nutzt genau die Stärke des Stacks.
2. **Readiness-Engine** — der eigentliche Prüfungs-Kaufgrund. Drei Bausteine:
   realistischer **Mock-Exam** (getimt, BAZL-MC-Format) · **Readiness-Score**
   (kalibrierte Bestehens-Wahrscheinlichkeit + Themen-Breakdown) · **Spaced
   Repetition** der falsch beantworteten Fragen.
> Die beiden zahlen aufeinander ein: der KI-Tutor erklärt genau das, woran die
> Readiness-Engine Schwächen erkennt. Die Ausbaustufen (v. a. `<Scenario>`)
> liefern weitere Datenpunkte in dieselbe Schleife.

## Ausbaustufen (jeweils eine MDX-Whitelist-Komponente)

- **`<Scenario>` — Szenario-/Branching-Lernen.** „Was tust du"-Lernen via
  Entscheidungsbaum (Situation → Optionen → Konsequenz/nächster Knoten).
  Stärkster pädagogischer Steal von Articulate; paart sich mit KI
  (KI-generierte Szenarien + optional freitextbewertete Entscheidung).
  **Einordnung:** kein kursweiter „Modus", sondern ein **vierter Lesson-Typ**
  (`lesson-scenario`) neben reading/video/quiz — bzw. eine Komponente, die auch
  innerhalb einer Reading-Lesson stehen kann. Der Branching-Baum ist
  **deklarative Daten** (kein Code) → bleibt im „Daten, nicht Code"-Boundary,
  passiert den gehärteten MDX-Compile, ist KI-lesbar. Nur die optionale
  freitextbewertete Entscheidung ruft die KI (separater, gegroundeter,
  rate-limitierter Endpoint). Komponiert mit Tutor + Readiness zu einer Familie
  — wenn gebaut, in dieser Schnittmenge anfangen.
- **`<LabeledGraphic>` — Grafiken mit Hotspots.** Klickbare Punkte auf einem
  Bild/Diagramm (Drohnenteile, Luftraum-Struktur, Klassen-Übersicht). Steal von
  Articulate; stark für visuelle Domänen. Inline-SVG/Image + deklarative
  Hotspot-Liste (Koordinate + Label + Erklärung) → bleibt „Daten".
- **`<Flashcard>` — Karteikarten.** Front/Back-Begriffe. Klein in der
  Umsetzung; **paart sich mit Spaced Repetition** aus der Readiness-Engine
  (falsch erinnerte Karten tauchen wieder auf).

## Politur-Schicht (billig, hohe Wirkung — teils aus EoA-Analyse)

- **Scroll-Progress-Balken** (4px fixed-top) + **Übungszähler `0/2`** auf der
  Section-Übersicht.
- **„Weiterlernen"** — Deep-Link zur exakten Lesson + Scroll-Position.
- **Fortschritts-Visualisierung** — Progress-Ring/Skill-Map pro Thema.
- **Confidence-Tagging beim Quiz** — markiert „selbstsicher falsch" (die
  gefährlichen Lücken).
- **Hover-Illustrationen** (CSS-only, schon dokumentiert in
  `INSPIRATION-ELEMENTSOFAI.md` §6) — sobald Cover-SVGs existieren.

## Brand-Split

| Feature | verstande.ch (Consumer/Prüfung) | FiKnow (Enterprise/Onboarding) |
|---|---|---|
| Mock-Exam + Readiness | ⭐ Kernwert | ⭐ („compliance-ready?") |
| KI-Tutor | ⭐ | ⭐ |
| Szenario-Lernen | ⭐ (Flugentscheidungen) | ⭐ (Compliance-Situationen) |
| Streaks/Gamification | passt | eher **nein** (Pflichtschulung) |
| Zertifikat | hübsches Shareable | Compliance-Nachweis (→ Reporting, Phase 3) |

## Bewusst NICHT (Stand 2026-06-11)

- **SCORM-Import.** Ein SCORM-Paket ist eine Black-Box-Web-App (Fremd-Code),
  kollidiert mit dem „keine Injection/Malware"-Leitsatz (nur als sandboxed
  Quarantäne auf separater Origin denkbar) **und** ist KI-blind (kein Grounding,
  kein Tutor, keine Readiness auf opakem Content). Wäre ein separater,
  gekapselter Kurstyp *neben* den nativen Kursen, kein „Einlesen ins Modell".
  Reines FiKnow/Enterprise-Thema — **nur** wieder aufgreifen, wenn ein konkreter
  Kunde eine SCORM-Bibliothek hosten lassen will. Bis dahin weggelassen.
