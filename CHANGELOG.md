# Changelog

Alle nennenswerten Änderungen an FiKnow werden hier festgehalten.

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

> **Release-Konvention:** Der Changelog ist fester Bestandteil jedes
> Semver-Releases. Bei jedem Version-Bump gehören **zusammen**:
> 1. `version` in `package.json` anheben (die Anzeige in `/version` +
>    `/manage`-Footer liest genau dieses Feld),
> 2. hier einen datierten Abschnitt für die neue Version ergänzen (die
>    `[Unreleased]`-Punkte dorthin verschieben),
> 3. einen annotierten Git-Tag `vX.Y.Z` setzen.
>
> Pre-1.0 (Pilotphase): neue Features → Minor-Bump, Fixes/Kleinkram →
> Patch-Bump.

## [Unreleased]

## [0.2.0] – 2026-07-31

Erste sprechende Version seit der un-versionierten `0.1.0`-Basis. Ab hier
zeigt der `/manage`-Footer die laufende Version an.

### Hinzugefügt
- **Server-seitig gewerteter Abschlusstest** (`final_exam`): dedizierter
  Prüfungstyp, serverseitig bewertet; Bestehen ist für Pflichtkurse
  verbindlich. Versuchszähler im Nachweis. (ADR 0005 7a/7b)
- **Fragen-Pool & Randomisierung** (ADR 0009): wiederverwendbare Frage-Blöcke
  (`questions/`) mit zentralem Index, deterministisch geseedeter Ziehung pro
  Versuch und server-seitigem Index-Grading. Inline-`<Question>` bleibt
  formativ gültig.
- **Rollen, Rechte & Compliance-Scoping scharf geschaltet** (ADR 0007 P2b–P5a):
  capability-basierte Autorisierung zur Laufzeit, Sicht-Scope nach Land/BU
  (Zeilenfilter gegen die aktuellen Profildaten), PII-freie **Aggregat-Sicht**
  im Compliance-Dashboard (k-Anonymität ≥ 5), append-only **Audit-Log**
  (Authoring-Lifecycle inkl. MCP + Admin-Aktionen), **Rechte-Inspektor** unter
  `/manage/rechte`.
- **Versions-/Build-Anzeige**: `/version`-Endpoint + Versionsanzeige im
  `/manage`-Footer (`lib/app-version.ts`).

### Geändert
- Compliance-Dashboard zweigeteilt in namentliche (scope-gefilterte) und
  anonymisierte Aggregat-Sicht (`compliance:view-named` /
  `compliance:view-aggregate`).

### Behoben
- Quiz: korrekte Antworten wurden teils fälschlich als falsch gewertet —
  `next-mdx-remote` strippte `correct={true}` (Root-Cause-Fix).
- „durchgeklickt = bestanden": Abschluss von Pflichtkursen hängt jetzt am
  bestandenen, server-gewerteten Abschlusstest statt an blossem Durchklicken.
- `/manage`-Layout-Gate capability-basiert korrigiert; Scope-Filter gegen die
  aktuellen `profiles.land/bu` statt gegen den Nachweis-Snapshot.

### Sicherheit
- **Score-Leak-Fix**: Nachweis (`evidence`) ist score-frei — nur „bestanden" +
  Versuchszahl staff-lesbar, Detail-Score bleibt owner-only.
- Offene Dependabot-Alerts geschlossen (überwiegend via `overrides`, ohne
  Breaking-Changes).
- Altlasten entfernt (GoTrue/Supabase-Altreferenzen).

## [0.1.0]

Un-versionierte interne Ausgangsbasis (nie separat getaggt). Kern der Plattform
inkl. MDX-Bundle-Authoring, KI-Tutor + RAG, Katalog/Kurse, Lernpfade,
Pflichtkurse & Compliance-Nachweis, OIDC/Keycloak-Auth, DSG-Retention. Details
siehe `docs/ROADMAP.md` und `docs/adr/`.

[Unreleased]: https://github.com/finnofleet/ff-fiknow/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/finnofleet/ff-fiknow/releases/tag/v0.2.0
