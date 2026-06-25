@AGENTS.md

## Modell-Verteilung: Subagents für Routinearbeit nutzen

Yves arbeitet primär mit Opus, hat aber begrenztes Opus-Token-Budget. Um das
zu schonen, **delegiere Implementierungs-Routinearbeit an Subagents mit
kleineren Modellen** statt sie direkt im Hauptthread zu machen.

### Was an Subagents auslagern (Sonnet oder Haiku)

- **Schreib-Tasks**: README-Updates, Schema-Dokumentation, Migration-Notes,
  Authoring-Guides, Changelog-Einträge
- **Mechanische Refactorings**: „Alle Vorkommen von X durch Y ersetzen",
  Vars umbenennen, Imports umstellen
- **Codefile-Erstellung nach klarer Spec**: kleine Komponenten, Utility-
  Funktionen, Test-Daten, Seed-Skripte
- **Suchen/Listen**: „wo wird Y verwendet?", „welche Files matchen X?"
- **Lookups**: API-Doku-Recherche, Library-Versionen prüfen, Beispiele finden

Verwende `Agent` mit `subagent_type: "general-purpose"` und expliziter
`model: "sonnet"` oder `model: "haiku"`-Override (Sonnet für komplexere
Schreibarbeit, Haiku für simple Lookups).

### Was im Hauptthread (Opus) bleiben muss

- **Architektur-Entscheidungen** und Trade-off-Diskussionen
- **Debugging mit unklarer Ursache** (keine reproduzierbare Spec)
- **Codeänderungen mit Designtradeoffs** (z. B. „env-vars vs YAML",
  „Multi-Tenant vs Multi-Deployment")
- **Live-Abstimmung mit Yves**, wo der Conversation-Kontext wichtig ist
- **Konzeptionelles Brainstorming** und Strategiefragen

### Vorgehen

1. Wenn die nächste Teilaufgabe gut spezifiziert ist und keine
   Designentscheidung mehr braucht → an Subagent delegieren.
2. Subagent-Prompt enthält: vollen Kontext der Aufgabe, gewünschtes Ergebnis,
   relevante Dateipfade, klare Definition of Done.
3. Nach Rückkehr des Subagents: Ergebnis prüfen (Trust-but-verify),
   ggf. committen.

Defaultmäßig keine Bestätigung von Yves nötig vor Subagent-Spawn — er hat
diesen Modus explizit gewünscht.