# Brand-Konfiguration

Jede Instanz der edu-platform liest ihre Markenidentität aus einer einzigen
YAML-Datei: `brand/brand.yaml`. Im Hauptrepo liegt der Default (verstande).
Forks pflegen einen separaten kleinen Repo (z. B. `fiknow-brand`), der bei
Production-Deployments als `/app/brand` über den Default gemountet wird.

## Schema

```yaml
identity:
  name: verstande.ch        # Vollständiger Markenname (Punkt → ".ch" wird ausgegraut)
  tagline: …                 # Kurzer Slogan (kann leer sein → wird nicht gerendert)
  description: …             # Lange Beschreibung (Hero-Headline + SEO)
  domain: verstande.ch       # Footer/Metadata
  markLetter: v              # Buchstabe im Marker-Tile (wird genutzt, wenn kein Logo-Asset)

design:
  fontSet: editorial         # "editorial" (Newsreader+Manrope) oder "sora" (Sora)
  accent: 0.78 0.14 70       # OKLCH-Triplet (L C H), ohne `oklch(...)`-Wrapping
  accentInk: 0.20 0.02 70    # Vordergrund auf Akzent (Buttons, Marker)

hero:
  intro: |                   # Subtitle-Absatz unter der Hauptüberschrift
    Mehrzeiliger Text mit
    YAML-Block-Syntax.
```

## Wo was angezeigt wird

- **`identity.name`** — Wortmarke in TopNav, Auth-Page, Lesson-Player. Bei Punkt im Namen wird der Trailing-Teil dezent ausgegraut.
- **`identity.tagline`** — Manifest-Block im Auth-Layout, Footer der Lesson-Page, Footer der Landing-Page. Wenn leer: nicht gerendert.
- **`identity.description`** — Hauptüberschrift der Landing-Hero, plus `<meta description>` für SEO.
- **`identity.markLetter`** — Buchstabe im farbigen Marker-Tile (z. B. „v" oder „F"). Wenn ein `assets/logo.svg` vorhanden ist, wird dieses später stattdessen genutzt (TODO).
- **`design.fontSet`** — wechselt zwischen `editorial` (Serif-Display + Sans) und `sora` (eine Schrift für alles).
- **`design.accent` / `accentInk`** — werden zur Laufzeit als CSS-Variablen `--accent` und `--accent-ink` gesetzt.
- **`hero.intro`** — Absatz unter dem Landing-Headline. Wenn leer: nicht gerendert.

Die „Wo du anfangen kannst"-Kacheln auf der Landing sind **nicht im Brand-Config** — sie werden zur Laufzeit zufällig (max. 3) aus dem Kurs-Katalog (Payload) gezogen. Brand-Owner pflegen Kurse direkt im CMS; Highlights brauchen keine YAML-Konfig.

## Override per env

- `BRAND_CONFIG_PATH` — Pfad zur YAML-Datei. Default: `./brand/brand.yaml` relativ zum Working Directory (= `/app/brand/brand.yaml` im Container).

Sonst gibt es keine Brand-spezifischen env-Vars mehr — alles im YAML.

## Lokale Entwicklung

`brand/brand.yaml` im Hauptrepo enthält verstande als Default. `npm run dev`
liest direkt aus diesem Pfad. Änderungen testen: YAML editieren, Dev-Server
neu starten (env wird beim Modul-Load gelesen).

## Production-Deployment

Pro Brand wird ein eigenes Docker-Image gebaut, das das edu-platform-
Image als Base nutzt und nur den /app/brand-Ordner mit den brand-
spezifischen Werten überschreibt. Der Brand-Repo enthält dafür ein
winziges Dockerfile und einen GitHub-Actions-Workflow.

In Jelastic wird dann pro Env das jeweilige Brand-Image gepullt:
- verstande-Env → `ghcr.io/<owner>/edu-platform:latest`
- FiKnow-Env → `ghcr.io/<owner>/fiknow:latest`

## Brand-Repo aufsetzen

Ein neues Brand-Repo besteht aus drei Dateien:

**`brand.yaml`** — die Brand-Werte (Schema oben).

**`Dockerfile`**:
```dockerfile
FROM ghcr.io/<owner>/edu-platform:latest
COPY --chown=nextjs:nodejs brand.yaml /app/brand/brand.yaml
# Optional: COPY --chown=nextjs:nodejs assets/ /app/brand/assets/
```

**`.github/workflows/build.yml`** — Vorlage aus dem fiknow-brand-Repo
übernehmen. Pusht das Image nach `ghcr.io/<owner>/<brand>:latest`.

Damit der Workflow das edu-platform-Base-Image pullen kann, muss im
GHCR-Package des Base-Images einmalig „Manage Actions access" für das
Brand-Repo gesetzt werden:

1. https://github.com/users/<owner>/packages/container/edu-platform/settings
2. „Manage Actions access" → „Add Repository" → das Brand-Repo wählen
3. Role: `Read`

Damit reicht das Standard-`GITHUB_TOKEN` im Brand-Workflow, kein PAT
als Secret nötig.

## Lokales Testen einer anderen Brand

Brand-Repo lokal klonen und `BRAND_CONFIG_PATH` setzen:

```bash
git clone <brand-repo> /tmp/fiknow-brand
BRAND_CONFIG_PATH=/tmp/fiknow-brand/brand.yaml npm run dev
```
