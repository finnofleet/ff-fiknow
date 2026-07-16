/**
 * Sichere Darstellung der Tutor-Antwort (ADR 0002, Sicherheit 2).
 *
 * Die LLM-Antwort ist UNTRUSTED Text. Gleiche „Daten, nicht Code"-Haltung wie
 * der MDX-Pfad: wir rendern eine kleine, fest definierte Markdown-Teilmenge als
 * REACT-NODES (React escaped Textinhalte automatisch) — KEIN dangerouslySet-
 * InnerHTML, kein rohes HTML, keine Skripte, keine Links. Damit gibt es schlicht
 * keine Injection-Fläche; alles, was nicht zur Whitelist gehört, erscheint als
 * Klartext.
 *
 * Unterstützt: Überschriften (#/##/###), Aufzählungen (-/*), nummerierte Listen,
 * Absätze, **fett**, *kursiv*, `code`.
 */
import { Fragment, type ReactNode } from "react";

export function SafeMarkdown({ source }: { source: string }) {
  return <>{renderBlocks(source)}</>;
}

function renderBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={key++}>{renderInline(para.join(" "))}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => (
        <li key={i}>{renderInline(it)}</li>
      ));
      blocks.push(
        list.ordered ? (
          <ol key={key++}>{items}</ol>
        ) : (
          <ul key={key++}>{items}</ul>
        ),
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      const content = renderInline(heading[2]);
      blocks.push(
        level === 1 ? (
          <h3 key={key++}>{content}</h3>
        ) : level === 2 ? (
          <h4 key={key++}>{content}</h4>
        ) : (
          <h5 key={key++}>{content}</h5>
        ),
      );
      continue;
    }

    const ul = /^[-*]\s+(.*)$/.exec(line.trim());
    if (ul) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }

    const ol = /^\d+[.)]\s+(.*)$/.exec(line.trim());
    if (ol) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }

    flushList();
    para.push(line.trim());
  }

  flushPara();
  flushList();
  return blocks;
}

/**
 * Inline-Formatierung. Reihenfolge: `code` (höchste Priorität, kein Nesting),
 * dann **fett**, dann *kursiv*. Alles andere bleibt Klartext.
 */
function renderInline(text: string): ReactNode[] {
  return splitByCode(text);
}

function splitByCode(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...splitByBold(text.slice(last, m.index), `b${key}`));
    out.push(<code key={`c${key}`}>{m[1]}</code>);
    last = m.index + m[0].length;
    key++;
  }
  if (last < text.length) out.push(...splitByBold(text.slice(last), `b${key}`));
  return out;
}

function splitByBold(text: string, prefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last)
      out.push(...splitByItalic(text.slice(last, m.index), `${prefix}i${key}`));
    out.push(<strong key={`${prefix}s${key}`}>{m[1]}</strong>);
    last = m.index + m[0].length;
    key++;
  }
  if (last < text.length)
    out.push(...splitByItalic(text.slice(last), `${prefix}i${key}`));
  return out;
}

function splitByItalic(text: string, prefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={`${prefix}t${key}`}>{text.slice(last, m.index)}</Fragment>);
    out.push(<em key={`${prefix}e${key}`}>{m[1]}</em>);
    last = m.index + m[0].length;
    key++;
  }
  if (last < text.length)
    out.push(<Fragment key={`${prefix}t${key}`}>{text.slice(last)}</Fragment>);
  return out;
}
