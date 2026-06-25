# Bild-Stil — FiKnow

Basis-Prompt für AI-Bildgenerierung im FiKnow-Look (FINNOFLEET-Variante
der edu-platform).

> Quelle: FINNOFLEET-Brandbook (`brand-refs/FINNOFLEET-brandbook-2026-02-10.pdf`,
> 02.5 Bildsprache) + [`BRAND-FIKNOW.md`](./BRAND-FIKNOW.md). Aufbau/Workflow
> wie beim verstande-Pendant
> ([`BRAND-IMAGE-STYLE-VERSTANDE.md`](./BRAND-IMAGE-STYLE-VERSTANDE.md)) — aber
> fiknow ist **Fotografie**, nicht Illustration.

## Wann nutzen

- Cover-Bilder für FiKnow-Onboarding-Module (`Course.coverImage` in Payload)
- Inline-Abbildungen via `<Figure src="..." />` in Lessons
- Hero-/Tiles-Grafiken auf der FiKnow-Landing-Page
- FINNOFLEET-internes Schulungs-/Marketing-Material

## Workflow

Identisch zum verstande-Workflow (siehe Geschwister-Doc) — nur den
Prompt-Block unten als Style-Anker in das jeweilige AI-Bild-Tool kopieren.

## Stil-Richtung

Maßgeblich ist das Brandbook (02.5 Bildsprache) — und das ist **echte
Fotografie**, NICHT Illustration (der zentrale Unterschied zu verstande):

- **Authentische, fotorealistische Editorial-Fotografie** — visionär,
  technisch, menschlich, nahbar, authentisch. Kein Sketch, kein 3D/CGI, keine
  Stock-Klischees.
- **Genau EIN FINNOFLEET-Grün-Akzent (`#99FF33`) pro Bild** als Signature — aber
  **fotorealistisch integriert** (echtes Licht/Material): grünes Segel, echtes
  grünes Licht/Reflexion/Signage, oder ein **glaubwürdiges Software-Dashboard
  mit grüner Datenlinie** auf einem Screen. **Nie** flach/aufgeklebt/Sticker-haft,
  nie eine gemalte Linie, nie Deko-Pflanze. Nie Gesamt-Tint, nie mehrere.
- **Kühle natürliche Palette:** Tiefblau/Teal/Slate (Sekundärfarben
  `#0A3E57`/`#2D779B`/`#68B8DF`), Tageslicht.
- Storytelling **vom großen Ganzen zum Detail**; saubere Komposition,
  großzügige Negativräume.
- Motive: Menschen bei der Arbeit (divers, echt, fokussiert), Technologie/
  Software, Finanz-/maritime „Navigation"-Metaphern, Luft-/Architektur-Perspektiven.

---

## Der Prompt

Englisch (Bild-Tools liefern damit konsistenter). Der **Basis-Block** ist der
Stil-Anker; pro Bild hängt der Autor/das Plugin nur eine kurze
**Motiv-Beschreibung** an — Basis-Block unverändert lassen.

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
deep-blue water, its single sail in FINNOFLEET green. 16:9." Nur Motiv + ggf.
Format/Seitenverhältnis.
