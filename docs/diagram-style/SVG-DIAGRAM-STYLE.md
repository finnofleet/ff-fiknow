# SVG-Diagramm-Stil (Sketch) — v0 (in Iteration)

Konvention für **didaktische Diagramme** als SVG, passend zum
skizzenhaften Brand-Look (siehe `BRAND-IMAGE-STYLE-VERSTANDE.md`). Diese
SVGs werden vom Modell **als Text** authort (kein externes Tool) und über
`<Figure src="assets/images/…svg" …/>` eingebunden.

> Status v0: Technik + Palette stehen zur Diskussion. Beispiele unter
> `examples/` rendern — iterativ schärfen.

> **Zwei Marken, zwei Idiome.** Dieser Sketch-Stil gilt für **verstande**.
> **fiknow** hat eine **eigene, cleane** Diagramm-Sprache nach FINNOFLEET-
> Brandbook — siehe Abschnitt „fiknow — Clean-Variante" unten und
> `docs/BRAND-FIKNOW.md`. Beim Authoring den zur Brand passenden Stil wählen.

## Die Sketch-Technik (Sanitizer-sicher)

Cleane Geometrie schreiben, einen **Displacement-Filter** drüberlegen — das
gibt allen Linien/Formen den handgezeichneten Wobble, ohne dass man krumme
Pfade von Hand setzen muss. DOMPurify am Upload erlaubt `svgFilters`, der
Filter bleibt also erhalten.

```xml
<filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
  <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="7" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="3"
                     xChannelSelector="R" yChannelSelector="G"/>
</filter>
```

- `scale` 2–4 = dezenter bis kräftiger Wobble. Diagramm-Default ~3.
- **Linienwerk in eine `<g filter="url(#rough)">`-Gruppe.**
- **Text NICHT filtern** — Labels gehören in eine separate, ungefilterte
  Gruppe, sonst werden sie unleserlich.
- `seed` fix lassen → deterministisch (kein Zufall im Build).

## Strich & Füllung

- Strich: `stroke-width` 1.5–2.5, `stroke-linecap="round"`,
  `stroke-linejoin="round"`. Leichte Breitenvariation zwischen Elementen.
- Füllungen: **lavierende Wäsche** (`fill-opacity` 0.2–0.5), nie deckend.
- Schattierung: dünnes **Cross-Hatching** (parallele Linien, `opacity` ~0.4)
  statt Schlagschatten/Verläufe.
- Konstruktionsmarken optional: feine `stroke-dasharray`-Hilfslinien, low
  opacity — verstärkt den Notizbuch-Charakter.
- **Pfeilköpfe: offene Chevrons, nicht gefüllte Dreiecke.** Zwei kurze
  Striche (`<line>`) mit `stroke-linecap="round"`, gleiche Farbe wie die
  Linie — wirkt von Hand angedeutet. `markerUnits="userSpaceOnUse"`, damit
  die Strichstärke unabhängig von der Linienbreite konstant bleibt. Der
  Displacement-Filter gibt auch den Köpfen den Wobble.

## Palette (verstande / Sketch)

| Rolle | verstande |
|---|---|
| Papier (bg) | `#F3EFE6` |
| Tinte (Outline/primär) | `#4E463F` |
| Akzent | Amber `#D9A441` |
| Sekundär (neutral) | Grau `#C8C2B2` |
| Schattierung | Terracotta `#B56E4D` |
| Label gedämpft | `#8A8275` / `#6B6358` |

