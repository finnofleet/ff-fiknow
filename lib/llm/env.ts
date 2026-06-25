/**
 * LLM-Konfiguration pro Deployment (ADR 0002, Entscheidung 2).
 *
 * Alle Werte aus Env-Vars, NIE im Code hartverdrahtet. So reiht sich das
 * LLM-Konto in die übrigen brand-spezifischen Konten ein (Supabase, DB,
 * Storage …) und der FiKnow-Handover ist ein Env-Var-Tausch, kein Code-Change.
 *
 *   LLM_PROVIDER   "anthropic" (Default; einziger v1-Provider)
 *   LLM_API_KEY    Provider-API-Key (Pflicht, sonst ist der Tutor AUS)
 *   LLM_BASE_URL   API-Basis-URL — Default https://api.anthropic.com.
 *                  Überschreibbar für einen EU-/CH-Region- + Zero-Retention-Pfad
 *                  (z. B. ein Anthropic-kompatibles Gateway / Proxy). User-
 *                  Notizen/-Fragen sind persönliche Daten → ZDR-Pfad bevorzugt.
 *   LLM_MODEL      Modell-ID — Default claude-haiku-4-5 (günstigster Tier;
 *                  „erklär einfacher" ist meist ausreichend, ADR §5). Messen,
 *                  dann ggf. auf Sonnet hochstufen.
 *   LLM_MAX_TOKENS max_tokens-Cap pro Antwort — Default 1024.
 *
 * Der Tutor ist optional: fehlt LLM_API_KEY, ist er deploymentweit AUS (die
 * Annotations-Schicht — Notizen/Markierungen — funktioniert ohne LLM weiter).
 */

export interface LlmConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
}

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-haiku-4-5";
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Ist der Tutor für dieses Deployment aktiviert? (Kein Throw — für Gating/
 * Health-Checks.) Aktiv = ein API-Key ist gesetzt.
 */
export function isTutorConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY?.trim());
}

/**
 * Liest + validiert die LLM-Konfiguration. Wirft, wenn nicht konfiguriert —
 * der Caller (Tutor-Endpoint) prüft vorher `isTutorConfigured()` und gibt
 * sonst 503/Feature-aus zurück.
 */
export function getLlmConfig(): LlmConfig {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY nicht gesetzt — der Tutor ist für dieses Deployment nicht konfiguriert.",
    );
  }

  const baseUrl = (process.env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );

  const rawMax = Number(process.env.LLM_MAX_TOKENS);
  const maxTokens =
    Number.isInteger(rawMax) && rawMax > 0 ? rawMax : DEFAULT_MAX_TOKENS;

  return {
    provider: process.env.LLM_PROVIDER?.trim() || DEFAULT_PROVIDER,
    apiKey,
    baseUrl,
    model: process.env.LLM_MODEL?.trim() || DEFAULT_MODEL,
    maxTokens,
  };
}
