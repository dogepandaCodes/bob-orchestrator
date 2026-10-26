import {
  apiError,
  endpoint,
  byNewest,
  networkError,
  readSSE,
  type Adapter,
  type ChatMessage,
  type ModelOption,
  type ToolCall,
  type ToolRound,
} from "./types";

const BASE = "https://api.openai.com/v1";

function headers(key: string): Record<string, string> {
  return {
    "content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

type WireMessage = {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

function toOpenAI(messages: ChatMessage[], system?: string, rounds: ToolRound[] = []) {
  const out: WireMessage[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) out.push({ role: m.role, content: m.text });
  for (const r of rounds) {
    out.push({
      role: "assistant",
      // null, not "": a gateway translating to Anthropic turns "" into an empty
      // text block, which Anthropic refuses.
      content: r.text || null,
      tool_calls: r.calls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.args || "{}" },
      })),
    });
    for (const res of r.results) out.push({ role: "tool", tool_call_id: res.id, content: res.content });
  }
  return out;
}

/**
 * Tool calls arrive in fragments — the id and name once, the arguments as JSON
 * text split across chunks — keyed by `index`. Gateways that translate from
 * another vendor are looser (whole calls per chunk, sometimes no index), so fall
 * back to the id to tell one call from the next.
 */
function collectToolCall(calls: ToolCall[], part: any): void {
  const byId = part?.id ? calls.findIndex((c) => c.id === part.id) : -1;
  const slot =
    typeof part?.index === "number"
      ? part.index
      : byId >= 0
        ? byId
        : part?.id || calls.length === 0
          ? calls.length
          : calls.length - 1;
  const call = (calls[slot] ??= { id: "", name: "", args: "" });
  if (part?.id) call.id = String(part.id);
  if (part?.function?.name) call.name = String(part.function.name);
  const args = part?.function?.arguments;
  if (typeof args === "string") call.args += args;
  else if (args && typeof args === "object") call.args = JSON.stringify(args);
}

export const openai: Adapter = {
  id: "chatgpt",
  label: "OpenAI",
  keyPlaceholder: "sk-…",
  keyUrl: "https://platform.openai.com/api-keys",

  // Static only until the key loads the live catalog, which is authoritative.
  fallbackModels: [
    { id: "gpt-5.1", label: "GPT-5.1" },
    { id: "gpt-5-mini", label: "GPT-5 mini" },
  ],

  async listModels(cred, signal) {
    let res: Response;
    try {
      res = await fetch(`${endpoint(cred, BASE)}/models`, { headers: headers(cred.key), signal });
    } catch (e) {
      throw networkError("OpenAI", e);
    }
    if (!res.ok) throw await apiError(res, "OpenAI");
    const j = await res.json();
    // The catalog carries embeddings, audio and image models too — keep the
    // chat-completions families only.
    const ids: string[] = (j?.data ?? []).map((m: any) => String(m.id));

    // Behind a gateway this endpoint serves every vendor's models at once. The
    // OpenAI-only allowlist below would strip the Claude and Gemini ones before
    // the classifier could sort them — so only drop what is plainly not chat.
    if (cred.baseUrl) {
      return (j?.data ?? [])
        // ICA sends a display `name` alongside the id; `owned_by` is always
        // "ica", so it says nothing about the vendor.
        .map((m: any) => ({ id: String(m.id ?? ""), label: String(m.name || m.id || "") }))
        .filter((m: ModelOption) => m.id && !/(embed|audio|tts|whisper|image|realtime|moderation|transcribe|rerank|guard)/i.test(m.id))
        .sort(byNewest);
    }

    const models: ModelOption[] = ids
      .filter((id: string) => /^(gpt|o\d|chatgpt)/i.test(id))
      .filter((id: string) => !/(embed|audio|tts|whisper|image|realtime|moderation|transcribe|search|instruct)/i.test(id))
      // Dated snapshots duplicate the rolling alias they pin, and the old ones
      // linger long after the alias has moved on.
      .filter((id: string) => !/-(\d{4}-\d{2}-\d{2}|\d{4})$/.test(id))
      .map((id: string) => ({ id, label: id }))
      .sort(byNewest);
    return models;
  },

  async stream({ cred, model, messages, system, effort, onText, onUsage, onModel, tools, rounds, signal }) {
    let res: Response;
    try {
      res = await fetch(`${endpoint(cred, BASE)}/chat/completions`, {
        method: "POST",
        headers: headers(cred.key),
        body: JSON.stringify({
          model,
          stream: true,
          // Usage is omitted from OpenAI's streamed responses unless asked for.
          // A gateway may not know the option (ICA's spec does not list it), and
          // a strict validator would 400 the whole chat over a cosmetic field.
          ...(cred.baseUrl ? {} : { stream_options: { include_usage: true } }),
          // Through a gateway this carries effort for Claude and Gemini too; the
          // gateway translates it into their native setting.
          ...(effort ? { reasoning_effort: effort } : {}),
          ...(tools?.length
            ? {
                tools: tools.map((t) => ({
                  type: "function",
                  function: { name: t.name, description: t.description, parameters: t.parameters },
                })),
              }
            : {}),
          messages: toOpenAI(messages, system, rounds),
        }),
        signal,
      });
    } catch (e) {
      throw networkError("OpenAI", e);
    }
    if (!res.ok) throw await apiError(res, "OpenAI");

    const calls: ToolCall[] = [];
    await readSSE(res, (data) => {
      if (data === "[DONE]") return;
      let ev: any;
      try {
        ev = JSON.parse(data);
      } catch {
        return;
      }
      if (ev.error) throw new Error(`OpenAI stream error: ${ev.error?.message ?? "unknown"}`);
      if (typeof ev.model === "string" && ev.model) onModel?.(ev.model);
      const delta = ev?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) onText(delta);
      const toolParts = ev?.choices?.[0]?.delta?.tool_calls;
      if (Array.isArray(toolParts)) for (const part of toolParts) collectToolCall(calls, part);
      // Arrives once, on a final chunk that carries no choices.
      if (ev.usage) {
        onUsage?.({
          input: Number(ev.usage.prompt_tokens ?? 0),
          output: Number(ev.usage.completion_tokens ?? 0),
          cacheRead: Number(ev.usage.prompt_tokens_details?.cached_tokens ?? 0) || undefined,
        });
      }
    });

    const toolCalls = calls
      .filter((c) => c?.name)
      .map((c, i) => ({ ...c, id: c.id || `call_${i}` }));
    return toolCalls.length ? { toolCalls } : {};
  },
};
