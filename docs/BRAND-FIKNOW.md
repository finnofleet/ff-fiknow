# FiKnow / FINNOFLEET — Brand-Referenz

Destillat aus dem offiziellen Brandbook (`docs/brand-refs/FINNOFLEET-brandbook-2026-02-10.pdf`).
FiKnow ist die edu-platform-Instanz im FINNOFLEET-Look. **Dieses Dokument ist
die maßgebliche Quelle** für fiknow-Farben, Schrift, Diagramme, Icons und
Bildsprache — nicht die abgeleiteten CSS-Tokens.

## Marke

FINNOFLEET — FinTech-Gruppe (Kreditmanagement-Software). Claim „Navigating
Financial Horizons". Attribute: **visionär, technisch, menschlich, nahbar,
authentisch**. Mut zu Innovation, KI-Fokus.

## Farben

**Primärfarben**
| Rolle | HEX | Hinweis |
|---|---|---|
| Dunkel (Ink/BG) | `#333333` | Logo positiv, Text, dunkle Flächen |
| Weiß | `#FFFFFF` | Logo negativ, helle Flächen |
| **Lime (Akzent)** | `#99FF33` | Pantone 375C · RGB 153/255/51 · der Signature-Akzent |
| Grau | `#757575` `#AAAAAA` `#CCCCCC` `#EEEEEE` | Abstufungen |

**Sekundärfarben** (für kategoriale Daten, z. B. Kreisdiagramme)
- Blau-Skala: `#0A3E57` · `#2D779B` · `#68B8DF` · `#9DDCFA` · `#C8EDFF`
- Magenta/Pink-Skala: `#631241` · `#BB4288` · `#F57BC1` · `#FFADDC` · `#FFCFEB`

**Kontrast-Regel (wichtig):** `#99FF33` funktioniert auf **dunklem** Grund
(#333) brillant, ist auf **hellem** Grund aber kontrastarm → dort nur als
**Fläche/Highlight**, nie für dünne Linien oder kleinen Text. Linien/Text auf
hell laufen in `#333333`.

## Schrift

- **Sora** — Web, Print, digital. Regular (Fließtext), Bold (Headlines).
- **Aptos** — Office (PowerPoint/Word/Excel/Mail). Regular, ExtraBold.
- Für die Plattform (`fontSet: sora`) ist **Sora** die Diagramm-/Label-Schrift.

## Diagramm-Sprache — CLEAN, nicht skizzenhaft

Das Brandbook definiert eine **eigene, flache/geometrische** Diagramm-Sprache
(S. 18–21). **Kein** handgezeichneter Stil, kein Wobble:

- **Flussdiagramm** (S. 21): rechteckige Boxen (Tätigkeit = hellgrau, Schleife =
  grau), **Raute** = Bedingung, **Kreis lime+dunkler Rand** = Start/Ende,
  dünne gerade Verbinder mit einfachen Pfeilspitzen, Sora-Labels.
- **Balken**: flach, `#333` + `#99FF33`, graue Gridlines, weißer Grund.
- **Linien**: `#333` + Grau `#AAAAAA`, quadratische Marker.
- **Kreis**: die **Blau-Skala** für Kategorien.
- **Tabellen** (S. 22): nur **horizontale** dünne Hellgrau-Linien (keine
  vertikalen Linien), Zahlen **rechtsbündig**, vergangene Werte grau / aktuelle
  Spalte dunkel + dünn **umrahmt**, Summen-/Total-Zeilen **fett** mit Oberlinie,
  großzügige Zeilenhöhe, Sora. → Das ist **Plattform-CSS** (`.prose table`),
  noch **nicht implementiert**; gilt analog für verstande (editorial-Variante).

→ fiknow-Diagramme sind **flach/technisch/präzise**, das Gegenteil des
verstande-Sketch-Stils.

## Icons

Dünne **Outline-Icons**, einheitliche Strichstärke, geometrisch (Rechner,
Ordner, Ordner+Lupe, Personengruppe). Varianten: weiß / lime / grau.

## Bildsprache (für AI-Bildgen / B-Pfad)

**Echte Fotografie**, NICHT Illustration/Sketch: „visionär, technisch,
menschlich, nahbar, authentisch". Storytelling vom großen Ganzen zum kleinen
Teil. **Grün als Highlight** stärkt die Einzigartigkeit (Signature-Motiv:
Segelboot mit lime-grünem Segel; Drohnen-/Tech-Aufnahmen mit grünen
Akzentlinien). → Der fiknow-`course-image`-Prompt zielt auf **Fotografie mit
grünem Highlight**, nicht auf den verstande-Sketchbook-Look.
