/**
 * Pluggable LLM-Backend (ADR 0002, Entscheidung 2).
 *
 * Der Tutor ruft NICHT einen hartverdrahteten Anbieter, sondern dieses
 * `CompletionProvider`-Interface. Konfiguration pro Deployment via Env-Vars
 * (siehe ./env.ts), nie brand-übergreifend geteilt. Bei FiKnow-Handover legt
 * die Firma ihr eigenes Provider-Konto an → ihr Key in deren Env → eine
 * Env-Var, kein Code-Change.
 *
 * Das Interface ist bewusst minimal und anbieter-neutral: ein System-Prompt
 * (als Blöcke, damit der große, stabile Lesson-Kontext für Prompt-Caching
 * markiert werden kann), ein paar User/Assistant-Turns, ein max_tokens-Cap.
 */

export interface SystemBlock {
  text: string;
  /**
   * Prompt-Caching-Hinweis: dieser Block ist ein großer, über mehrere Requests
   * stabiler Präfix (z. B. der Lesson-Kontext). Provider, die Caching können
   * (Anthropic), setzen darauf einen cache_control-Breakpoint → wiederholte
   * Fragen zur selben Lesson kosten den Input nur ~0,1×. Provider ohne Caching
   * ignorieren das Flag.
   */
  cache?: boolean;
}

export interface CompletionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  /** System-Prompt in Blöcken (Reihenfolge = Render-Reihenfolge). */
  system: SystemBlock[];
  messages: CompletionMessage[];
  /** Harte Obergrenze der Antwortlänge (Kosten-Hebel, ADR 0002 §5). */
  maxTokens: number;
}

export interface CompletionUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** Aus dem Cache gelesene Input-Tokens (für Kosten-Monitoring). */
  cacheReadTokens?: number;
}

export interface CompletionResult {
  /** Reiner Text der Antwort (Markdown, noch UNTRUSTED — Caller sanitisiert). */
  text: string;
  usage?: CompletionUsage;
  /** z. B. "end_turn" | "max_tokens" | "refusal". */
  stopReason?: string;
}

export interface CompletionProvider {
  /** Aktives Modell (für Logging/Health, ohne den Key zu offenbaren). */
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

/**
 * Fehler aus dem LLM-Pfad mit stabilem `code` für sauberes Mapping auf
 * HTTP-Status im Endpoint (keine Provider-Internals nach außen leaken).
 */
export type LlmErrorCode =
  | "not_configured"
  | "upstream_auth" // 401/403 vom Provider — Deployment-Fehlkonfiguration
  | "upstream_rate_limited" // 429 vom Provider
  | "upstream_overloaded" // 529
  | "upstream_error" // sonstiger 5xx/Netzwerkfehler
  | "timeout"
  | "refused" // Safety-Klassifizierer hat abgelehnt
  | "empty"; // Provider lieferte keinen Text

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  /** true = erneuter Versuch könnte klappen (429/5xx/Timeout). */
  readonly retryable: boolean;

  constructor(code: LlmErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    this.retryable = retryable;
  }
}
