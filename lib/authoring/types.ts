/**
 * Geteilte Typen für das Authoring-Bundle-Format.
 *
 * Siehe `docs/AUTHORING_BUNDLE.md` für die ausführliche Spec. Hier nur die
 * TypeScript-Repräsentation, die der Parser (bundle-parser.ts) erzeugt und
 * der Importer (import.ts) konsumiert.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Frontmatter = Record<string, any>;

export type ParsedLesson = {
  /** Slug, abgeleitet aus dem Datei-Namen ohne `MM-`-Präfix und ohne `.mdx`. */
  slug: string;
  /** Sortier-Index, abgeleitet aus dem `MM-`-Präfix des Datei-Namens. */
  orderIndex: number;
  frontmatter: Frontmatter;
  /** Roher Body (Markdown/MDX), nach gray-matter-Parsing — ohne Frontmatter. */
  body: string;
};

export type ParsedSection = {
  /** Slug, abgeleitet aus dem Ordner-Namen ohne `NN-`-Präfix. */
  slug: string;
  /** Sortier-Index, abgeleitet aus dem `NN-`-Präfix des Ordner-Namens. */
  orderIndex: number;
  /** Frontmatter aus `section.mdx`; leer falls keine `section.mdx` existiert. */
  frontmatter: Frontmatter;
  lessons: ParsedLesson[];
};

export type ParsedAsset = {
  /** Pfad relativ zum Bundle-Root, z.B. `assets/images/foo.png`. */
  relativePath: string;
  filename: string;
  content: Buffer;
  mimeType: string;
};

export type ParsedBundle = {
  /** Course-Slug, abgeleitet aus dem Ordner-Namen des Bundle-Roots. */
  courseSlug: string;
  course: { frontmatter: Frontmatter; body: string };
  sections: ParsedSection[];
  assets: ParsedAsset[];
};

export type ImportOptions = {
  /**
   * Wenn `true`, werden Asset-Dateien NICHT in die Payload-Media-Collection
   * hochgeladen und MDX-Pfade NICHT umgeschrieben. Nützlich für Tests oder
   * wenn Assets manuell unter /public/assets/ deployed sind (Legacy-Modell).
   */
  skipAssets?: boolean;

  /**
   * Wenn gesetzt, wird statt der echten Payload-Instanz die übergebene
   * Instanz verwendet (Dependency-Injection für Tests).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;

  /**
   * Roh-Dateien des Bundles (bundle-root-relativer Pfad → Buffer), byte-treu
   * wie hochgeladen/von der Platte gelesen. Wenn gesetzt, legt der Import das
   * Bundle als durable Source-of-Truth in den Bundle-Storage ab, BEVOR der
   * DB-Index geschrieben wird (ADR 0001). Fehlt es, wird nur der Index
   * geschrieben (z. B. Tests mit injizierter Payload-Instanz).
   */
  rawFiles?: Map<string, Buffer>;

  /**
   * Wenn `true`, wird der RAG-Index (ADR 0003) nach dem Upload NICHT erzeugt.
   * Für Tests / Folder-Importe ohne Embedding-Pfad. Default: indexieren
   * (best-effort — siehe importBundle).
   */
  skipIndexing?: boolean;
};

export type ImportSummary = {
  courseId: number;
  courseSlug: string;
  course: "created" | "updated";
  /**
   * Neues Konflikt-Token, das der Server diesem Kurs zugewiesen hat (ADR 0001,
   * Konsequenz 1). Der Client schreibt es ins `course.mdx`-Frontmatter zurück
   * (Self-Identifying Bundle) und schickt es beim nächsten Upload mit.
   */
  version: string;
  sections: {
    slug: string;
    id: number;
    action: "created" | "updated";
    lessons: {
      slug: string;
      id: number;
      action: "created" | "updated";
    }[];
  }[];
  assets: {
    relativePath: string;
    mediaId: number;
    action: "created" | "updated";
  }[];
};
