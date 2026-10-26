import { useCallback, useEffect, useState } from "react";
import { useRef } from "react";
import type { ProviderId } from "./themes";
import { ADAPTERS, type ChatMessage, type ModelOption, type Usage } from "./providers";
import type { KeyMap } from "./keys";

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Which provider produced this turn — drives the avatar, not the theme. */
  provider: ProviderId;
  model?: string;
  usage?: Usage;
  error?: boolean;
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

      ADAPTERS[id]
        .listModels(cred, ctl.signal)
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

export function useChat(
  keys: KeyMap,
  onModelRejected?: (provider: ProviderId, model: string) => void,
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
    async (text: string, provider: ProviderId, model: string) => {
      const cred = keys[provider];
      if (!cred?.key) return;

      const userTurn: Turn = { id: nextId(), role: "user", text, provider };
      const replyId = nextId();

      // The history sent upstream is everything before this reply, flattened to
      // the canonical shape — no vendor objects cross the boundary.
      let history: ChatMessage[] = [];
      setTurns((prev) => {
        const next = [...prev, userTurn];
        history = next
          .filter((t) => !t.error && t.text.trim().length > 0)
          .map((t) => ({ role: t.role, text: t.text }));
        return [...next, { id: replyId, role: "assistant", text: "", provider, model }];
      });

      const ctl = new AbortController();
      abortRef.current = ctl;
      setStreaming(true);

      const append = (chunk: string) =>
        setTurns((prev) =>
          prev.map((t) => (t.id === replyId ? { ...t, text: t.text + chunk } : t)),
        );

      // Fields land at different points in the stream, so merge rather than
      // replace — and skip undefined so a later partial cannot erase a total.
      const mergeUsage = (u: Usage) =>
        setTurns((prev) =>
          prev.map((t) => {
            if (t.id !== replyId) return t;
            const next: Usage = { ...t.usage };
            for (const [k, v] of Object.entries(u)) {
              if (typeof v === "number") next[k as keyof Usage] = v;
            }
            return { ...t, usage: next };
          }),
        );

      try {
        await ADAPTERS[provider].stream({
          cred,
          model,
          messages: history,
          onText: append,
          onUsage: mergeUsage,
          signal: ctl.signal,
        });
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        if (!aborted) {
          const message = e instanceof Error ? e.message : String(e);
          if (isModelRejected(message)) onModelRejected?.(provider, model);
          setTurns((prev) =>
            prev.map((t) =>
              t.id === replyId ? { ...t, text: message, error: true } : t,
            ),
          );
        }
      } finally {
        // Drop an assistant turn that never produced anything (a clean abort).
        setTurns((prev) =>
          prev.filter((t) => !(t.id === replyId && t.text.length === 0)),
        );
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [keys, onModelRejected],
  );

  return { turns, streaming, send, stop, clear };
}
