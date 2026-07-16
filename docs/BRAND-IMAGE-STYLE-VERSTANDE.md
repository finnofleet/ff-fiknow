# Bild-Stil — verstande.ch

Basis-Prompt für AI-Bildgenerierung (ChatGPT-Image, Midjourney, Imagen,
etc.). Stellt sicher, dass alle Illustrationen für verstande.ch im
gleichen editorialen Stil entstehen — auch wenn sie über Wochen und
verschiedene Sessions hinweg generiert werden.

## Wann nutzen

- Cover-Bilder für Kurse (`Course.coverImage` in Payload)
- Inline-Abbildungen via `<Figure src="..." />` in Lessons
- Hero-/Tiles-Grafiken auf der Landing-Page
- Marketing-Material rund um verstande.ch

Für **FiKnow** gibt es einen separaten Basis-Prompt (Sora/FINNOFLEET-Grün,
geometrischer, weniger handgezeichnet) — bei Bedarf analoges Dokument
unter `BRAND-IMAGE-STYLE-FIKNOW.md`.

## Workflow

1. Diesen Block in ChatGPT (oder anderes AI-Bild-Tool) als Style-Anker
   kopieren — vorzugsweise als „Custom Instructions" oder am Anfang
   einer Session.
2. Pro Bild eine **kurze Motiv-Beschreibung** dranhängen, z. B.
   „A small drone hovering over an alpine valley, viewed from the side."
3. Das fertige Bild als `.svg` oder `.png` ins Bundle unter `assets/images/`
   legen (siehe `docs/AUTHORING_BUNDLE.md`, Abschnitt „Asset-Handling").

## Stil-Konsistenz

Hex-Codes im Prompt entsprechen verstande.ch's gedämpfter Editorial-
Palette und sollen **nicht** verändert werden. Wenn ein Bild zu farbig
oder zu glatt wirkt: bei der nächsten Generierung den Prompt-Block
unverändert wiederverwenden und nur das Motiv präzisieren.

---

## Der Prompt


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
