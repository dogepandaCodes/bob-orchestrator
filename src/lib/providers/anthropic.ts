import {
  apiError,
  endpoint,
  networkError,
  readSSE,
  byNewest,
  type Adapter,
  type ChatMessage,
  type Credential,
  type ModelOption,
} from "./types";

const BASE = "https://api.anthropic.com/v1";
const MAX_TOKENS = 16000;

function headers(cred: Credential): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": cred.key,
    "anthropic-version": "2023-06-01",
    // Required for direct browser calls — without it the request is rejected.
    "anthropic-dangerous-direct-browser-access": "true",
  };
  // An organization-scoped key works across workspaces, so it has to name one.
  // A workspace-scoped key already implies its workspace and needs no header,
  // so only send this when the user actually supplied an id.
  if (cred.workspaceId) h["anthropic-workspace-id"] = cred.workspaceId;
  return h;
}

/** Anthropic requires the first message to be `user`. */
function toAnthropic(messages: ChatMessage[]) {
  const out = messages.map((m) => ({ role: m.role, content: m.text }));
  while (out.length > 0 && out[0].role !== "user") out.shift();
  return out;
}

export const anthropic: Adapter = {
  id: "claude",
  label: "Anthropic",
  keyPlaceholder: "sk-ant-…",
  keyUrl: "https://console.anthropic.com/settings/keys",
  supportsWorkspace: true,

  fallbackModels: [
    { id: "claude-opus-5", label: "Claude Opus 5" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],

  async listModels(cred, signal) {
    let res: Response;
    try {
      res = await fetch(`${endpoint(cred, BASE)}/models?limit=100`, { headers: headers(cred), signal });
    } catch (e) {
      throw networkError("Anthropic", e);
    }
    if (!res.ok) throw await apiError(res, "Anthropic");
    const j = await res.json();
    const models: ModelOption[] = (j?.data ?? [])
      .map((m: any) => ({ id: String(m.id), label: String(m.display_name ?? m.id) }))
      .sort(byNewest);
    return models;
  },

  async stream({ cred, model, messages, system, effort, onText, onUsage, onModel, signal }) {
    const body = {
      model,
      max_tokens: MAX_TOKENS,
      stream: true,
      ...(system ? { system } : {}),
      ...(effort ? { output_config: { effort } } : {}),
      messages: toAnthropic(messages),
    };

    let res: Response;
    try {
      res = await fetch(`${endpoint(cred, BASE)}/messages`, {
        method: "POST",
        headers: headers(cred),
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      throw networkError("Anthropic", e);
    }
    if (!res.ok) throw await apiError(res, "Anthropic");

    await readSSE(res, (data) => {
      let ev: any;
      try {
        ev = JSON.parse(data);
      } catch {
        return;
      }
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        onText(String(ev.delta.text ?? ""));
      } else if (ev.type === "message_start") {
        if (ev.message?.model) onModel?.(String(ev.message.model));
        // Input is known up front; output only becomes final at message_delta.
        const u = ev.message?.usage;
        if (u) {
          onUsage?.({
            input: Number(u.input_tokens ?? 0),
            cacheRead: Number(u.cache_read_input_tokens ?? 0) || undefined,
          });
        }
      } else if (ev.type === "message_delta" && ev.usage) {
        onUsage?.({ output: Number(ev.usage.output_tokens ?? 0) });
      } else if (ev.type === "error") {
        throw new Error(`Anthropic stream error: ${ev.error?.message ?? "unknown"}`);
      }
    });
  },
};
