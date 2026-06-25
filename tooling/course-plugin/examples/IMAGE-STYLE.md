# Bild-Stil — Kurzreferenz für das Course-Plugin

Raster-Bilder (PNG/JPG/WebP) werden über `<Figure src="assets/images/…" alt="…" caption="…" />`
in die Lesson-MDX eingebunden. Der Upload re-encodiert sie serverseitig (sharp,
Metadaten-Strip) — das Ausgabe-Asset ist immer sauber, unabhängig vom
Quell-Format.

**Es gibt keine Bild-Generierungs-API in der Plattform.** Der Skill gibt den
fertigen Prompt aus; der Autor generiert das Bild in seinem eigenen Bild-Tool
(ChatGPT-Image, Midjourney, Imagen, …) und liefert die Datei zurück. Eine
direkte API-Anbindung könnte später ergänzt werden, ist aber heute out-of-loop.

---

## Wann ein Bild (statt Diagramm oder Tabelle) passt

| Visuelle Hilfe | Wann |
|---|---|
| **Bild** (Raster) | Konzept mit atmosphärischer Stimmung, reale Szene, Objekt in Kontext, Cover-/Titelgrafik |
| **Diagramm** (`course-diagram`-Skill) | Prozess, Ablauf, Beziehung, Hierarchie, Schema |
| **Markdown-Tabelle** | Vergleich mit Mehrfach-Attributen, strukturierte Daten, Feature-Matrix |

Faustregel: Braucht das Visual Emotion, Atmosphäre oder eine konkrete Szene →
Bild. Braucht es Logik, Schritt-für-Schritt oder Relationen → Diagramm.

---

## Zwei Brand-Idiome

| Plattform | Idiom |
|---|---|
| verstande.ch | **Sketchbook-Illustration** — handgezeichnet, warme Elfenbein-Palette |
| fiknow.ch / finnofleet | **Fotografie** — editorial, fotorealistisch, EIN Grün-Akzent |

Wähle das Idiom nach `platformBaseUrl`. Mische die Stile **nicht** innerhalb
eines Kurses.

---

## Idiom A — verstande Sketchbook-Illustration

Handgezeichnete Illustrations-Ästhetik, minimalistisch, europäisch-editorial.
Warme Elfenbein-Palette, Tusche-Linien, zurückhaltende Aquarell-Wäschen.

### Basis-Prompt (verbatim)

```
Hand-drawn editorial illustration in a refined sketchbook style,
resembling a carefully inked concept drawing from a premium design
notebook. Minimalist architectural and infographic aesthetic inspired by
modern European editorial magazines, Monocle-style infographics, and
intelligent newspaper illustration.

Maintain identical illustration style, paper texture, ink behaviour,
colour treatment, line quality and compositional language across all
generated images, as if created by the same illustrator in the same
sketchbook series.

Thin expressive ink lines with subtle line-weight variation, slightly
imperfect hand-drawn geometry, natural sketch wobble, soft pencil
construction marks and light cross-hatching. Preserve subtle human
imperfections in the drawing. Calm, intelligent, human-made appearance.

Warm neutral paper background with subtle natural paper grain texture,
slightly off-white / ivory (#F3EFE6). Soft organic paper feel, no pure
white background.

Limited muted colour palette only:
- warm amber / ochre accent colour: #D9A441
- warm light grey for people, buildings and secondary elements: #C8C2B2
- dark brown-grey ink outlines: #4E463F
- optional muted terracotta sketch shading: #B56E4D

Restrained use of colour. Objects outlined with precise ink contours
and selectively filled with soft translucent marker-style colour
washes. Minimal shading only. No heavy shadows.

Flat 2D illustration with only slight perspective hints. Clean negative
space. Delicate horizon lines and minimal environmental detail. Sparse
visual language. Consistent proportions across repeated object types.

Subtle notebook aesthetic:
faint pencil guidelines, tiny ink imperfections, light paper absorption
texture, soft analogue drawing feel.

Composition should feel balanced, quiet, elegant and editorial.
Prioritise clarity and visual simplicity over decoration.

Avoid:
photorealism, cinematic lighting, glossy rendering, airbrush effects,
vibrant saturated colours, heavy gradients, 3D rendering, ultra-detailed
textures, digital painting aesthetics, UI design elements, futuristic
sci-fi styling, thick outlines, comic-book style, vector-clean
perfection.

No typography, labels, numbers or interface elements unless explicitly
requested.
```

**Motiv anhängen** (Beispiel): „— A small drone hovering over an alpine valley,
viewed from the side. 16:9."

---

## Idiom B — fiknow Fotografie

