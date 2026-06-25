---
name: course-image
description: |
  Stellt den AI-Bildgenerierungs-Prompt zusammen, nimmt die generierte Datei
  entgegen und platziert sie in der Lesson-MDX oder als Cover-Bild.
  Nutze diesen Skill wenn ein Foto oder eine Illustration den Inhalt hebt —
  Konzept mit Atmosphäre, reale Szene, Objekt in Kontext, Titelbild/Cover.
  Nicht für Prozesse oder Ablauf-Logik (→ course-diagram).
arguments:
  - name: lesson
    description: Pfad zur Ziel-Lesson-MDX (optional — wird im Dialog geklärt)
    required: false
  - name: subject
    description: Was das Bild zeigen soll (optional — wird im Dialog geklärt)
    required: false
---

# Skill: course-image

Du bist der Bild-Broker: du stellst den fertigen Prompt zusammen, gibst ihn
aus, nimmst die vom Autor extern generierte Datei entgegen und platzierst sie
korrekt im Kurs. Es gibt keine direkte Bild-API in der Plattform — der Autor
generiert das Bild in seinem eigenen Tool (ChatGPT-Image, Midjourney, Imagen,
…).

## Ausführung

1. **Brand-Idiom bestimmen** — aus `platformBaseUrl` ableiten:
   - `verstande.ch` → **Sketchbook-Illustration** (handgezeichnet, Elfenbein-Palette)
   - `fiknow.ch` / `finnofleet` → **Fotografie** (editorial, fotorealistisch,
     genau EIN `#99FF33`-Grün-Akzent)
   - Wenn unklar oder nicht konfiguriert: kurz nachfragen.

2. **Motiv + Format klären** — mit dem Autor abstimmen:
   - Was soll das Bild zeigen? Welche Stimmung/Perspektive?
   - Seitenverhältnis (z. B. 16:9 für Inline-Figure, 1:1 oder 4:3 auch möglich).
   - Wenn `subject`-Argument gegeben: sofort damit arbeiten, nicht nochmal fragen.

   > **Kurs-Cover** wird über `cover: assets/images/<name>.<ext>` im
   > `course.mdx`-Frontmatter gesetzt. Das Bild wie jedes andere Asset in
   > `assets/images/` ablegen — der Import verknüpft es automatisch mit
   > `courses.coverImage` und es rendert auf Kurs-Kachel + Detailseite.
   > Dieser Skill platziert zusätzlich **Inline-Bilder** (`<Figure>`) innerhalb von Lessons.

3. **Phase 1 — Prompt ausgeben:**

   Den vollständigen, copy-paste-fertigen Prompt zusammensetzen:
   - **Basis-Block** (brand-spezifisch, verbatim aus `examples/IMAGE-STYLE.md`) —
     unverändert übernehmen, kein Wort weglassen oder ändern.
   - **Motiv-Beschreibung** als kurzen Anhang: `— [Motiv]. [Seitenverhältnis].`

   Den fertigen Prompt vollständig ausgeben (kein Kürzen). Klar kommunizieren:

   > „Kopiere diesen Prompt in dein Bild-Tool. Generiere gerne mehrere Varianten
   > und wähle die stimmigste aus — Bildgenerierung ist stochastisch. Wenn du
   > die gewählte Datei hast, liefere sie mir zurück."

   Dateinamen und geplante Platzierung (Lesson-Pfad, Stelle, Caption, Alt-Text)
   bereits vormerken und dem Autor mitteilen — damit er weiß, wofür er generiert.

4. **Phase 2 — Asset zurücknehmen:** Autor liefert die gewählte Datei (lokaler
   Pfad oder Upload-Referenz). Validieren:
   - Erlaubtes Format: PNG, JPG oder WebP (kein SVG für Raster-Fotos).
   - Datei vorhanden und lesbar.
   - Maße plausibel (nicht winzig; Cover-Bilder mindestens 1200 px breit empfohlen).

5. **Ablegen** — Datei nach `assets/images/<kurs-slug>-<name>.<ext>` kopieren.
   Dateiname plattformweit eindeutig halten: nur `a-z`, `0-9`, `-`, `.`;
   kein Leerzeichen, kein Sonderzeichen.

6. **Platzierungs-Dialog** — dem Autor vorschlagen (er editiert keinen Code):
   - An welcher Stelle der Lesson-MDX die Figure sitzt (z. B. „nach dem Absatz,
     der X erklärt" oder „vor den Key Takeaways").
   - Eine **Caption** (sichtbare Bildunterschrift, 1–2 Sätze).
   - Einen **Alt-Text** (a11y-Pflicht; beschreibt was zu sehen ist, nicht was
     es bedeutet — z. B. „Zwei Personen vor einem Monitor mit grüner Datenlinie"
     statt „Das Diagramm zeigt den Erfolg").
   - Bestätigung abwarten, bevor du schreibst.

7. **Einfügen** — an der bestätigten Stelle in die Lesson-MDX:

   ```mdx
   <Figure
     src="assets/images/<kurs-slug>-<name>.<ext>"
     alt="<alt-text>"
     caption="<caption>"
   />
   ```

8. **Hinweise an den Autor** — kurz erwähnen:
   - Raster-Bilder sind **nicht theme-adaptiv** — `<Figure>` rendert sie als
     `<img>`, kein `currentColor`-Thema (anders als SVG-Diagramme). Das Bild
     sieht in Light und Dark identisch aus.
   - Der Upload re-encodiert und härtet das Bild serverseitig (sharp,
     Metadaten-Strip) — das Quell-Format muss nicht pixelgenau optimiert sein.

## Hinweise

- Ein Bild pro Lesson ist in der Regel genug — mehr lenkt vom Text ab.
- Wenn der Sachverhalt Logik, Ablauf oder Relationen braucht → `course-diagram`.
- Wenn Mehrfach-Attribute verglichen werden → Markdown-Tabelle, kein Bild.
- Stil-Details und vollständige Basis-Prompt-Blöcke: `examples/IMAGE-STYLE.md`.
