import type { ProviderId } from "../themes";
import type { ModelOption } from "./types";

/**
 * A gateway serves one mixed catalog — Anthropic, OpenAI, Google, watsonx and
 * more, side by side. The app is built around three providers, so each model
 * has to be sorted into one of them or left out.
 *
 * Matches anywhere in the id or label, so vendor-prefixed ids like
 * `anthropic/claude-sonnet-5` or `openai/gpt-5.1` sort the same as bare ones.
 * Anything that fits none — IBM Granite, Llama, Mistral on watsonx — returns
 * null and is dropped: there is no fourth provider for it to live under.
 */
const RULES: Array<[ProviderId, RegExp]> = [
  ["claude", /claude|anthropic/i],
  ["gemini", /gemini|google/i],
  // Anchored: a bare `o\d` anywhere would catch unrelated names.
  ["chatgpt", /(^|[/:])(gpt|o\d|chatgpt)\b|\bopenai\b/i],
];

// Open-weight models that borrow an OpenAI or Google name but are not served
// by that vendor's own API, and should not wear its badge.
const NOT_FIRST_PARTY = /gpt-oss|gemma/i;

export function providerOfModel(model: ModelOption): ProviderId | null {
  const text = `${model.id} ${model.label}`;
  if (NOT_FIRST_PARTY.test(text)) return null;
  for (const [provider, pattern] of RULES) {
    if (pattern.test(text)) return provider;
  }
  return null;
}

/** The slice of a mixed catalog that belongs to one provider. */
export function modelsFor(provider: ProviderId, catalog: ModelOption[]): ModelOption[] {
  return catalog.filter((m) => providerOfModel(m) === provider);
}
