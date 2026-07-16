/**
 * remark-Plugin: erzwingt „MDX ist Daten, nicht Code" (ADR 0001,
 * Sicherheits-Anforderung 1) auf mdast-Ebene — also VOR dem Kompilieren zu
 * ausführbarem JS. Wirft beim ersten Verstoß; der Aufrufer (Compile/Render
 * oder `assertSafeMdx`) bricht damit ab.
 *
 * Geblockt:
 *   - ESM `import`/`export`               (mdxjsEsm)
 *   - Body-Ausdrücke `{ ... }`            (mdxFlowExpression / mdxTextExpression)
 *     → der konkrete RCE/Exfil-Vektor, z. B. `{process.env.PAYLOAD_SECRET}`.
 *   - JSX-Elemente, deren Name NICHT in der Whitelist steht
 *     (mdxJsxFlowElement / mdxJsxTextElement) → deckt rohes HTML wie
 *     `<script>`/`<iframe>` UND unbekannte Komponenten ab; in MDX ist
 *     literales HTML ein JSX-Element, also greift dieselbe Namens-Whitelist.
 *   - JSX-Fragmente `<>...</>`            (name === null)
 *   - Spread-/Expression-Attribute `{...x}` (mdxJsxExpressionAttribute)
 *   - Attribut-Ausdrücke, die KEIN statisches Literal sind
 *     (`<Option correct={process.env.X}>` wird abgelehnt, `correct={true}`
 *     erlaubt — siehe assertStaticExpression).
 *   - Unsichere URL-Schemata (`javascript:`, `data:`, ...) in Markdown-Links/
 *     -Bildern und in URL-tragenden Attributen (src/href/poster).
 *
 * Bewusst NICHT rehype-sanitize: das operiert auf hast und würde die
 * Whitelist-Komponenten (mdxJsx-Nodes) strippen, weil es sie nicht kennt. Die
 * mdast-Whitelist hier ist strikter (Komponenten-Whitelist statt
 * HTML-Allowlist) und komponiert sauber mit MDX.
 */
import { visit } from "unist-util-visit";

import { ALLOWED_MDX_COMPONENT_SET } from "./allowed-components";

/**
 * Validierungsfehler mit stabilem Prefix, an dem der Upload-Endpoint einen
 * 400 (User-Error) statt 500 erkennt. `reason` ist die maschinen-/log-taugliche
 * Begründung ohne Prefix.
 */
export class MdxValidationError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`MDX-Validierung: ${reason}`);
    this.name = "MdxValidationError";
    this.reason = reason;
  }
}

// Attribute, deren String-Wert eine URL ist und gegen unsichere Schemata
// geprüft werden muss.
const URL_ATTRS: ReadonlySet<string> = new Set(["src", "href", "poster"]);

/**
 * Lässt relative URLs (kein Schema) sowie eine kleine Allowlist sicherer
 * Schemata zu. `assets/...` (relativ) und die plattform-internen
 * `/api/media/...`-Pfade fallen unter „relativ" → erlaubt.
 */
function isSafeUrl(raw: unknown): boolean {
  const url = String(raw ?? "").trim();
  // Steuerzeichen (Newline/Tab/...), die Browser beim URL-Parsen entfernen und
  // so ein verbotenes Schema verschleiern könnten (`java\tscript:`).
  for (let i = 0; i < url.length; i++) {
    const code = url.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  const schemeMatch = url.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!schemeMatch) return true; // relativ / Fragment / schema-los
  const scheme = schemeMatch[1].toLowerCase();
  return (
    scheme === "http" ||
    scheme === "https" ||
    scheme === "mailto" ||
    scheme === "tel"
  );
}

