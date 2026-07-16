/**
 * Autoren-Wissen für den MCP-Server (ADR 0004, Phase 2).
 *
 * Macht das Bundle-/Stil-/Komponenten-Wissen, das sonst nur in den
 * course-authoring-Plugin-Skills steckt, plugin-UNABHÄNGIG verfügbar — als
 * MCP-Resources, einen Prompt und das `get_authoring_guide`-Tool. Clients wie
 * Claude Desktop/Cowork laden keine Claude-Code-Skills; ohne dieses Modul
 * hätten sie die Operationen („Hände"), aber nicht das Rezept.
 *
 * Inhalte werden KANALISIERT, nicht neu erfunden: sie kommen aus den bereits
 * vorhandenen Docs (`docs/AUTHORING_BUNDLE.md`, `docs/CONTENT_STYLE.md`,
 * `docs/BRAND-IMAGE-STYLE-*.md`, `docs/diagram-style/*`) und der Komponenten-
 * Whitelist. Damit die Files im Standalone-Build vorhanden sind, sind sie in
 * `next.config.ts` via `outputFileTracingIncludes` der MCP-Route zugeordnet.
 *
 * BRAND-AWARE: Bildstil/Diagramm-Idiom/Stimme unterscheiden sich je Marke
 * (FiKnow Clean vs verstande Sketch). Diese Topics werden ZUERST aus einem
 * optionalen Brand-Overlay (`<BRAND_CONFIG_PATH-dir>/authoring/<topic>.md`)
 * gelesen — exakt das `loadBrandLogo()`-Muster — und fallen sonst auf den
 * passenden In-Repo-Default zurück (Bildstil per `brand.fontSet`). So kann ein
 * Brand-Overlay (z. B. fiknow-brand) seine eigene Stimme mitbringen, ohne dass
 * App-Code anders ist; fehlt sie, greift ein sauberer Default.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { brand } from "@/lib/brand";
import { ALLOWED_MDX_COMPONENTS } from "@/lib/mdx/allowed-components";

// ============================================================
// Pfade
// ============================================================

const ROOT = process.cwd();
const DOCS = path.join(ROOT, "docs");
const EXAMPLE_DIR = path.join(
  ROOT,
  "tooling",
  "course-plugin",
  "examples",
  "minimal-course",
);

/** Verzeichnis des Brand-Overlays (wie lib/brand.ts auflöst). */
function brandOverlayDir(): string {
  const configPath =
    process.env.BRAND_CONFIG_PATH ?? path.join(ROOT, "brand", "brand.yaml");
  return path.dirname(configPath);
}

/** „FIKNOW" | „VERSTANDE" — Marken-Diskriminator (Sora = FiKnow). */
function brandKey(): "FIKNOW" | "VERSTANDE" {
  return brand.fontSet === "sora" ? "FIKNOW" : "VERSTANDE";
}

// ============================================================
// Datei-Helfer (robust + gecached)
// ============================================================

