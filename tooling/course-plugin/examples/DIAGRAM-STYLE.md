# Diagramm-Stil — Kurzreferenz für das Course-Plugin

Didaktische SVG-Diagramme werden **als Text authort** (kein externes Tool)
und über `<Figure src="assets/images/…svg" alt="…" caption="…" />` in die
Lesson-MDX eingebunden. `<Figure>` rendert lokale SVGs **inline**, damit
`currentColor` und die Theme-Variablen der Karte greifen.

Es gibt **zwei Brand-Idiome** — wähle nach Plattform-URL:

| Plattform | Idiom |
|---|---|
| verstande.ch | **Sketch** — handgezeichnet, feste Elfenbein-Karte |
| fiknow.ch / finnofleet | **Clean** — flach, theme-adaptiv (`currentColor`) |

---

## Idiom A — verstande Sketch

Cleane Geometrie + **Displacement-Filter** → handgezeichneter Wobble.

### Palette

| Rolle | Farbe |
|---|---|
| Papier (bg-Rect, fix) | `#F3EFE6` |
| Tinte (Outline/primär) | `#4E463F` |
| Akzent | Amber `#D9A441` |
| Sekundär/Neutral | Grau `#C8C2B2` |
| Schattierung | Terracotta `#B56E4D` |
| Label gedämpft | `#8A8275` / `#6B6358` |

### Regeln

- **Papier-Rect** `fill="#F3EFE6"` als erstes Child (feste Karte).
- **Linienwerk in `<g filter="url(#rough)">`** — der Filter gibt den Wobble.
- **Text AUSSERHALB der Filter-Gruppe** — sonst unleserlich.
- `stroke-width` 1.5–2.5, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- Füllungen: lavierende Wäsche (`fill-opacity` 0.2–0.5).
- Schattierung: **Cross-Hatching** (`stroke-dasharray`/parallele Linien, `opacity` ~0.38) — keine Schlagschatten.
- Fonts: `Newsreader, Georgia, serif` (Headlines); `'JetBrains Mono', ui-monospace, monospace` (Kicker/Einheiten, Uppercase, `letter-spacing` ~0.1em).

### Minimales Snippet

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"
     role="img" aria-labelledby="t1 d1"
     font-family="Newsreader, Georgia, serif">
  <title id="t1">Kurzer Titel</title>
  <desc id="d1">Längere Beschreibung für Screen-Reader.</desc>

  <defs>
    <filter id="rough" x="-6%" y="-6%" width="112%" height="112%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018"
                    numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3"
                         xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <!-- Offener Chevron-Pfeilkopf (Amber) -->
    <marker id="ah" markerUnits="userSpaceOnUse"
            markerWidth="18" markerHeight="18" refX="13" refY="8"
            orient="auto-start-reverse">
      <g fill="none" stroke="#D9A441" stroke-width="2.2" stroke-linecap="round">
        <line x1="3" y1="2.5" x2="13" y2="8"/>
        <line x1="3" y1="13.5" x2="13" y2="8"/>
      </g>
    </marker>
  </defs>

  <!-- Papier (fixes Elfenbein, KEIN currentColor) -->
  <rect width="800" height="400" fill="#F3EFE6"/>

  <!-- Linienwerk gefiltert -->
  <g filter="url(#rough)" fill="none" stroke="#4E463F"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="200" y="100" width="400" height="200" fill="#C8C2B2" fill-opacity="0.4"/>
    <!-- Pfeil: gerade + Kurve als EIN Pfad, EIN marker-end -->
    <path d="M50 200 L180 200 C 250 180, 300 150, 350 130"
          stroke="#D9A441" stroke-width="2.2" marker-end="url(#ah)"/>
  </g>

  <!-- Text AUSSERHALB Filter -->
  <g fill="#4E463F">
    <text x="400" y="370" text-anchor="middle" font-size="17">Label</text>
    <text x="400" y="388" text-anchor="middle" font-size="11"
          fill="#8A8275" font-family="'JetBrains Mono', ui-monospace, monospace"
          letter-spacing="0.08em">KICKER</text>
  </g>
</svg>
```

---

## Idiom B — fiknow Clean (theme-adaptiv)

Flach, geometrisch, **kein** Filter, **kein** Hintergrund-Rect.
Das Diagramm flippt automatisch mit Light/Dark — ein einziges Asset.

### Farbstrategie

| Rolle | Wert |
|---|---|
| Tinte / Linien | `currentColor` (erbt `--ink` der Karte) |
| Neutral-Füllung | `currentColor` + `fill-opacity` 0.06–0.16 |
| Label gedämpft | `currentColor` + `fill-opacity` ~0.55 |
| **Lime-Akzent (fix)** | `#99FF33` — nur als Fläche/Highlight, nie Linie/kleiner Text |
| **Text auf Lime (fix)** | `#22310F` — immer dunkel, sonst im Dark unlesbar |
| Sekundär/Kategorial | `#2D779B` / `#68B8DF` (Blau-Skala, fix) |

**Was NIE `currentColor` sein darf:** Lime (`#99FF33`) und Blau-Akzente —
diese sind bewusst auf hell *und* dunkel lesbar und bleiben fix.

### Regeln

- **Kein `<filter>`** — keine Displacement-Map, keine Effekte.
- **Kein Hintergrund-Rect** — SVG bleibt transparent, erbt den Karten-Ground.
- `stroke-width` ~1.7, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- Boxen über Füllungen (`fill-opacity`), **keine** dicken Konturen.
- Font: `Sora, system-ui, -apple-system, 'Segoe UI', sans-serif`.
- Flussdiagramm-Rollen laut Brandbook: Tätigkeit = `currentColor fill-opacity="0.06"` Box,
  Bedingung = Raute, Start/Ende = Lime-Kreis (`#99FF33`).

