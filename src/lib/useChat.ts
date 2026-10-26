import { useCallback, useEffect, useState } from "react";
import { useRef } from "react";
import type { ProviderId } from "./themes";
import {
  EFFORT_LABEL,
  adapterFor,
  isEffortRejection,
  learnRejection,
  modelsFor,
  type ChatMessage,
  type Effort,
  type ModelOption,
  type StreamResult,
  type ToolRound,
  type ToolSpec,
  type Usage,
} from "./providers";
import type { KeyMap } from "./keys";
import { groundingPrompt, runTool, type Fact, type ToolOutcome } from "./bob";

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Which provider produced this turn — drives the avatar, not the theme. */
  provider: ProviderId;
  /** What was asked for. */
  model?: string;
  /** What the response says answered — absent when it named no model. */
  served?: string;
  /** The effort actually applied — absent when the model's default was used. */
  effort?: Effort;
  usage?: Usage;
  /** Something the user should know about how this reply was produced. */
  note?: string;
  error?: boolean;
  /** What Bob was asked while producing this reply, in order. */
  facts?: Fact[];
}

let seq = 0;
const nextId = () => `t${++seq}`;

/* ------------------------------------------------------------------ models */

const CACHE_KEY = "orchestrator.models.v2";
const CACHE_TTL = 60 * 60 * 1000;

interface CacheEntry {
  fp: string;
  at: number;
  models: ModelOption[];
}
type Cache = Partial<Record<ProviderId, CacheEntry>>;

/** Enough of the key to notice it changed, without storing it twice. */
const fingerprint = (key: string) => key.slice(-8);

function readCache(): Cache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Cache) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Cache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Non-fatal: the catalog is just re-resolved next load.
  }
}

/**
 * Resolving a catalog can be expensive — Gemini probes every candidate to find
 * out what the key may actually call. Seed the cache from whoever paid that
 * cost first (key verification) so it is not paid twice.
 */
export function primeModelCache(provider: ProviderId, key: string, models: ModelOption[]): void {
  if (models.length === 0) return;
  const cache = readCache();
  cache[provider] = { fp: fingerprint(key), at: Date.now(), models };
  writeCache(cache);
}

export function useModels(keys: KeyMap) {
  const [catalog, setCatalog] = useState<Partial<Record<ProviderId, ModelOption[]>>>({});

  useEffect(() => {
    const ctl = new AbortController();
    const cache = readCache();

    for (const id of Object.keys(keys) as ProviderId[]) {
      const cred = keys[id];
      if (!cred?.key) continue;

      const hit = cache[id];
      const fresh =
        hit &&
        hit.fp === fingerprint(cred.key) &&
        Date.now() - hit.at < CACHE_TTL &&
        hit.models.length > 0;

      if (fresh) {
        setCatalog((c) => ({ ...c, [id]: hit.models }));
        continue;
      }

      adapterFor(id, cred)
        .listModels(cred, ctl.signal)
        // A gateway returns every vendor's models; keep only this provider's.
        .then((all) => (cred.via ? modelsFor(id, all) : all))
        .then((models) => {
          if (models.length === 0) return;
          setCatalog((c) => ({ ...c, [id]: models }));
          primeModelCache(id, cred.key, models);
        })
        .catch(() => {
          // A failed catalog is not fatal — the fallback list still sends.
        });
    }
    return () => ctl.abort();
  }, [keys]);

  /**
   * Removes a model the provider rejected at call time. The probe cannot be
   * perfect, so a model that slips through is retired on first refusal rather
   * than offered again.
   */
  const dropModel = useCallback((provider: ProviderId, modelId: string) => {
    setCatalog((c) => {
      const list = c[provider];
      if (!list) return c;
      const next = list.filter((m) => m.id !== modelId);
      if (next.length === list.length) return c;

      // Keep the cache in step, or a reload resurrects it.
      const cache = readCache();
      const hit = cache[provider];
      if (hit) {
        cache[provider] = { ...hit, models: next };
        writeCache(cache);
      }
      return { ...c, [provider]: next };
    });
  }, []);

  return { catalog, dropModel };
}

/* -------------------------------------------------------------------- chat */

/** A refusal of the model itself, not of the request or the key. */
function isModelRejected(message: string): boolean {
  return (
    /\b404\b/.test(message) ||
    /no longer available|is not found|not found for|is not supported|does not exist/i.test(message)
  );
}

/** A refusal of the tools parameter — this model, through this gateway, can't call functions. */
function isToolsRejection(message: string): boolean {
  return /\b(400|422)\b/.test(message) && /\btools?\b|function[_ ]?call|tool_choice/i.test(message);
}

