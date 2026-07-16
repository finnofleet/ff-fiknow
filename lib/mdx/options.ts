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
