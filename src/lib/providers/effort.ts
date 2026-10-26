import type { ProviderId } from "../themes";

/**
 * How hard a model thinks before answering. Every provider exposes this, but
 * under a different name, with a different vocabulary, per model:
 *
 * - Claude   `output_config.effort`          low … max
 * - ChatGPT  `reasoning_effort`              none … max, model-dependent
 * - Gemini   `thinkingConfig.thinkingLevel`  minimal … high, model-dependent
 *
 * Through a gateway (ICA) everything travels in OpenAI's format, so all three
 * send `reasoning_effort` and rely on the gateway to translate.
 */
export type Effort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export const EFFORT_LABEL: Record<Effort, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

/** Strips a gateway vendor prefix: `anthropic/claude-opus-5` → `claude-opus-5`. */
const bare = (id: string) => id.toLowerCase().replace(/^.*\//, "");

/**
 * The levels a model is documented to accept, or null when it takes none.
 * Anything not documented is left out rather than guessed: an unsupported
 * value is a hard 400 on every provider.
 */
function documented(provider: ProviderId, modelId: string): Effort[] | null {
  const id = bare(modelId);

  if (provider === "claude") {
    // Haiku 4.5 rejects effort outright.
    if (/haiku/.test(id)) return null;
    if (/opus-4-6|sonnet-4-6/.test(id)) return ["low", "medium", "high", "max"];
    if (/opus-5|sonnet-5|fable|mythos|opus-4-[78]/.test(id)) return ["low", "medium", "high", "xhigh", "max"];
    return null;
  }

  if (provider === "gemini") {
    if (/3\.6-flash|3\.5-flash-lite/.test(id)) return ["minimal", "low", "medium", "high"];
    if (/gemini-(3|2\.5)/.test(id)) return ["low", "medium", "high"];
    return null;
  }

  // OpenAI publishes no per-model table. Reasoning families accept a subset of
  // none…max; the full vocabulary is offered and narrowed by what each model
  // rejects (see learnRejection). `none` is withheld: it is documented as a
  // 400 on the newest model, and "don't think" is not an effort level anyway.
  if (/^(o\d|gpt-5|gpt-6)/.test(id)) return ["minimal", "low", "medium", "high", "xhigh", "max"];
  return null; // gpt-4o, gpt-4.1… are not reasoning models
}

/* ---------------------------------------------------------------- learning */

const STORE = "orchestrator.effort.v1";
type Learned = Record<string, Effort[]>;

function readLearned(): Learned {
  try {
    const raw = localStorage.getItem(STORE);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Learned) : {};
  } catch {
    return {};
  }
}

function writeLearned(l: Learned): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(l));
  } catch {
    // Non-fatal: the model is simply re-learned next session.
  }
}

const learnKey = (provider: ProviderId, modelId: string) => `${provider}:${modelId}`;

/** Levels to offer for a model: documented, narrowed by anything it rejected. */
export function effortLevels(provider: ProviderId, modelId: string): Effort[] | null {
  const base = documented(provider, modelId);
  if (!base) return null;
  const learned = readLearned()[learnKey(provider, modelId)];
  if (!learned) return base;
  const narrowed = base.filter((e) => learned.includes(e));
  return narrowed.length > 0 ? narrowed : null;
}

/**
 * The level selected until the user picks one: Medium, which every documented
 * list includes. Should a model have refused Medium, the middle of what it
 * still accepts — never a level it is known to reject.
 */
export function defaultEffort(levels: Effort[]): Effort {
  return levels.includes("medium") ? "medium" : levels[Math.floor(levels.length / 2)];
}

/** True when an error is about the effort setting rather than the model. */
export function isEffortRejection(message: string): boolean {
  return /reasoning[_ ]effort|output_config|thinking[_ ]?level|thinkingconfig|\beffort\b/i.test(message);
}

const ALL: Effort[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

/**
 * Records that a model refused `tried`. OpenAI's 400 usually lists what the
 * model does accept ("Supported values are: 'low', 'medium', and 'high'") —
 * when it does, keep exactly that; otherwise just drop the level that failed.
 */
export function learnRejection(provider: ProviderId, modelId: string, tried: Effort, message: string): void {
  const current = effortLevels(provider, modelId) ?? [];
  const tail = message.split(/supported values? (?:are|is)/i)[1] ?? "";
  const listed = ALL.filter((e) => new RegExp(`['"\`]${e}['"\`]`).test(tail));
  const next = listed.length > 0 ? current.filter((e) => listed.includes(e)) : current.filter((e) => e !== tried);
  const l = readLearned();
  l[learnKey(provider, modelId)] = next;
  writeLearned(l);
}
