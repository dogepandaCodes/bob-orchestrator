import {
  apiError,
  endpoint,
  networkError,
  readSSE,
  byNewest,
  RETIRED_TEXT,
  type Adapter,
  type ChatMessage,
  type Credential,
  type ModelOption,
} from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

function headers(key: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-goog-api-key": key,
  };
}

const PROBE_CONCURRENCY = 6;

/** Retirement, as distinct from "this method does not apply to this model". */
const RETIRED_BODY = /no longer available|has been (deprecated|retired|shut ?down)|is deprecated/i;

/**
 * `models.list` advertises models the key cannot call. Google keeps retired
 * ones in the catalog but 404s them for projects that never used them — "no
 * longer available to new users" — and exposes no lifecycle field, so the only
 * way to know is to ask.
 *
 * countTokens is free and non-generative. Only a definitive not-found removes
 * a model: a 429 or a dropped connection must not, or one rate limit would
 * silently empty the catalog.
 */
async function isCallable(cred: Credential, id: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint(cred, BASE)}/models/${encodeURIComponent(id)}:countTokens`, {
      method: "POST",
      headers: headers(cred.key),
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "." }] }] }),
      signal,
    });
    if (res.ok) return true;
    const body = await res.text().catch(() => "");
    // Keep unless the body explicitly says the model is gone. Google returns
    // 404 for two unrelated reasons, and "is not supported for countTokens"
    // only means the probe does not apply here — it says nothing about
    // whether we can stream from the model.
    return !RETIRED_BODY.test(body);
  } catch {
    return true;
  }
}

/**
 * A narrowing step must never empty a non-empty list. A filter that matches
 * nothing is a bug in the filter, not a fact about the catalog — and an empty
 * model selector is never the right answer.
 */
function narrow<T>(items: T[], keep: (item: T) => boolean): T[] {
  const kept = items.filter(keep);
  return kept.length > 0 ? kept : items;
}

/** Runs `fn` over `items` with a fixed number of workers, preserving order. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Gemini calls the assistant role "model". */
function toGemini(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text }],
  }));
}

export const gemini: Adapter = {
  id: "gemini",
  label: "Google",
  keyPlaceholder: "AIza…",
  keyUrl: "https://aistudio.google.com/app/apikey",

  fallbackModels: [
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
  ],

  async listModels(cred, signal) {
    let res: Response;
    try {
      res = await fetch(`${endpoint(cred, BASE)}/models?pageSize=200`, { headers: headers(cred.key), signal });
    } catch (e) {
      throw networkError("Gemini", e);
    }
    if (!res.ok) throw await apiError(res, "Gemini");
    const j = await res.json();
    const raw: any[] = j?.models ?? [];

    // Only `generateContent` is documented as a value here — the streaming
    // variant is a transport of it and is not listed, so filtering on
    // `streamGenerateContent` matches nothing. Accepting either still drops
    // embedding, imagen, veo and tts models without a family allowlist.
    const chat = narrow(raw, (m: any) => {
      const methods: string[] = m?.supportedGenerationMethods ?? [];
      return methods.includes("generateContent") || methods.includes("streamGenerateContent");
    });

    // Google leaves shut-down models in the catalog; displayName is the only
    // place it says so.
    const live = narrow(chat, (m: any) => !RETIRED_TEXT.test(String(m?.displayName ?? "")));

    const models: ModelOption[] = live
      .map((m: any) => ({
        // Names arrive as "models/gemini-2.5-pro"; the id is the tail.
        id: String(m.name ?? "").replace(/^models\//, ""),
        label: String(m.displayName ?? m.name ?? "").replace(/^models\//, ""),
      }))
      .filter((m: ModelOption) => m.id.length > 0)
      .sort(byNewest);

    // Metadata got us a shortlist; only the API knows what this key may call.
    const callable = await pool(models, PROBE_CONCURRENCY, (m) => isCallable(cred, m.id, signal));
    const survivors = models.filter((_, i) => callable[i]);

    // If the probe rejected everything, the probe is wrong, not the catalog.
    // An empty selector is never the right answer — fall back to the full list
    // and let a real refusal at send time retire models one at a time.
    return survivors.length > 0 ? survivors : models;
  },

  async stream({ cred, model, messages, system, effort, onText, onUsage, onModel, signal }) {
    const body = {
      contents: toGemini(messages),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      ...(effort ? { generationConfig: { thinkingConfig: { thinkingLevel: effort } } } : {}),
    };

    let res: Response;
    try {
      res = await fetch(`${endpoint(cred, BASE)}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: headers(cred.key),
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      throw networkError("Gemini", e);
    }
    if (!res.ok) throw await apiError(res, "Gemini");

    await readSSE(res, (data) => {
      let ev: any;
      try {
        ev = JSON.parse(data);
      } catch {
        return;
      }
      if (ev.error) throw new Error(`Gemini stream error: ${ev.error?.message ?? "unknown"}`);
      if (typeof ev?.modelVersion === "string" && ev.modelVersion) onModel?.(ev.modelVersion);
      for (const part of ev?.candidates?.[0]?.content?.parts ?? []) {
        if (typeof part?.text === "string" && part.text) onText(part.text);
      }
      // Repeated on every chunk with running totals; the last one wins.
      const u = ev?.usageMetadata;
      if (u) {
        onUsage?.({
          input: Number(u.promptTokenCount ?? 0),
          output: Number(u.candidatesTokenCount ?? 0),
          cacheRead: Number(u.cachedContentTokenCount ?? 0) || undefined,
        });
      }
    });
  },
};
