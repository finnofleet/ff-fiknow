import { loadInlineSvg } from "@/lib/svg/inline-svg";

import { FigureClient } from "./figure-client";

export type FigureProps = {
  src?: string;
  /** Optionaler Dark-Theme-Variant für Effekt-Grafiken (Glow/Gradient), die
   *  sich NICHT mechanisch per currentColor flippen lassen. Wird per
   *  [data-theme] geswappt. Flache Diagramme brauchen das nicht — sie nutzen
   *  currentColor und passen sich mit EINEM Asset an. */
  srcDark?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
};

/**
 * Server-Component: lädt lokale SVGs als Inline-Markup (theme-adaptiv via
 * `currentColor` + transparenter Grund) und reicht alles an die
 * Client-Component (Zoom-Modal) weiter. Raster/Remote bleiben <img>/<Image>.
 * Schlägt das Inlinen fehl, fällt FigureClient automatisch auf <img> zurück.
 */
export async function Figure(props: FigureProps) {
  const inlineLight = await loadInlineSvg(props.src);
  const inlineDark = await loadInlineSvg(props.srcDark);
  return (
    <FigureClient {...props} inlineLight={inlineLight} inlineDark={inlineDark} />
  );
}