Authentische Editorial-Fotografie für eine FinTech-Marke. **Keine
Illustration, kein 3D/CGI** — echter fotorealistischer Look. Genau
**EIN** `#99FF33`-Grün-Akzent pro Bild, fotorealistisch als Teil der Szene
integriert (echtes Licht/Material — z. B. ein Dashboard-Screen mit grüner
Datenlinie, ein grünes Segel, eine Reflexion). Nie flach/aufgeklebt.

### Basis-Prompt (verbatim)

```
Authentic editorial photography for a FinTech brand (FINNOFLEET), in the style
of premium financial and technology magazines and modern corporate
storytelling. Real, photorealistic imagery — never illustration, sketch, 3D
render, CGI or clip-art.

Consistent look across all images, as if shot by one photographer for a single
campaign: soft natural daylight, clean composition, generous negative space, a
calm and confident mood. Subjects: people at work (diverse, genuine, focused —
not posed stock smiles), technology and software, financial and maritime
"navigation" metaphors, aerial and architectural perspectives moving from the
big picture to the detail.

Cool, natural colour palette — deep blues, teals, slate greys, daylight. Every
image carries exactly ONE FINNOFLEET-green (#99FF33 lime) accent as the brand
signature — but it must be PHOTOREALISTICALLY INTEGRATED as a believable part of
the scene, rendered in real light and material: a green sail, a real green light
or its reflection, green signage, or a laptop/monitor screen showing a
believable software dashboard whose data line is FINNOFLEET green. Never a flat,
floating, pasted or sticker-like green shape, never a crudely drawn line. Exactly
one green element, never an overall tint or filter.

Crisp focus on the subject with gentle depth of field, realistic skin tones and
materials. Professional, trustworthy, human, forward-looking — "Navigating
Financial Horizons".

Avoid: illustration, hand-drawn or sketch styles, 3D/CGI, heavy HDR,
oversaturation, cheesy or staged stock-photo clichés, lens flares, vintage
filters, busy backgrounds, any text or UI overlays, more than one green element.
```

**Motiv anhängen** (Beispiel): „— A sailboat seen from above cutting through
deep-blue water, its single sail in FINNOFLEET green. 16:9."

---

## Motiv-Anhang-Konvention

Der Basis-Block bleibt immer unverändert. Pro Bild wird am Ende eine kurze
**Motiv-Beschreibung** angehängt — typisch 1–2 Sätze plus Seitenverhältnis:

```
[Basis-Block unverändert]

— [Was zu sehen ist, ggf. Kamera-Perspektive]. [Seitenverhältnis, z. B. 16:9 oder 4:3 oder 1:1].
```

---

## Hinweise für Ablage und Upload

- **Stochastisch:** Bildgenerierung liefert jedes Mal andere Ergebnisse.
  Mehrere Varianten generieren, die passendste auswählen.
- **Dateiformate:** PNG, JPG oder WebP — kein SVG für Raster-Fotos/-Illustrationen.
- **Ablage:** `assets/images/<kurs-slug>-<name>.<ext>` (plattformweit eindeutiger
  Dateiname; kein Leerzeichen, kein Sonderzeichen, nur `a-z`, `0-9`, `-`, `.`).
- **Referenz in MDX:**
  ```mdx
  <Figure src="assets/images/<kurs-slug>-<name>.<ext>" alt="…" caption="…" />
  ```
- **Alt-Text ist Pflicht** (Accessibility).
- **Upload re-encodiert** das Bild serverseitig (sharp, Metadaten-Strip) —
  das Ausgabe-Asset ist immer optimiert, unabhängig vom Quell-Format.
- **Kurs-Cover** wird über `cover: assets/images/<name>.<ext>` im
  `course.mdx`-Frontmatter gesetzt. Das Bild in `assets/images/` ablegen —
  der Import verknüpft es automatisch (rendert auf Kachel + Detailseite).
  Für Inline-Bilder innerhalb von Lessons: `<Figure src="assets/images/…" … />`.
- **Raster ist nicht theme-adaptiv** — `<Figure>` rendert es als `<img>`,
  kein `currentColor`-Thema (anders als SVG-Diagramme). Das Bild sieht in
  Light und Dark identisch aus; plane die Palette entsprechend.

---

## Referenzen

- Vollständige Brand-Doku verstande: `docs/BRAND-IMAGE-STYLE-VERSTANDE.md` (Repo)
- Vollständige Brand-Doku fiknow: `docs/BRAND-IMAGE-STYLE-FIKNOW.md` (Repo)
- Brand-Specs fiknow/FINNOFLEET: `docs/BRAND-FIKNOW.md` (Repo)
- Skill zum Authoring: `skills/course-image.md`
- Diagramm-Äquivalent: `skills/course-diagram.md` / `examples/DIAGRAM-STYLE.md`