function readFileSafe(absPath: string): string | null {
  try {
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

/** Liest ein optionales Brand-Overlay-Doc (`authoring/<name>.md`). */
function readBrandOverlay(name: string): string | null {
  return readFileSafe(path.join(brandOverlayDir(), "authoring", `${name}.md`));
}

/** Liest einen kleinen Verzeichnisbaum und hängt die Files mit Pfad-Headern aneinander. */
function readTreeConcat(dir: string): string | null {
  let out = "";
  function walk(absDir: string, rel: string): void {
    let entries: string[];
    try {
      entries = readdirSync(absDir).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = path.join(absDir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      let isDir = false;
      try {
        isDir = statSync(abs).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        walk(abs, relPath);
      } else {
        const content = readFileSafe(abs);
        if (content != null) out += `\n\n--- ${relPath} ---\n\n${content}`;
      }
    }
  }
  walk(dir, "");
  return out.trim().length > 0 ? out.trim() : null;
}

const UNAVAILABLE =
  "_(Diese Referenz ist im aktuellen Deployment nicht eingebettet — " +
  "siehe das course-authoring-Plugin bzw. die Docs im Repo.)_";

// ============================================================
// Topics
// ============================================================

export const GUIDE_TOPICS = [
  "overview",
  "bundle-format",
  "components",
  "content-style",
  "image-style",
  "diagram-style",
  "example",
  "workflow",
  "learning-paths",
] as const;

export type GuideTopic = (typeof GUIDE_TOPICS)[number];

const _cache = new Map<GuideTopic, string>();

/** Liefert das Autoren-Wissen für ein Topic als Markdown. Gecached. */
export function getGuide(topic: GuideTopic): string {
  const cached = _cache.get(topic);
  if (cached != null) return cached;
  const text = build(topic);
  _cache.set(topic, text);
  return text;
}

function build(topic: GuideTopic): string {
  switch (topic) {
    case "overview":
      return OVERVIEW;
    case "workflow":
      return WORKFLOW;
    case "components":
      return buildComponents();
    case "bundle-format":
      return readFileSafe(path.join(DOCS, "AUTHORING_BUNDLE.md")) ?? UNAVAILABLE;
    case "example":
      return readTreeConcat(EXAMPLE_DIR) ?? UNAVAILABLE;
    case "content-style":
      return (
        readBrandOverlay("content-style") ??
        readFileSafe(path.join(DOCS, "CONTENT_STYLE.md")) ??
        UNAVAILABLE
      );
    case "image-style":
      return (
        readBrandOverlay("image-style") ??
        readFileSafe(path.join(DOCS, `BRAND-IMAGE-STYLE-${brandKey()}.md`)) ??
        UNAVAILABLE
      );
    case "diagram-style":
      return (
        readBrandOverlay("diagram-style") ??
        readFileSafe(path.join(DOCS, "diagram-style", "SVG-DIAGRAM-STYLE.md")) ??
        UNAVAILABLE
      );
    case "learning-paths":
      return readFileSafe(path.join(DOCS, "AUTHORING_PATH.md")) ?? UNAVAILABLE;
  }
}

function buildComponents(): string {
  const list = ALLOWED_MDX_COMPONENTS.map((c) => `- \`<${c}>\``).join("\n");
  return [
    "# Erlaubte MDX-Komponenten",
    "",
    "Nur diese Komponenten sind in Lesson-MDX zulässig (alles andere lehnt der",
    "Import als unsichere/unbekannte Komponente ab). Dies ist die autoritative",
    "Liste — deckungsgleich mit dem, was `validate_bundle` akzeptiert:",
    "",
    list,
    "",
    "Props und Beispiele zu jeder Komponente stehen im Topic `bundle-format`",
    "(Abschnitt: Verfügbare MDX-Komponenten).",
  ].join("\n");
}

// ============================================================
// Inline-Topics (engine-eigenes Wissen, brand-neutral)
// ============================================================

const OVERVIEW = `# Kurs-Authoring über MCP — Überblick

Ein Kurs ist ein **Bundle**: \`course.mdx\` (Kurs-Metadaten) + \`NN-section/\`-Ordner
mit \`NN-lesson.mdx\`-Dateien + \`assets/\` (Bilder). Das Bundle ist die Source of
Truth; die Plattform indexiert es nach Postgres.

So gehst du vor (Details je Topic über \`get_authoring_guide\` oder die Resources):

1. **Format lernen** — Topic \`bundle-format\` (Ordnerstruktur, Frontmatter je
   Datei-Typ, Slug-/NN-Konventionen) und \`components\` (erlaubtes MDX-Vokabular).
2. **Stil** — Topics \`content-style\` (Didaktik/Stimme), \`image-style\` und
   \`diagram-style\` (markenspezifisch).
3. **Vorlage** — Topic \`example\` zeigt ein vollständiges Mini-Bundle.
4. **Ablauf** — Topic \`workflow\` (welche Tools in welcher Reihenfolge).

Wichtig: Binär-Assets NIE als base64 durch den Kontext schleusen — dafür gibt es
\`request_asset_upload_url\` (direkter Upload per curl). Siehe \`workflow\`.`;

const WORKFLOW = `# Authoring-Workflow (MCP-Tools)

**Bestehenden Kurs ändern:**
1. \`list_courses\` — Slug finden.
2. \`export_course(slug)\` — Text-Dateien + Asset-Manifest (kein base64) ziehen.
3. Lokal/​im Kontext editieren (MDX-Text).
4. **Neues/geändertes Bild?** \`request_asset_upload_url(courseSlug, path)\` →
   gibt eine fertige curl-Zeile zurück; das Bild damit DIREKT hochladen (die
   Bytes laufen nie durch den Modell-Output). Rückgabe enthält den \`sha256\`.
   Fallback ohne Shell: \`upload_asset\` (base64) — langsam, nur für kleine Bilder.
5. \`validate_bundle(courseSlug, files, assets?)\` — Format prüfen, OHNE zu
   schreiben; liefert \`[{file, line?, message}]\`. Vor dem Import aufrufen.
6. \`import_course(courseSlug, files, assets)\` — als **Draft** hochladen.
   \`files\` = Text-Dateien; \`assets\` = \`{path, sha256}\`-Referenzen (unveränderte
   Assets nie neu übertragen). Bei Versions-Konflikt NICHT überschreiben.
7. \`publish_course(slug)\` — bewusst getrennter Schritt, schaltet live.

**Neuen Kurs:** wie oben ab Schritt 3, mit frisch geschriebenem \`course.mdx\`
(siehe Topic \`example\`) — \`version\` weglassen, der Server vergibt sie.

**Cover-Bild:** \`cover: assets/images/<datei>\` im \`course.mdx\`-Frontmatter →
der Import verknüpft es mit dem Kurs; es rendert auf Kachel + Detailseite.`;

// ============================================================
// Resource-Definitionen (für die MCP-Route)
// ============================================================

export type GuideResourceDef = {
  uri: string;
  name: string;
  title: string;
  description: string;
  topic: GuideTopic;
};

export const GUIDE_RESOURCES: GuideResourceDef[] = [
  {
    uri: "authoring://guide/overview",
    name: "authoring-overview",
    title: "Authoring — Überblick",
    description: "Einstieg: was ein Kurs-Bundle ist und wie man autort.",
    topic: "overview",
  },
  {
    uri: "authoring://format/bundle",
    name: "authoring-bundle-format",
    title: "Bundle-Format-Referenz",
    description:
      "Ordnerstruktur, Frontmatter je Datei-Typ, Konventionen, Asset-Handling.",
    topic: "bundle-format",
  },
  {
    uri: "authoring://components",
    name: "authoring-components",
    title: "Erlaubte MDX-Komponenten",
    description: "Autoritatives Komponenten-Vokabular (was validate_bundle akzeptiert).",
    topic: "components",
  },
  {
    uri: "authoring://style/content",
    name: "authoring-content-style",
    title: "Inhalts-/Didaktik-Stil (markenspezifisch)",
    description: "Stimme, Didaktik, Schreib-Konventionen für diese Marke.",
    topic: "content-style",
  },
  {
    uri: "authoring://style/image",
    name: "authoring-image-style",
    title: "Bildstil (markenspezifisch)",
    description: "Bildgenerierungs-Stil für diese Marke.",
    topic: "image-style",
  },
  {
    uri: "authoring://style/diagram",
    name: "authoring-diagram-style",
    title: "Diagramm-Stil (markenspezifisch)",
    description: "SVG-Diagramm-Idiom für diese Marke.",
    topic: "diagram-style",
  },
  {
    uri: "authoring://example/minimal-course",
    name: "authoring-example",
    title: "Beispiel-Bundle",
    description: "Vollständiges Mini-Kurs-Bundle als Vorlage.",
    topic: "example",
  },
  {
    uri: "authoring://format/learning-paths",
    name: "authoring-learning-paths",
    title: "Lernpfade — Format & Flow",
    description:
      "Wie man Lernpfade (Kurs-Bündel) per MCP anlegt/ändert/publisht — kein Bundle.",
    topic: "learning-paths",
  },
];
