import {
  apiError,
  byNewest,
  networkError,
  readSSE,
  type Adapter,
  type ChatMessage,
  type ModelOption,
} from "./types";

const BASE = "https://api.openai.com/v1";

function headers(key: string): Record<string, string> {
  return {
    "content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

function toOpenAI(messages: ChatMessage[], system?: string) {
  const out: Array<{ role: string; content: string }> = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) out.push({ role: m.role, content: m.text });
  return out;
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
      res = await fetch(`${BASE}/models`, { headers: headers(cred.key), signal });
    } catch (e) {
      throw networkError("OpenAI", e);
    }
    if (!res.ok) throw await apiError(res, "OpenAI");
    const j = await res.json();
    // The catalog carries embeddings, audio and image models too — keep the
    // chat-completions families only.
    const models: ModelOption[] = (j?.data ?? [])
      .map((m: any) => String(m.id))
      .filter((id: string) => /^(gpt|o\d|chatgpt)/i.test(id))
      .filter((id: string) => !/(embed|audio|tts|whisper|image|realtime|moderation|transcribe|search|instruct)/i.test(id))
      // Dated snapshots duplicate the rolling alias they pin, and the old ones
      // linger long after the alias has moved on.
      .filter((id: string) => !/-(\d{4}-\d{2}-\d{2}|\d{4})$/.test(id))
      .map((id: string) => ({ id, label: id }))
      .sort(byNewest);
    return models;
  },

  async stream({ cred, model, messages, system, onText, onUsage, signal }) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: headers(cred.key),
        body: JSON.stringify({
          model,
          stream: true,
          // Usage is omitted from streamed responses unless asked for.
          stream_options: { include_usage: true },
          messages: toOpenAI(messages, system),
        }),
        signal,
      });
    } catch (e) {
      throw networkError("OpenAI", e);
    }
    if (!res.ok) throw await apiError(res, "OpenAI");

    await readSSE(res, (data) => {
      if (data === "[DONE]") return;
      let ev: any;
      try {
        ev = JSON.parse(data);
      } catch {
        return;
      }
      if (ev.error) throw new Error(`OpenAI stream error: ${ev.error?.message ?? "unknown"}`);
      const delta = ev?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) onText(delta);
      // Arrives once, on a final chunk that carries no choices.
      if (ev.usage) {
        onUsage?.({
          input: Number(ev.usage.prompt_tokens ?? 0),
          output: Number(ev.usage.completion_tokens ?? 0),
          cacheRead: Number(ev.usage.prompt_tokens_details?.cached_tokens ?? 0) || undefined,
        });
      }
    });
  },
};
