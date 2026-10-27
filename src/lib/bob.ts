import { useCallback, useEffect, useState } from "react";
import type { ToolCall, ToolSpec } from "./providers";

/**
 * The page's way to Bob: the dev server's /bob-api bridge, which speaks MCP to
 * the same Orchestrator server Claude Code runs (mcp/server.mjs). See
 * `bobBridge` in vite.config.ts.
 */
const API = "/bob-api";

export type SecurityLevel = "none" | "restricted" | "private";

/** A change the Implementer made in its own worktree — mcp/changes.mjs. */
export interface BobChange {
  id: string;
  status: "open" | "applied" | "discarded";
  task: string;
  created: string;
  updated: string;
  rounds: number;
  review: { round: number; verdict: "approve" | "changes_requested" | null; blocker: number; major: number; minor: number } | null;
  branch: string;
  worktree: string;
}

/** A folder Bob can work in — mcp/workspace.mjs. */
export interface BobRepo {
  path: string;
  /** The path with the home folder shown as ~. */
  display: string;
  name: string;
  exists: boolean;
  git: boolean;
}

/** The server's own report — `orchestrator/status` in mcp/server.mjs. */
export interface BobStatus {
  server: { name: string; version: string };
  repo: string;
  /** Changes need git: the Implementer works in a worktree. */
  git: boolean;
  /** The current repo and the recently used ones, newest first. */
  repos: { current: BobRepo; recent: BobRepo[] };
  security: SecurityLevel;
  levels: SecurityLevel[];
  bob: { installed: boolean; version: string | null; keySet: boolean };
  /** The Bob plugin holding the roles, installed by the server from mcp/roles/. */
  roles: { path: string; installed: boolean; current: boolean; roles: string[] };
  tools: string[];
  /** How the orchestrator should lead the roles — the server's MCP instructions. */
  instructions: string;
  changes: BobChange[];
}

/** `_meta["orchestrator/trace"]`: who answered, and what the filter did. */
export interface BobTrace {
  source?: "bob" | "scanner";
  /** The repo the call read — fixed when it started, whatever happened after. */
  repo?: string;
  security?: SecurityLevel;
  blocked?: boolean;
  redactions?: number;
  duration_ms?: number;
  /** Bob Shell 2.0.5 reports cost and tool calls, not tokens; tokens kept for later versions. */
  tool_calls?: number;
  /** Cumulative for the task — a resumed agent's cost includes its earlier rounds. */
  session_costs?: number;
  total_tokens?: number;
  role?: "explorer" | "verifier" | "implementer" | "reviewer";
  task_id?: string;
  change_id?: string;
  round?: number;
  verdict?: "approve" | "changes_requested" | null;
  /** Citations in the report, and how many held up against the code. */
  cited?: number;
  verified?: number;
  files?: number;
  insertions?: number;
  deletions?: number;
}

/**
 * A tool result, kept verbatim — the handoff record's groundedFacts[]. It
 * rides on the reply that fetched it and is replayed to whichever model
 * answers next, so a switch mid-thread keeps what Bob found. See "Provider
 * handoff" in context/CLAUDE.md.
 */
export interface Fact {
  id: string;
  tool: string;
  args: string;
  /** How much of the reply's text came before the call — where its trace sits. */
  at: number;
  status: "running" | "done" | "error" | "stopped";
  result?: string;
  ms?: number;
  trace?: BobTrace;
}

export interface ToolOutcome {
  text: string;
  isError: boolean;
  trace?: BobTrace;
}

/**
 * Facts replay on every later request. A diff or a long report is worth having
 * once, not resent in full forever after — the agent can always be asked again.
 */
const MAX_REPLAYED_FACT = 12_000;
const clipFact = (text: string) =>
  text.length <= MAX_REPLAYED_FACT
    ? text
    : `${text.slice(0, MAX_REPLAYED_FACT)}\n… (${text.length - MAX_REPLAYED_FACT} more characters, not repeated here — call the tool again for them)`;

