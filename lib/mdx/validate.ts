/**
 * Reject-at-the-boundary (ADR 0001, Sicherheits-Anforderung 2): validiert
 * einen MDX-Body gegen die gehärtete Pipeline, BEVOR er persistiert wird.
 *
 * `compile()` aus @mdx-js/mdx parst MDX zu mdast (wo der Reject-Pass greift)
 * und erzeugt einen Code-String — es FÜHRT nichts aus. Bei jedem Verstoß oder
 * MDX-Syntaxfehler wird ein `MdxValidationError` geworfen.
 */
import { compile } from "@mdx-js/mdx";

import { MAX_MDX_SOURCE_CHARS, MDX_COMPILE_TIMEOUT_MS } from "./limits";
import { hardenedRemarkPlugins } from "./options";
import { MdxValidationError } from "./remark-reject-unsafe";

export { MdxValidationError };

/**
 * Lehnt einen Promise ab, wenn er nicht innerhalb von `ms` resolved. Der
 * zugrundeliegende Compile läuft mangels Cancel-Support weiter, aber wir warten
 * nicht länger (begrenzt die Request-Latenz). Reason ohne Label — der Aufrufer
 * hängt es an.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new MdxValidationError(`Compile-Timeout nach ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Wirft `MdxValidationError` (Prefix „MDX-Validierung:"), wenn `source` gegen
 * die Pipeline verstößt, zu groß ist, den Compile-Timeout reißt oder kein
 * gültiges MDX ist. `label` benennt die Quelle (z. B.
 * `"02-rechtsrahmen/05-quiz.mdx"`) für die Fehlermeldung.
 */
export async function assertSafeMdx(
  source: string,
  label: string,
): Promise<void> {
  if (!source || source.trim().length === 0) return; // leerer Body ist harmlos
  if (source.length > MAX_MDX_SOURCE_CHARS) {
    throw new MdxValidationError(
      `${label} — Body zu groß (${source.length} > ${MAX_MDX_SOURCE_CHARS} Zeichen)`,
    );
  }
  try {
    await withTimeout(
      compile(source, {
        format: "mdx",
        remarkPlugins: hardenedRemarkPlugins,
      }),
      MDX_COMPILE_TIMEOUT_MS,
    );
  } catch (err) {
    if (err instanceof MdxValidationError) {
      throw new MdxValidationError(`${label} — ${err.reason}`);
    }
    throw new MdxValidationError(
      `${label} — MDX-Syntaxfehler: ${(err as Error).message}`,
    );
  }
}
