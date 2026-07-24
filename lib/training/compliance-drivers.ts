/**
 * Menschlich lesbare Labels für `courses.complianceDrivers` (ADR 0005 §6,
 * Phase 6d) — fürs Dashboard (Badges/Filterleiste) und den CSV-Export.
 *
 * Bewusst aus `payload/collections/courses.ts` GESPIEGELT statt importiert:
 * die Collection-Config zieht Payload-interne Module, die im
 * Frontend-Bundle nichts verloren haben. Kontrolliertes Vokabular — bei
 * Änderung an den `options` dort MUSS dieses Mapping mitgezogen werden.
 */
export const DRIVER_LABELS: Record<string, string> = {
  eu_ai_act: "EU AI Act (Art. 4)",
  iso_42001: "ISO/IEC 42001",
  iso_27001: "ISO/IEC 27001",
  dsg_dsgvo: "Datenschutz (DSG/DSGVO)",
  security_awareness: "Security Awareness",
  arbeitsrecht: "Arbeitsrecht/-sicherheit",
  branchenspezifisch: "Branchenspezifisch",
  sonstige: "Sonstige",
};

/** Label für einen Treiber-Wert, Fallback auf den Rohwert bei unbekanntem Tag. */
export function driverLabel(value: string): string {
  return DRIVER_LABELS[value] ?? value;
}