(fiknow-Palette: siehe „fiknow — Clean-Variante" unten + `docs/BRAND-FIKNOW.md`.)

## Text / Labels

- Headline-Labels: `Newsreader, Georgia, serif` (Brand-Display).
- Kicker/Einheiten: `'JetBrains Mono', ui-monospace, monospace`, klein,
  `letter-spacing` ~0.1em, gedämpfte Farbe.
- **Wichtig:** Im `<img>`-Kontext lädt das SVG keine Web-Fonts → immer
  robuste Fallbacks (`Georgia`, `monospace`) angeben.
- Entscheidung offen: cleane Editorial-Labels (mein Vorschlag, gute
  Lesbarkeit) vs. handschriftlicher Font fürs volle Sketch-Gefühl.

## Pfeil-Fallen (aus Review gelernt)

Zwei wiederkehrende Fehler, die den Eindruck sofort billig wirken lassen:

1. **Kein Pfeilkopf mitten in einer Stromlinie.** Wenn eine gerade Linie in
   eine Kurve übergeht (z. B. Strömung, die übers Dach zieht), als **eine**
   Pfad-`d` mit `L…C…` zeichnen und nur **einen** `marker-end` am Ende setzen.
   Zwei Segmente mit je eigenem Pfeilkopf überlappen sich am Übergang.
2. **Pfeilkopf-Richtung = End-Tangente.** Der Marker orientiert sich an der
   Tangente am Pfad-Ende (`orient="auto"`). Bei Wirbeln/Kurven den **letzten
   Kontrollpunkt** so legen, dass die Tangente die Drehbewegung *fortsetzt* —
   sonst „kippt" der Kopf nach außen statt einzurollen. Tangente = `Endpunkt −
   letzter Kontrollpunkt`; diese Richtung muss der gewünschten Flussrichtung
   entsprechen.

## Pflicht-Struktur

- `viewBox` setzen, **keine** festen `width/height` im SVG (responsive via
  `<Figure>`).
- `role="img"` + `<title>` + `<desc>` mit `aria-labelledby` → Accessibility
  (der `alt`/`caption` im `<Figure>` kommt zusätzlich).
- Dateiname plattformweit eindeutig: `<kurs-slug>-<name>.svg`.

---

## fiknow — Clean-Variante (FINNOFLEET)

Quelle: `docs/BRAND-FIKNOW.md` + Brandbook-PDF. fiknow ist **clean &
weich**, *nicht* skizzenhaft — aber auch **nicht hart-geometrisch**.
Beispiele: `examples/luv-lee-clean-fiknow.svg`, `examples/ablauf-clean-fiknow.svg`.

- **Kein** Displacement-Filter (kein Wobble), gerade/saubere Geometrie.
- **Weich & dezent:** dünne Striche (~1.7), `stroke-linecap="round"`,
  gedämpfte Farben. **Keine dicken schwarzen Rahmen** — Boxen über
  **Füllungen**, nicht über Konturen.
- **Pfeilköpfe: offene Chevrons** (zwei `<line>`, runde Enden) — wie beim
  Sketch, nur ohne Wobble. **Keine** gefüllten Dreiecke.
- **THEME-ADAPTIV (wichtig):** **kein** Hintergrund-Rect (transparent), Tinte
  & Linien = **`currentColor`**, Neutral-Füllungen = `currentColor` mit
  `fill-opacity` (~0.06–0.16), gedämpfte Labels = `currentColor` mit
  `fill-opacity` ~0.55. So flippt das Diagramm mit Light/Dark — **ein** Asset.
  `<Figure>` rendert lokale SVGs dafür **inline** (nicht `<img>`), damit
  `currentColor` die `--ink`-Variable der Karte erbt.
- **Feste Akzente** (lesen auf hell *und* dunkel, NICHT currentColor): Lime
  **`#99FF33`** nur als **Fläche/Highlight** (nie Linie/kleiner Text);
  kategoriale/sekundäre Flüsse aus der **Blau-Skala** (`#2D779B`, `#68B8DF`).
  **Text auf Lime-Fläche = fix dunkel** (`#22310F`), sonst im Dark unlesbar.
- **Schrift:** `Sora, system-ui, …` (Brand-Font).
- **Effekt-Grafiken** (Glow/Gradient, Kompass-artig) lassen sich nicht
  mechanisch flippen → zwei Assets liefern, `<Figure srcDark="…">` swappt
  per `[data-theme]`.
- Flussdiagramm-Legende laut Brandbook: Tätigkeit = hellgraue Box, Bedingung
  = Raute, Start/Ende = **Lime-Kreis**, Schleife = grau.

Die „Pfeil-Fallen" (Mid-Linie-Pfeil, End-Tangente) gelten **genauso**.
