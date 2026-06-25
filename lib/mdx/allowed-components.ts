/**
 * Kanonische Whitelist der erlaubten MDX-Komponenten-Namen — das
 * „geschlossene Set typisierter, deklarativer Komponenten" aus ADR 0001.
 *
 * BEWUSST reine Strings, KEIN React-/CSS-Import: Dieses Modul wird auch im
 * Import-/Validierungs-Pfad (lib/authoring/import.ts, scripts/*) gezogen, der
 * keine React-Komponenten oder CSS-Module laden soll.
 *
 * Single Source of Truth für „welche JSX-Elemente sind erlaubt". Muss exakt
 * mit den in `components/mdx/index.tsx` registrierten Komponenten
 * übereinstimmen — die Gegenprobe sichert `assertWhitelistMatchesRegistry()`
 * dort bzw. der Render-Pfad selbst (unbekannte Namen würden ohnehin als
 * „undefined component" auffallen).
 */
export const ALLOWED_MDX_COMPONENTS = [
  "Callout",
  "Definition",
  "DefinitionList",
  "Figure",
  "KeyTakeaways",
  "Option",
  "Pullquote",
  "Question",
  "Steps",
] as const;

export type AllowedMdxComponent = (typeof ALLOWED_MDX_COMPONENTS)[number];

export const ALLOWED_MDX_COMPONENT_SET: ReadonlySet<string> = new Set(
  ALLOWED_MDX_COMPONENTS,
);