const NO_TOOLS_KEY = "orchestrator.noTools.v1";

function toolsRefused(model: string): boolean {
  try {
    const list = JSON.parse(localStorage.getItem(NO_TOOLS_KEY) ?? "[]");
    return Array.isArray(list) && list.includes(model);
  } catch {
    return false;
  }
}

function learnToolsRefusal(model: string): void {
  try {
    const list = JSON.parse(localStorage.getItem(NO_TOOLS_KEY) ?? "[]");
    const next = Array.isArray(list) ? list : [];
    if (!next.includes(model)) localStorage.setItem(NO_TOOLS_KEY, JSON.stringify([...next, model]));
  } catch {
    // Non-fatal: the next reply just asks again.
  }
}

/** Enough for any real question; a model still calling after this is looping. */
const MAX_TOOL_ROUNDS = 6;

/**
 * Bob runs cost real money and a fan-out multiplies them. This is the ceiling
 * for one reply — an implement/review cycle of three rounds plus a broad
 * question's worth of explorers fits under it.
 */
const MAX_TOOL_CALLS = 16;

/** What the chat needs to offer Bob to a model. */
export interface BobTools {
  specs: ToolSpec[];
  repo?: string;
  /** The server's playbook for leading the roles. */
  instructions?: string;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isAbort = (e: unknown) => e instanceof Error && e.name === "AbortError";

function addUsage(a: Usage, b: Usage): Usage {
  const out: Usage = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === "number") out[k as keyof Usage] = (out[k as keyof Usage] ?? 0) + v;
  }
  return out;
}