/** Bob is ready to answer, not merely reachable. */
export const bobReady = (s: BobStatus | null) => Boolean(s?.bob.installed && s.bob.keySet);

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Bob bridge ${res.status}`);
  // A build without the dev server answers with the app's HTML, not JSON.
  if (!body || typeof body !== "object") throw new Error("The Bob bridge isn't running — it lives in the dev server.");
  return body as T;
}

const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }).then((r) => parse<T>(r));

/**
 * MCP schemas are written for MCP clients. Models behind a gateway are pickier:
 * Gemini's function declarations reject `additionalProperties`, and an object
 * with no `properties` at all. Neither changes what the tool accepts.
 */
function forModel(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { type: "object", properties: {} };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "additionalProperties" || k === "title" || k === "$schema") continue;
    if (k === "properties" && v && typeof v === "object") {
      out[k] = Object.fromEntries(Object.entries(v).map(([name, sub]) => [name, forModel(sub)]));
    } else {
      out[k] = v;
    }
  }
  if (out.type === "object" && !out.properties) out.properties = {};
  return out;
}

export async function fetchTools(signal?: AbortSignal): Promise<ToolSpec[]> {
  const res = await parse<{ tools?: any[] }>(await fetch(`${API}/tools`, { signal }));
  return (res.tools ?? []).map((t) => ({
    name: String(t.name),
    description: String(t.description ?? ""),
    parameters: forModel(t.inputSchema),
  }));
}

export async function runTool(call: ToolCall, signal?: AbortSignal): Promise<ToolOutcome> {
  let args: unknown;
  try {
    args = call.args.trim() ? JSON.parse(call.args) : {};
  } catch {
    return { text: `The arguments were not valid JSON: ${call.args.slice(0, 200)}`, isError: true };
  }
  const result = await post<any>("/call", { name: call.name, arguments: args }, signal);
  const text =
    (result?.content ?? [])
      .filter((c: any) => c?.type === "text")
      .map((c: any) => String(c.text))
      .join("\n") || "(no output)";
  return { text, isError: Boolean(result?.isError), trace: result?._meta?.["orchestrator/trace"] };
}

/**
 * The system prompt that carries Bob into a request: an introduction when the
 * tools are on offer, and every fact gathered so far — whether or not this
 * model can call tools itself, which is what lets a fact survive a switch.
 */
export function groundingPrompt(
  facts: Fact[],
  { repo, tools, instructions }: { repo?: string | null; tools: boolean; instructions?: string },
): string | undefined {
  const parts: string[] = [];
  if (tools) {
    parts.push(
      `The user's repository is ${repo ?? "the open project"}. When a question depends on that code, use the tools rather than guessing. ` +
        "Results have already passed the user's security filter; text marked «redacted» was removed on purpose.",
    );
    // The server's playbook, so the chat leads the roles the way Claude Code does.
    if (instructions) parts.push(instructions);
  }

  // The latest answer to the same question wins; older ones are just noise.
  // A fact about another repo isn't a fact about this one — after a switch on
  // the Bob page, only what was read here still applies.
  const latest = new Map<string, Fact>();
  for (const f of facts) {
    if (f.status !== "done" || !f.result) continue;
    if (repo && f.trace?.repo && f.trace.repo !== repo) continue;
    latest.set(`${f.tool} ${f.args}`, f);
  }
  if (latest.size) {
    parts.push(
      "Facts Bob returned earlier in this conversation, verbatim. They held when fetched; " +
        "call again if the user says the code has changed.\n\n" +
        [...latest.values()].map((f) => `### ${f.tool} ${f.args || "{}"}\n${clipFact(f.result ?? "")}`).join("\n\n"),
    );
  }
  return parts.length ? parts.join("\n\n") : undefined;
}

export function useBob() {
  const [status, setStatus] = useState<BobStatus | null>(null);
  const [specs, setSpecs] = useState<ToolSpec[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    try {
      const [s, t] = await Promise.all([
        fetch(`${API}/status`, { signal }).then((r) => parse<BobStatus>(r)),
        fetchTools(signal),
      ]);
      setStatus(s);
      setSpecs(t);
      setError(null);
    } catch (e) {
      if (signal?.aborted) return;
      setStatus(null);
      setSpecs([]);
      setError(e instanceof Error ? e.message : String(e));
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    void refresh(ctl.signal);
    // Installing Bob Shell or exporting a key happens in another window, so
    // look again whenever the user comes back to this one.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      ctl.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const setSecurity = useCallback(async (level: SecurityLevel) => {
    setStatus(await post<BobStatus>("/security", { level }));
  }, []);

  // Changes move on their own — every implement_change makes or advances one —
  // so they are fetched apart from the rest of the status.
  const reloadChanges = useCallback(async () => {
    const { changes } = await fetch(`${API}/changes`).then((r) => parse<{ changes: BobChange[] }>(r));
    setStatus((s) => (s ? { ...s, changes } : s));
  }, []);

  /** The user's call, never a model's: writes the change into their checkout. */
  const decideChange = useCallback(async (id: string, decision: "apply" | "discard") => {
    const { changes } = await post<{ changes: BobChange[] }>(`/changes/${decision}`, { id });
    setStatus((s) => (s ? { ...s, changes } : s));
  }, []);

  /**
   * Switches every tool to another folder. The tool list follows, since the
   * change tools exist only where git does.
   */
  const selectRepo = useCallback(async (path: string) => {
    setStatus(await post<BobStatus>("/repos/select", { path }));
    setSpecs(await fetchTools());
  }, []);

  /** The OS's own folder dialog, opened by the server. Null when the user cancels. */
  const chooseRepo = useCallback(async () => {
    const { path } = await post<{ path: string | null }>("/repos/choose", {});
    if (path) await selectRepo(path);
    return path;
  }, [selectRepo]);

  return { status, specs, error, checking, refresh, setSecurity, reloadChanges, decideChange, selectRepo, chooseRepo };
}
