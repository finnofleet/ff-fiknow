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
