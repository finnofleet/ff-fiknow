# Logo-Guidelines — verstande.ch & FiKnow

Anleitung für die AI-gestützte Logo-Generierung der zwei Brands. Dies ist
**kein** Cover-Bild-Leitfaden — für Editorial-Illustrationen siehe
`BRAND-IMAGE-STYLE-VERSTANDE.md`. Logos stellen andere Anforderungen:
Skalierbarkeit, Themenstabilität, extremale Klarheit.

---

## 1. Technische und stilistische Anforderungen

**Format**
Bevorzuge SVG. PNG ist akzeptabel, muss aber nach der Generierung vektorisiert
werden (→ Workflow unten). SVG lässt sich direkt in den Build einbetten, ist
byte-klein und CSS-stylbar.

**Grösse**
Das Logo muss bei **24 × 24 px** (TopNav) noch lesbar sein und bis ~64 × 64 px
scharf skalieren. Quadratisches Seitenverhältnis, kein Letterboxing.

**Farben**
Einfarbig oder maximal zweifarbig. Verwende idealerweise `currentColor` als
Fill im finalen SVG — so greift die Brand-Akzentfarbe automatisch, ohne
hardgecodete Hex-Werte. Das Logo muss in beiden Themes (Dark + Light) bestehen.

**Klarheit**
Simpel. Keine feinen Details, keine dünnen Linien unter 2 px, keine Schrift.
Bei Thumbnail-Grösse muss die Form sofort erkennbar bleiben.

**Hintergrund**
Transparent. Der quadratische Mark-Container im UI liefert den farbigen
Background.

---

## 2. Workflow Schritt für Schritt

1. **Generieren** — ChatGPT-Image (DALL-E) oder Midjourney mit einem der Prompts
   unten. Mehrere Varianten exportieren, beste auswählen.
2. **Vektorisieren** — PNG → SVG via [vectorizer.io](https://vectorizer.io),
   [vectormagic.com](https://vectormagic.com) oder Inkscape „Trace Bitmap".
3. **Bereinigen** — SVG durch [SVGOMG](https://jakearchibald.github.io/svgomg/)
   laufen lassen: Metadaten entfernen, unnötige Layer zusammenführen,
   `viewBox` auf `0 0 24 24` (oder 32/64) setzen.
4. **Ablegen** — Datei nach `brand/assets/logo.svg` in die edu-platform
   (Default-Brand) oder ins jeweilige Brand-Repo.
5. **Brand-Overlay** — Bei fiknow-brand: `assets/logo.svg` im Brand-Repo
   (überschreibt per Image-Overlay den Default).
6. **Lokal testen** — Prüfe Zentrierung, Theme-Kompatibilität (Dark + Light)
   und Lesbarkeit bei 24 × 24 px im Browser-DevTool.

---

## 3. ChatGPT-Image-Prompts

### verstande.ch

Tonalität: editorial, ruhig, sketchbook-nah. Symbolisiert Verstehen, Lesen,
Schärfe — ohne Digitalkitsch.

```
Create a minimal vector-style logo mark for verstande.ch, a Swiss
e-learning platform focused on understanding and mastery. Single icon
or symbol only — no text, no letters, no typography. Choose one
concept: a stylised eye, a magnifying glass, an open notebook, or
simple reading glasses — something that quietly evokes comprehension
and insight.

Flat, graphic, monochrome. Black icon on a plain white or transparent
background. Geometric-meets-hand-drawn aesthetic: clean closed shapes
with very slight organic softness, as if drawn with a felt-tip pen and
then traced. Think Swiss editorial illustration meets minimal icon
design.

The icon must read clearly at 24 × 24 px. No gradients, no shadows,
no inner details smaller than 10 % of the total mark area. Closed
filled shapes or bold outlines only. Single weight, consistent stroke.

Output: centred on a square canvas, transparent background, black
monochrome, suitable for immediate vectorisation.

Avoid: photorealism, 3D rendering, perspective depth, colour, texture,
typography, decorative flourishes, complex linework, thin serifs.
```

### FiKnow

Tonalität: geometrisch, technisch-modern, leicht korporativ. Orientiert sich
an FINNOFLEET-Grün und einem modularen, verbundenen Charakter.

```
Create a minimal geometric vector logo mark for FiKnow, a B2B
e-learning product for the financial sector. Single abstract symbol —
no text, no letters. Choose one concept: an abstracted letter F as a
pure geometric shape, a connector node with two or three linked
circles, or a modular grid of squares suggesting structured knowledge.

Strictly geometric: straight lines, circles, squares, precise angles.
No organic curves, no handmade feel. Think Bauhaus grid meets fintech
icon. Monochrome black on transparent background, flat 2D, zero
gradients.

The mark must be instantly recognisable at 24 × 24 px. Bold, closed
shapes. Minimum detail. Consistent stroke weight or solid fills only.
Symmetric or deliberately balanced asymmetry.

Output: centred on a square canvas, transparent background, black
monochrome, ready for SVG vectorisation.

Avoid: photorealism, organic curves, typography, gradients, drop
shadows, colour, decorative elements, complexity, thin hairlines,
rounded humanist aesthetics.
```

---

## 4. Ohne Logo bleiben — ein valider Default

Wenn kein Logo-Asset vorhanden ist, zeigt das UI automatisch den Buchstaben
aus `brand.markLetter` (z. B. „V" für verstande, „F" für FiKnow). Das ist
kein Fehler — ein Buchstaben-Mark funktioniert, ist nur weniger distinkt.
Eine Brand ohne `brand/assets/logo.svg` läuft ohne Anpassung weiter.
