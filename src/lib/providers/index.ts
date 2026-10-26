import type { ProviderId } from "../themes";
import { anthropic } from "./anthropic";
import { openai } from "./openai";
import { gemini } from "./gemini";
import type { Adapter, Credential, Wire } from "./types";

/** Per-provider metadata: labels, key links, fallback models. */
export const ADAPTERS: Record<ProviderId, Adapter> = {
  claude: anthropic,
  chatgpt: openai,
  gemini,
};

/** Each provider's own format, used when a credential does not name one. */
export const NATIVE_WIRE: Record<ProviderId, Wire> = {
  claude: "anthropic",
  chatgpt: "openai",
  gemini: "gemini",
};

const BY_WIRE: Record<Wire, Adapter> = { anthropic, openai, gemini };

/**
 * The adapter that actually talks to the wire. Behind a gateway this can differ
 * from the provider — Gemini served over an OpenAI-compatible endpoint uses the
 * OpenAI adapter while still appearing, themed and badged, as Gemini.
 */
export function adapterFor(provider: ProviderId, cred?: Credential): Adapter {
  return BY_WIRE[cred?.wire ?? NATIVE_WIRE[provider]];
}

export function adapterForWire(wire: Wire): Adapter {
  return BY_WIRE[wire];
}

export { providerOfModel, modelsFor } from "./classify";
export * from "./types";
export { EFFORT_LABEL, defaultEffort, effortLevels, isEffortRejection, learnRejection, type Effort } from "./effort";
