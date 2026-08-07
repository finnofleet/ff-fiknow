# Architecture Decision Records

Architecture Decision Records (ADRs) halten bedeutsame, schwer umkehrbare Architektur-Entscheidungen samt Kontext, Begründung und Alternativen fest. Eine ADR ist im Kern immutabel — wird eine Entscheidung revidiert, entsteht eine neue ADR, die die alte ablöst, statt die alte umzuschreiben.

## Konventionen

- **Dateiname:** `NNNN-kebab-case-titel.md`, fortlaufend nummeriert ab `0001`.
- **Pflicht-Header** (oben in jeder ADR): Status, Datum, Kontext-Phase, Betroffene Bereiche.
- **Status-Werte:** `Proposed` | `Accepted` | `Superseded by ADR-XXXX` | `Deprecated`
- **Empfohlene Abschnitte:** Kontext · Entscheidung · Begründung · Konsequenzen/Constraints · Alternativen · Referenzen *(optional je nach ADR: Sicherheits-Anforderungen, „Löst ab / ändert")*
- **Neue ADR:** nächste freie Nummer verwenden. Bei Ablösung den Status der alten ADR auf `Superseded by ADR-XXXX` setzen und gegenseitig verlinken.

## Index

| Nr | Titel | Status | Datum |
|----|-------|--------|-------|
| 0001 | [MDX-Bundle als Source of Truth, Datenbank als generierter Index](0001-mdx-bundle-als-source-of-truth-db-als-index.md) | Accepted | 2026-05-28 |
| 0002 | [KI-Tutor auf einer geteilten Annotations-Schicht (Lern-Begleiter)](0002-ki-tutor-und-annotations-schicht.md) | Proposed | 2026-06-11 |
| 0003 | [RAG-Grounding für den KI-Tutor](0003-rag-grounding-fuer-den-ki-tutor.md) | Proposed | 2026-06-14 |
| 0004 | [MCP als eigenständiges Authoring-Frontend](0004-mcp-authoring-frontend.md) | Proposed | 2026-06-17 |
| 0005 | [Pflichtkurse & Compliance-Nachweis](0005-pflichtkurse-und-compliance-nachweis.md) | Accepted | 2026-07-03 |
| 0006 | [Datenschutz: Aufbewahrung & Löschung](0006-datenschutz-aufbewahrung-und-loeschung.md) | Accepted (teilw. umgesetzt) | 2026-07-24 |
| 0007 | [Mandanten-Scoping & Auswerte-Ebenen für Compliance-Nachweise](0007-mandanten-scoping-und-auswerte-ebenen.md) | Proposed | 2026-07-26 |
| 0008 | [RLS-Härtung: DB-seitige Durchsetzung als Defense-in-Depth](0008-rls-haertung.md) | Entschieden (zurückgestellt) | 2026-07-28 |
| 0009 | [Frage-Domäne: wiederverwendbare Frage-Blöcke](0009-frage-domaene.md) | Umgesetzt (D1–D3) | 2026-07-29 |
| 0010 | [Kurs-Sichtbarkeit nach Land/BU](0010-kurs-sichtbarkeit-land-bu.md) | Proposed | 2026-07-31 |
| 0011 | [Hierarchisches Rollen-Ziel für Pflichtschulungen](0011-hierarchisches-rollen-ziel-pflichtschulungen.md) | Accepted | 2026-08-07 |
