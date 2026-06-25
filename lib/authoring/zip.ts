/**
 * ZIP-Extraktion + Eingangs-Härtung für Bundle-Uploads (SECURITY_AUDIT,
 * Findings 3–5 / ADR 0001, Sicherheits-Anforderung 6).
 *
 * Schützt vor:
 *   - Zip-Slip / Path-Traversal (`..`, absolute Pfade, Backslash, Null-Byte)
 *   - Zip-Bomb (Entry-Anzahl, unkomprimierte Einzel-/Gesamtgröße, Ratio)
 *   - Symlink-Entries (könnten downstream auf Fremdpfade zeigen)
 *
 * Läuft in-memory (kein Disk-Write); gibt eine Map<relativer-Pfad, Buffer>
 * zurück, normalisiert um einen optionalen gemeinsamen Top-Level-Ordner.
 */
import AdmZip from "adm-zip";

// Zip-Bomb-Caps: das komprimierte Hard-Limit (100 MB) wird in der Route auf
// dem Upload-Blob geprüft; diese Caps begrenzen das UNkomprimierte Extrakt.
const MAX_ZIP_ENTRIES = 2_000;
const MAX_UNCOMPRESSED_ENTRY = 50 * 1024 * 1024; // 50 MB pro Datei
const MAX_UNCOMPRESSED_TOTAL = 250 * 1024 * 1024; // 250 MB gesamt
const MAX_COMPRESSION_RATIO = 100; // unkomprimiert/komprimiert pro Entry

// Unix-Datei-Typ-Maske + Symlink-Bit (obere 16 Bit des external-attr-Felds).
const UNIX_TYPE_MASK = 0o170000;
const UNIX_SYMLINK = 0o120000;

export function extractZipToMap(buffer: Buffer): Map<string, Buffer> {
  const zip = new AdmZip(buffer);
  const allEntries = zip.getEntries();

  // Zip-Bomb (1/4): Entry-Anzahl deckeln, bevor wir irgendetwas entpacken.
  if (allEntries.length > MAX_ZIP_ENTRIES) {
    throw new Error(
      `Zu viele ZIP-Entries: ${allEntries.length} > ${MAX_ZIP_ENTRIES}`,
    );
  }

  const entries = allEntries.filter((e) => !e.isDirectory);
  const files = new Map<string, Buffer>();
  if (entries.length === 0) return files;

  // Sicherheits-Pass über alle Datei-Entries VOR dem Entpacken: Symlinks
  // ablehnen, Pfade gegen Zip-Slip prüfen, Zip-Bomb-Caps (unkomprimiert)
  // anhand der Header akkumulieren. Header sind angreifer-kontrolliert — die
  // tatsächliche Größe wird unten beim Entpacken nochmals akkumuliert.
  let claimedTotal = 0;
  for (const entry of entries) {
    if (((entry.attr >>> 16) & UNIX_TYPE_MASK) === UNIX_SYMLINK) {
      throw new Error(`Symlink-Entry nicht erlaubt: ${entry.entryName}`);
    }
    assertSafeEntryName(entry.entryName);

    const size = entry.header.size;
    const compressed = entry.header.compressedSize;
    if (size > MAX_UNCOMPRESSED_ENTRY) {
      throw new Error(`ZIP-Entry zu groß (unkomprimiert): ${entry.entryName}`);
    }
    if (compressed > 0 && size / compressed > MAX_COMPRESSION_RATIO) {
      throw new Error(`Verdächtige Kompressionsratio: ${entry.entryName}`);
    }
    claimedTotal += size;
    if (claimedTotal > MAX_UNCOMPRESSED_TOTAL) {
      throw new Error("ZIP-Gesamt-Extrakt zu groß (Header-Summe)");
    }
  }

  // Detect ob alle Entries einen gemeinsamen Top-Level-Ordner haben
  const topLevels = new Set<string>();
  for (const entry of entries) {
    topLevels.add(entry.entryName.split("/")[0]);
  }
  const hasCommonTopFolder =
    topLevels.size === 1 && !entries.some((e) => e.entryName === "course.mdx");

  const prefix = hasCommonTopFolder ? [...topLevels][0] + "/" : "";

  let realTotal = 0;
  for (const entry of entries) {
    let key = entry.entryName;
    if (prefix && key.startsWith(prefix)) {
      key = key.slice(prefix.length);
    }
    if (key.length === 0) continue;

    const data = entry.getData();
    // Zip-Bomb (4/4): tatsächliche (entpackte) Größe gegen die Caps — fängt
    // gelogene Header-Größen über die Gesamtsumme ab.
    realTotal += data.length;
    if (data.length > MAX_UNCOMPRESSED_ENTRY) {
      throw new Error(`ZIP-Entry zu groß (entpackt): ${entry.entryName}`);
    }
    if (realTotal > MAX_UNCOMPRESSED_TOTAL) {
      throw new Error("ZIP-Gesamt-Extrakt zu groß (entpackt)");
    }
    files.set(key, data);
  }

  return files;
}

/**
 * Zip-Slip-/Path-Traversal-Schutz: lehnt Entry-Namen mit Null-Byte, absolutem
 * Pfad (Unix `/...` oder Windows `C:`), Backslash-Separator oder `..`-Segment
 * ab. Greift, bevor der Name in Slug-Ableitungen/DB-Ops fließt.
 */
export function assertSafeEntryName(name: string): void {
  if (name.includes("\0")) {
    throw new Error(`ZIP-Entry mit Null-Byte: ${name}`);
  }
  if (name.startsWith("/") || /^[a-zA-Z]:/.test(name)) {
    throw new Error(`ZIP-Entry mit absolutem Pfad: ${name}`);
  }
  if (name.includes("\\")) {
    throw new Error(`ZIP-Entry mit Backslash-Pfad: ${name}`);
  }
  if (name.split("/").some((seg) => seg === "..")) {
    throw new Error(`ZIP-Entry mit Pfad-Traversal (..): ${name}`);
  }
}