export function useChat(
  keys: KeyMap,
  onModelRejected?: (provider: ProviderId, model: string) => void,
  bob?: BobTools | null,
) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const clear = useCallback(() => {
    stop();
    setTurns([]);
  }, [stop]);

  const send = useCallback(
    async (text: string, provider: ProviderId, model: string, effort?: Effort) => {
      const cred = keys[provider];
      if (!cred?.key) return;

      const userTurn: Turn = { id: nextId(), role: "user", text, provider };
      const replyId = nextId();

      // The history sent upstream is everything before this reply, flattened to
      // the canonical shape — no vendor objects cross the boundary. What Bob
      // found earlier travels beside it as facts, for whichever model is next.
      let history: ChatMessage[] = [];
      let known: Fact[] = [];
      setTurns((prev) => {
        const next = [...prev, userTurn];
        history = next
          .filter((t) => !t.error && t.text.trim().length > 0)
          .map((t) => ({ role: t.role, text: t.text }));
        // Verbatim results stay true even if the reply around them failed.
        known = next.flatMap((t) => t.facts ?? []);
        return [...next, { id: replyId, role: "assistant", text: "", provider, model, effort }];
      });

      // Bob is offered through the ICA connection only, which always speaks the
      // OpenAI wire — the one adapter that implements tools.
      let useTools = Boolean(bob?.specs.length) && cred.via === "ica" && !toolsRefused(model);

      const ctl = new AbortController();
      abortRef.current = ctl;
      setStreaming(true);

      const patch = (fn: (t: Turn) => Turn) =>
        setTurns((prev) => prev.map((t) => (t.id === replyId ? fn(t) : t)));
      const addNote = (note: string) => patch((t) => ({ ...t, note: t.note ? `${t.note} ${note}` : note }));

      let written = 0; // characters of reply text so far — where the next trace sits
      let roundText = ""; // this round's words, replayed with its tool calls
      let newParagraph = false;
      const append = (chunk: string) => {
        if (!chunk) return;
        roundText += chunk;
        // Words after a tool call answer something new; don't run them on.
        if (newParagraph && written > 0) chunk = `\n\n${chunk}`;
        newParagraph = false;
        written += chunk.length;
        patch((t) => ({ ...t, text: t.text + chunk }));
      };

      // Each round is its own exchange with its own token count, and the reply
      // costs all of them. Within a round, fields land at different points in
      // the stream — merge, and skip undefined so a partial can't erase a total.
      let spent: Usage = {};
      let round: Usage = {};
      const mergeUsage = (u: Usage) => {
        for (const [k, v] of Object.entries(u)) {
          if (typeof v === "number") round[k as keyof Usage] = v;
        }
        const total = addUsage(spent, round);
        patch((t) => ({ ...t, usage: total }));
      };

      /** Throws away a refused first attempt, before anything was built on it. */
      const restart = () => {
        written = 0;
        roundText = "";
        spent = {};
        round = {};
        patch((t) => ({ ...t, text: "", usage: undefined }));
      };

      let applied = effort;
      const rounds: ToolRound[] = [];
      const request = () =>
        adapterFor(provider, cred).stream({
          cred,
          model,
          messages: history,
          system: groundingPrompt(known, useTools ? (bob?.repo ?? "the open project") : null, bob?.instructions),
          effort: applied,
          tools: useTools ? bob?.specs : undefined,
          rounds: useTools ? rounds : undefined,
          onText: append,
          onUsage: mergeUsage,
          onModel: (id) => patch((t) => (t.served === id ? t : { ...t, served: id })),
          signal: ctl.signal,
        });

      // The first request finds out what this model accepts; later rounds
      // inherit the answer.
      const opening = async (): Promise<StreamResult | void> => {
        for (;;) {
          try {
            return await request();
          } catch (e) {
            const message = errorText(e);
            // A refused effort level must not cost the reply: remember the
            // refusal so the selector stops offering it, and answer at the
            // model's default instead. Checked before the model-rejection test
            // below, whose "is not supported" would otherwise match OpenAI's
            // effort wording and delete the whole model from the catalog.
            if (applied && /\b400\b/.test(message) && isEffortRejection(message)) {
              learnRejection(provider, model, applied, message);
              addNote(`${EFFORT_LABEL[applied]} effort isn't accepted by ${model}, so this reply used the model's default.`);
              applied = undefined;
              restart();
              patch((t) => ({ ...t, effort: undefined }));
              continue;
            }
            // Likewise a model that can't take tools still gets to answer.
            if (useTools && isToolsRejection(message)) {
              learnToolsRefusal(model);
              addNote(`${model} can't call tools through ICA, so Bob wasn't consulted for this reply.`);
              useTools = false;
              restart();
              continue;
            }
            throw e;
          }
        }
      };

      try {
        let result = await opening();
        let ran = 0;
        for (let n = 1; ; n++) {
          const calls = useTools ? (result?.toolCalls ?? []) : [];
          if (calls.length === 0) break;
          if (n > MAX_TOOL_ROUNDS) {
            addNote(`Stopped after ${MAX_TOOL_ROUNDS} rounds of Bob calls — ask a follow-up to continue.`);
            break;
          }

          // All at once: a model asks for several in one turn when they are
          // independent — that is the fan-out. The server queues Bob runs past
          // its own limit, so this never floods the machine.
          const pending = calls.map(
            (call): Fact => ({ id: nextId(), tool: call.name, args: call.args, at: written, status: "running" }),
          );
          patch((t) => ({ ...t, facts: [...(t.facts ?? []), ...pending] }));
          const results: ToolRound["results"] = await Promise.all(
            calls.map(async (call, i) => {
              const fact = pending[i];
              const started = performance.now();
              let outcome: ToolOutcome;
              if (++ran > MAX_TOOL_CALLS) {
                outcome = {
                  text: `Not run: this reply has used its ${MAX_TOOL_CALLS} tool calls. Answer with what you have and tell the user what is still open.`,
                  isError: true,
                };
              } else {
                try {
                  outcome = await runTool(call, ctl.signal);
                } catch (e) {
                  if (isAbort(e)) throw e;
                  // The model hears about a broken bridge and can answer without it.
                  outcome = { text: errorText(e), isError: true };
                }
              }
              const settled: Fact = {
                ...fact,
                status: outcome.isError ? "error" : "done",
                result: outcome.text,
                ms: Math.round(performance.now() - started),
                trace: outcome.trace,
              };
              patch((t) => ({ ...t, facts: (t.facts ?? []).map((f) => (f.id === fact.id ? settled : f)) }));
              return { id: call.id, content: outcome.isError ? `Error: ${outcome.text}` : outcome.text };
            }),
          );

          rounds.push({ text: roundText, calls, results });
          roundText = "";
          newParagraph = true;
          spent = addUsage(spent, round);
          round = {};
          result = await request();
        }
      } catch (e) {
        if (!isAbort(e)) {
          const message = errorText(e);
          if (!isEffortRejection(message) && !isToolsRejection(message) && isModelRejected(message)) {
            onModelRejected?.(provider, model);
          }
          patch((t) => ({ ...t, text: message, error: true }));
        }
      } finally {
        // A call cut short by Stop never returned anything — it is not a fact.
        patch((t) =>
          t.facts?.some((f) => f.status === "running")
            ? { ...t, facts: t.facts.map((f) => (f.status === "running" ? { ...f, status: "stopped" } : f)) }
            : t,
        );
        // Drop an assistant turn that never produced anything (a clean abort).
        setTurns((prev) =>
          prev.filter((t) => !(t.id === replyId && t.text.length === 0 && !t.facts?.length)),
        );
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [keys, onModelRejected, bob],
  );

  return { turns, streaming, send, stop, clear };
}
