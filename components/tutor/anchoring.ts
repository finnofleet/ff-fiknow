/**
 * Robustes Anchoring (ADR 0002, Entscheidung 4) — clientseitig.
 *
 * Eine Annotation zeigt auf eine Stelle im geteilten Content. Da der Content
 * versioniert neu hochgeladen werden kann (ADR 0001), driften reine Offset-Anker.
 * Lösung wie Hypothes.is/Kindle:
 *   - text-quote (Zitat + Prefix/Suffix) = PRIMÄRER Anker (übersteht Drift),
 *   - text-position (start/end) = schneller Fallback.
 * Findet sich das Zitat nicht mehr, „verwaist" die Annotation sauber (locate
 * gibt null) statt auf die falsche Stelle zu zeigen.
 */

export interface Anchor {
  quote: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
}

const CONTEXT_LEN = 32;

/** Berechnet einen Anker aus der aktuellen Selektion innerhalb von `container`. */
export function computeAnchor(
  container: HTMLElement,
  range: Range,
): Anchor | null {
  if (!container.contains(range.commonAncestorContainer)) return null;
  const quote = range.toString().trim();
  if (!quote) return null;

  const pre = container.ownerDocument.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const end = start + range.toString().length;

  const text = container.textContent ?? "";
  const prefix = text.slice(Math.max(0, start - CONTEXT_LEN), start);
  const suffix = text.slice(end, end + CONTEXT_LEN);

  return { quote, prefix, suffix, start, end };
}

/**
 * Lokalisiert einen gespeicherten Anker im aktuellen Content und liefert eine
 * DOM-Range — oder null, wenn das Zitat nicht (mehr) auffindbar ist.
 */
export function locateAnchor(
  container: HTMLElement,
  anchor: {
    quote: string | null;
    prefix: string | null;
    suffix: string | null;
    start: number | null;
    end: number | null;
  },
): Range | null {
  const quote = anchor.quote ?? "";
  if (!quote) return null;
  const text = container.textContent ?? "";

  // 1. text-position-Fallback: stimmt der Offset noch, direkt nehmen.
  if (
    anchor.start != null &&
    anchor.end != null &&
    text.slice(anchor.start, anchor.end) === quote
  ) {
    return offsetsToRange(container, anchor.start, anchor.end);
  }

  // 2. text-quote: über Prefix/Suffix → Prefix → reines Zitat re-lokalisieren.
  const idx = findQuoteIndex(text, quote, anchor.prefix, anchor.suffix);
  if (idx < 0) return null;
  return offsetsToRange(container, idx, idx + quote.length);
}

function findQuoteIndex(
  text: string,
  quote: string,
  prefix: string | null,
  suffix: string | null,
): number {
  if (prefix && suffix) {
    const i = text.indexOf(prefix + quote + suffix);
    if (i >= 0) return i + prefix.length;
  }
  if (prefix) {
    const i = text.indexOf(prefix + quote);
    if (i >= 0) return i + prefix.length;
  }
  if (suffix) {
    const i = text.indexOf(quote + suffix);
    if (i >= 0) return i;
  }
  return text.indexOf(quote);
}

/** Baut eine Range aus Zeichen-Offsets, indem die Text-Nodes durchlaufen werden. */
function offsetsToRange(
  container: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const doc = container.ownerDocument;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode: Text | null = null;
  let startOff = 0;
  let endNode: Text | null = null;
  let endOff = 0;

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const len = textNode.nodeValue?.length ?? 0;
    if (startNode === null && pos + len >= start) {
      startNode = textNode;
      startOff = start - pos;
    }
    if (pos + len >= end) {
      endNode = textNode;
      endOff = end - pos;
      break;
    }
    pos += len;
  }

  if (!startNode || !endNode) return null;
  const range = doc.createRange();
  try {
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
  } catch {
    return null;
  }
  return range;
}