/**
 * Erlaubt NUR statische Literal-Ausdrücke in JSX-Attributen. Akzeptiert
 * Boolean/Zahl/String/null, Unary +/- auf Zahlen sowie Arrays/Objekte aus
 * ebensolchen Literalen. Alles mit Identifier-Referenz, Member-Zugriff,
 * Funktions-/Call-/Template-Ausdrücken etc. fliegt raus — das ist die Grenze
 * zwischen „deklarativer Wert" und „Code".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertStaticExpression(estree: any, label: string): void {
  const body = estree?.body;
  if (
    !Array.isArray(body) ||
    body.length !== 1 ||
    body[0]?.type !== "ExpressionStatement"
  ) {
    throw new MdxValidationError(
      `${label}: nur einfache, statische Ausdrücke erlaubt`,
    );
  }
  assertLiteralNode(body[0].expression, label);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertLiteralNode(node: any, label: string): void {
  switch (node?.type) {
    case "Literal":
      if (node.regex) {
        throw new MdxValidationError(`${label}: RegExp-Literal nicht erlaubt`);
      }
      return;
    case "UnaryExpression":
      if (node.operator !== "-" && node.operator !== "+") {
        throw new MdxValidationError(
          `${label}: Operator "${node.operator}" nicht erlaubt`,
        );
      }
      assertLiteralNode(node.argument, label);
      return;
    case "ArrayExpression":
      for (const el of node.elements ?? []) {
        if (el) assertLiteralNode(el, label);
      }
      return;
    case "ObjectExpression":
      for (const prop of node.properties ?? []) {
        if (prop?.type !== "Property" || prop.computed || prop.kind !== "init") {
          throw new MdxValidationError(
            `${label}: nur statische Objekt-Literale erlaubt`,
          );
        }
        // Der Key (Identifier oder Literal) wird nicht ausgewertet — nur der Wert.
        assertLiteralNode(prop.value, label);
      }
      return;
    default:
      throw new MdxValidationError(
        `${label}: Ausdruck "${node?.type ?? "?"}" nicht erlaubt (nur statische Literale)`,
      );
  }
}

/**
 * Das eigentliche remark-Plugin. Ohne Optionen verwendbar:
 * `remarkPlugins: [remarkRejectUnsafe]`.
 */
export function remarkRejectUnsafe() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, (node: any) => {
      switch (node.type) {
        case "mdxjsEsm":
          throw new MdxValidationError(
            "ESM import/export ist nicht erlaubt (MDX = Daten, nicht Code)",
          );

        case "mdxFlowExpression":
        case "mdxTextExpression": {
          const snippet = String(node.value ?? "").slice(0, 60);
          throw new MdxValidationError(
            `JS-Ausdruck im Body nicht erlaubt: {${snippet}}`,
          );
        }

        case "mdxJsxFlowElement":
        case "mdxJsxTextElement": {
          const name: string | null = node.name;
          if (!name) {
            throw new MdxValidationError("JSX-Fragment <>...</> ist nicht erlaubt");
          }
          if (!ALLOWED_MDX_COMPONENT_SET.has(name)) {
            throw new MdxValidationError(
              `Element <${name}> ist nicht erlaubt (nur Whitelist-Komponenten; rohes HTML verboten)`,
            );
          }
          for (const attr of node.attributes ?? []) {
            if (attr.type === "mdxJsxExpressionAttribute") {
              throw new MdxValidationError(
                `Spread-/Expression-Attribut an <${name}> nicht erlaubt`,
              );
            }
            // attr.type === "mdxJsxAttribute"
            const value = attr.value;
            if (value && typeof value === "object") {
              // mdxJsxAttributeValueExpression → estree prüfen
              assertStaticExpression(
                value.data?.estree,
                `<${name} ${attr.name}>`,
              );
            } else if (
              typeof value === "string" &&
              URL_ATTRS.has(attr.name) &&
              !isSafeUrl(value)
            ) {
              throw new MdxValidationError(
                `Unsicheres URL-Schema in <${name} ${attr.name}>: ${value.slice(0, 40)}`,
              );
            }
          }
          return;
        }

        case "link":
        case "definition":
          if (!isSafeUrl(node.url)) {
            throw new MdxValidationError(
              `Unsicheres URL-Schema in Link: ${String(node.url).slice(0, 40)}`,
            );
          }
          return;

        case "image":
          if (!isSafeUrl(node.url)) {
            throw new MdxValidationError(
              `Unsicheres URL-Schema in Bild: ${String(node.url).slice(0, 40)}`,
            );
          }
          return;

        default:
          return;
      }
    });
  };
}