### Minimales Snippet

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 250"
     role="img" aria-labelledby="t1 d1"
     font-family="Sora, system-ui, -apple-system, 'Segoe UI', sans-serif">
  <title id="t1">Kurzer Titel</title>
  <desc id="d1">Längere Beschreibung für Screen-Reader.</desc>

  <defs>
    <!-- Offener Chevron — currentColor -->
    <marker id="ah-ink" markerUnits="userSpaceOnUse"
            markerWidth="16" markerHeight="16" refX="11" refY="7"
            orient="auto-start-reverse">
      <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
        <line x1="3" y1="2.5" x2="11" y2="7"/>
        <line x1="3" y1="11.5" x2="11" y2="7"/>
      </g>
    </marker>
  </defs>

  <!-- KEIN Hintergrund-Rect (transparent) -->

  <!-- Karten: currentColor-Füllung (adaptiv) -->
  <rect x="50"  y="70" width="180" height="110" rx="14"
        fill="currentColor" fill-opacity="0.06"/>
  <rect x="310" y="70" width="180" height="110" rx="14"
        fill="currentColor" fill-opacity="0.06"/>
  <!-- Abschluss: Lime-Fläche (fix) -->
  <rect x="570" y="70" width="180" height="110" rx="14" fill="#99FF33"/>

  <!-- Verbinder: offene Chevrons -->
  <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
    <!-- Pfeil: EIN Segment, EIN marker-end -->
    <line x1="232" y1="125" x2="305" y2="125" marker-end="url(#ah-ink)"/>
    <line x1="492" y1="125" x2="565" y2="125" marker-end="url(#ah-ink)"/>
  </g>

  <!-- Labels adaptiv -->
  <g fill="currentColor">
    <text x="140" y="105" text-anchor="middle" font-size="17" font-weight="600">Schritt 1</text>
    <text x="400" y="105" text-anchor="middle" font-size="17" font-weight="600">Schritt 2</text>
    <text x="100" y="142" font-size="12.5" fill-opacity="0.6">Beschreibung</text>
  </g>
  <!-- Text auf Lime: FIXE dunkle Farbe (kein currentColor!) -->
  <g fill="#22310F">
    <text x="660" y="105" text-anchor="middle" font-size="17" font-weight="600">Schritt 3</text>
    <text x="620" y="142" font-size="12.5" fill-opacity="0.78">Abschluss</text>
  </g>
</svg>
```

---

## Pfeilköpfe — Beide Idiome

**Immer offene Chevrons** aus zwei `<line>`:

```xml
<marker id="ah" markerUnits="userSpaceOnUse"
        markerWidth="16" markerHeight="16" refX="11" refY="7"
        orient="auto-start-reverse">
  <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
    <line x1="3" y1="2.5" x2="11" y2="7"/>
    <line x1="3" y1="11.5" x2="11" y2="7"/>
  </g>
</marker>
```

`markerUnits="userSpaceOnUse"` → Strichstärke des Kopfs bleibt konstant,
unabhängig von der Linienbreite. **KEINE gefüllten Dreiecke.**

---

## Pfeil-Fallen — Beide Idiome

Zwei häufige Fehler, die sofort billig wirken:

1. **Kein Pfeilkopf mitten in einer Stromlinie.** Wenn eine gerade Linie in
   eine Kurve übergeht, als **einen** Pfad `M…L…C…` zeichnen und nur
   **einen** `marker-end` am Ende setzen. Zwei Segmente mit je eigenem
   Pfeilkopf überlappen sich am Übergang.

   ```xml
   <!-- Richtig: EIN Pfad, EIN Pfeilkopf -->
   <path d="M50 200 L180 200 C 250 180, 350 130, 420 100"
         marker-end="url(#ah)"/>

   <!-- Falsch: zwei Segmente, zwei Pfeilköpfe überlappen -->
   <!-- <line … marker-end="url(#ah)"/> + <path … marker-end="url(#ah)"/> -->
   ```

2. **Pfeilkopf-Richtung = End-Tangente.** `orient="auto-start-reverse"` liest
   die Tangente am Pfad-Ende. Tangente = `Endpunkt − letzter Kontrollpunkt`.
   Bei Wirbeln den letzten Bezier-Kontrollpunkt so legen, dass die Tangente
   die Drehbewegung fortsetzt — sonst kippt der Kopf nach außen.

---

## Pflicht-Checkliste (beide Idiome)

- `viewBox` gesetzt, **keine** festen `width`/`height` im `<svg>`-Tag.
- `role="img"` + `<title id="…">` + `<desc id="…">` + `aria-labelledby="t1 d1"`.
- Dateiname plattformweit eindeutig: `<kurs-slug>-<name>.svg`.
- **KEIN** `<script>`, **KEIN** `<foreignObject>` (Sanitizer blockt beides).
- SVG-Filter (`<filter>`, `feTurbulence`, `feDisplacementMap`) sind erlaubt.
- `<Figure>` in der Lesson-MDX: `alt`-Attribut ist Pflicht (Accessibility).

---

## Referenzen

- Vollständige Hintergrund-Doku: `docs/diagram-style/SVG-DIAGRAM-STYLE.md` (Repo)
- Brand-Specs fiknow/FINNOFLEET: `docs/BRAND-FIKNOW.md` (Repo)
- Skill zum Authoring: `skills/course-diagram.md`
