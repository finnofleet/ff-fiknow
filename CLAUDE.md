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

## Release-Prozess: Semver + Changelog gehören zusammen

Jedes Release wird semantisch versioniert, und der **Changelog ist fester
Bestandteil davon** — nie das eine ohne das andere. Bei jedem Version-Bump:

1. `version` in `package.json` anheben (die Anzeige in `/version` +
   `/manage`-Footer liest genau dieses Feld; siehe `lib/app-version.ts`).
2. `CHANGELOG.md` nachführen — die `[Unreleased]`-Punkte in einen neuen,
   datierten `[X.Y.Z]`-Abschnitt verschieben und die Compare-Links unten
   aktualisieren.
3. Annotierten Git-Tag `vX.Y.Z` setzen.

Pre-1.0 (Pilotphase): neue Features → Minor-Bump, Fixes/Kleinkram →
Patch-Bump. Die Konvention steht auch im Kopf von `CHANGELOG.md`.