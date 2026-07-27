/**
 * Die EINE gehärtete MDX-Pipeline (ADR 0001, „Server ist die einzige
 * Render-Wahrheit"). Render-Pfad und Import-Validierung teilen sich exakt
 * dieselben remark-Plugins — kein Drift zwischen „was gerendert wird" und
 * „was beim Upload geprüft wird".
 */
import remarkGfm from "remark-gfm";

import { remarkRejectUnsafe } from "./remark-reject-unsafe";

/**
 * Reihenfolge zählt: remark-gfm zuerst (erzeugt u. a. Autolink-/Tabellen-Nodes),
 * danach der Reject-Pass, damit dieser auch die gfm-erzeugten Nodes mitprüft.
 */
export const hardenedRemarkPlugins = [remarkGfm, remarkRejectUnsafe];

/**
 * Fertige `mdxOptions` für `next-mdx-remote/rsc`:
 * `<MDXRemote options={{ mdxOptions: hardenedMdxOptions }} />`.
 */
export const hardenedMdxOptions = {
  remarkPlugins: hardenedRemarkPlugins,
};

/**
 * Vollständige Options für `<MDXRemote>` (next-mdx-remote/rsc) — nutze IMMER
 * diese, nicht `{ mdxOptions: hardenedMdxOptions }` direkt.
 *
 * WICHTIG — `blockJS`/`blockDangerousJS` sind BEWUSST `false`:
 * next-mdx-remote hängt bei `blockJS !== false` per Default ein
 * `removeJavaScriptExpressions`-Remark-Plugin an, das ALLE JS-Ausdrücke aus
 * dem MDX entfernt — inklusive statischer Attribut-Literale wie
 * `correct={true}` an `<Option>`. Das strippte still den `correct`-Prop und
 * wertete korrekte Quiz-Antworten als FALSCH (Live-Bug). Es erzeugte zudem
 * einen Drift gegenüber der Upload-Validierung (`assertSafeMdx`), die nur
 * `hardenedRemarkPlugins` nutzt und `correct={true}` erlaubt — ADR 0001
 * verlangt aber ausdrücklich, dass Render- und Validierungs-Pipeline IDENTISCH
 * sind (kein Drift).
 *
 * Sicherheit bleibt gewahrt: `remarkRejectUnsafe` (in `hardenedRemarkPlugins`)
 * ist die eigentliche, striktere Härtung — es WIRFT bei Body-Ausdrücken,
 * nicht-literalen Attribut-Ausdrücken und Nicht-Whitelist-Komponenten und
 * lässt NUR statische Literale zu. next-mdx-remotes pauschales Stripping ist
 * damit redundant UND schädlich; wir schalten es ab und verlassen uns auf die
 * projekteigene Härtung — dieselbe wie beim Upload.
 */
export const hardenedRscOptions = {
  mdxOptions: hardenedMdxOptions,
  blockJS: false as const,
  blockDangerousJS: false as const,
};
