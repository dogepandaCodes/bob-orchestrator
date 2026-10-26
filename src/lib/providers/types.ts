import type { ProviderId } from "../themes";
import type { Effort } from "./effort";

/**
 * Canonical, provider-neutral message. Deliberately text-only: nothing in here
 * is a vendor object, so switching providers mid-thread needs no translation.
 * See "Provider handoff" in context/CLAUDE.md.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * What a provider needs to authenticate. Not always a single string — an
 * Anthropic key that is scoped to the organization rather than to one
 * workspace must also name the workspace to use.
 */
/**
 * The request format a credential speaks. Independent of the provider it
 * serves: behind a company gateway, Gemini models may well be reached over an
 * OpenAI-compatible endpoint.
 */
export type Wire = "anthropic" | "openai" | "gemini";

export interface Credential {
  key: string;
  workspaceId?: string;
  /** Replaces the adapter's default endpoint — e.g. a company gateway. */
  baseUrl?: string;
  /** Defaults to the provider's native format when absent. */
  wire?: Wire;
  /** Set when the connection came through a gateway rather than a direct key. */
  via?: "ica";
}

/** The credential's endpoint if it names one, else the adapter's own. */
export function endpoint(cred: Credential, fallback: string): string {
  return (cred.baseUrl?.trim() || fallback).replace(/\/+$/, "");
}

export interface ModelOption {
  id: string; // exact API model id
  label: string; // display name
}

/**
 * Token accounting for one exchange. Every provider reports this on the
 * response, so it costs nothing extra to collect — fields arrive at different
 * points in the stream and are merged as they land.
 */
export interface Usage {
  input?: number;
  output?: number;
  cacheRead?: number;
}

/** A function the model may call: an MCP tool's name, description and schema. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** One call the model asked for. `args` is the model's JSON text, unparsed. */
export interface ToolCall {
  id: string;
  name: string;
  args: string;
}

/**
 * One round of tool use inside a single reply: what the model said and asked
 * for, and what came back. It lives only while that reply is being produced —
 * afterwards the results survive as grounded facts in the canonical thread,
 * never as vendor tool messages, so a later switch needs no translation.
 */
export interface ToolRound {
  text: string;
  calls: ToolCall[];
  results: { id: string; content: string }[];
}

export interface StreamResult {
  /** Present when the model stopped to call tools rather than to answer. */
  toolCalls?: ToolCall[];
}

export interface StreamRequest {
  cred: Credential;
  model: string;
  messages: ChatMessage[];
  system?: string;
  onText: (chunk: string) => void;
  /** Omitted = the model's own default. Each adapter encodes it its own way. */
  effort?: Effort;
  /** Called whenever the stream reveals more about token usage. */
  onUsage?: (usage: Usage) => void;
  /**
   * The model the response says produced it. Behind a gateway this is the only
   * word on what actually answered, as opposed to what was asked for.
   */
  onModel?: (model: string) => void;
  /** Offered to the model. Only the OpenAI wire implements tools so far. */
  tools?: ToolSpec[];
  /** Earlier rounds of this same reply, replayed after `messages`. */
  rounds?: ToolRound[];
  signal?: AbortSignal;
}

export interface Adapter {
  id: ProviderId;
  label: string;
  keyPlaceholder: string;
  keyUrl: string;
  /** True when this provider can take a workspace id alongside the key. */
  supportsWorkspace?: boolean;
  /** Shown until listModels() succeeds; the live list is authoritative. */
  fallbackModels: ModelOption[];
  listModels(cred: Credential, signal?: AbortSignal): Promise<ModelOption[]>;
  stream(req: StreamRequest): Promise<StreamResult | void>;
}

/**
 * Reads an SSE body frame by frame. Frames are separated by a blank line and
 * may carry several `data:` lines, which concatenate.
 */
export async function readSSE(
  res: Response,
  onEvent: (data: string) => void,
): Promise<void> {
  if (!res.body) throw new Error("Response carried no body to stream.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      for (;;) {
        const m = /\r?\n\r?\n/.exec(buf);
        if (!m) break;
        const frame = buf.slice(0, m.index);
        buf = buf.slice(m.index + m[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n");
        if (data) onEvent(data);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Text a provider uses to mark a model as gone. No provider exposes a
 * lifecycle field, so the description is the only in-band signal there is.
 */
export const RETIRED_TEXT =
  /\b(deprecat|shut[\s-]?down|retired|discontinued|sunset|no longer (available|supported))/i;

/**
 * Newest-first by the version embedded in the id (`gemini-3.8-flash` -> 3.8,
 * `gpt-5.1` -> 5.1), then alphabetical. Recency is a proxy for "current", so
 * it decides ordering and which model is picked by default — never whether a
 * model is listed at all.
 */
export function byNewest(a: ModelOption, b: ModelOption): number {
  const version = (id: string) => {
    const m = id.match(/(\d+)(?:[._-](\d+))?/);
    return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0) : -1;
  };
  const delta = version(b.id) - version(a.id);
  return delta !== 0 ? delta : a.id.localeCompare(b.id);
}

/**
 * An exhausted API balance, as distinct from a rate limit. OpenAI reports it
 * as 429 `insufficient_quota` and Anthropic as a 400 — so status alone
 * misclassifies both, and telling someone to "wait and retry" a billing
 * problem sends them nowhere.
 */
const BILLING_TEXT =
  /credit balance is too low|insufficient_quota|exceeded your current quota|check your plan and billing|billing_not_active/i;

function hintFor(status: number, detail: string): string {
  if (BILLING_TEXT.test(detail)) {
    return (
      " — the API account is out of credit. API billing is separate from a Pro/Max/Plus" +
      " subscription; a subscription grants no API balance. Add credit in the provider console."
    );
  }
  if (status === 401 || status === 403) return " — check the API key is valid.";
  if (status === 404) return " — that model is not available to this key; pick another in the selector.";
  if (status === 429) return " — rate limited, wait and retry.";
  return "";
}

/** Turns a non-2xx response into an error a user can act on. */
export async function apiError(res: Response, provider: string): Promise<Error> {
  let detail = "";
  try {
    const body = await res.text();
    try {
      const j = JSON.parse(body);
      // Vendors disagree on the shape: `{error: {message}}` (OpenAI, Anthropic),
      // `{error: "text"}` (what ICA actually returns) and `{detail}` (what ICA's
      // own spec documents). Take whichever is present.
      detail =
        (typeof j?.error === "string" ? j.error : undefined) ??
        j?.error?.message ??
        j?.error?.status ??
        j?.detail ??
        j?.message ??
        body;
    } catch {
      detail = body;
    }
  } catch {
    detail = res.statusText;
  }
  return new Error(`${provider} ${res.status}: ${String(detail).slice(0, 400)}${hintFor(res.status, String(detail))}`);
}

/**
 * `fetch` rejects with an opaque TypeError when the browser blocks a request,
 * so name the likely cause rather than surfacing "Failed to fetch".
 */
export function networkError(provider: string, e: unknown): Error {
  if (e instanceof DOMException && e.name === "AbortError") return e;
  if (e instanceof Error && e.name === "AbortError") return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new Error(
    `${provider}: could not reach the API. Usually a browser CORS block, a bad key, or no network. (${msg})`,
  );
}
