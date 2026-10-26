import type { ProviderId } from "../themes";
import { anthropic } from "./anthropic";
import { openai } from "./openai";
import { gemini } from "./gemini";
import type { Adapter } from "./types";

export const ADAPTERS: Record<ProviderId, Adapter> = {
  claude: anthropic,
  chatgpt: openai,
  gemini,
};

export * from "./types";
