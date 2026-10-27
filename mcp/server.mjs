#!/usr/bin/env node
/**
 * Orchestrator MCP server — stdio transport.
 *
 * Protocol: JSON-RPC 2.0, newline-delimited UTF-8, one message per line
 * (MCP spec 2026-07-28). stdout carries protocol traffic ONLY — every
 * diagnostic goes to stderr, because a stray console.log corrupts the stream
 * and the failure looks like a client bug.
 *
 * Run:  node mcp/server.mjs
 * Env:  ORCHESTRATOR_REPO=/path/to/repo   (at startup; default: the Bob page's last
 *         choice, then cwd. The page switches it at runtime.)
 *       ORCHESTRATOR_SECURITY=none|restricted|private   (default: restricted;
 *         mcp/settings.local.json, written by the Bob page, overrides it)
 *       BOB_API_KEY=…                     (Bob Shell's own; an Inference key)
 *       BOB_BIN=/path/to/bob              (optional; scanner is used without it)
 *       BOB_MAX_PARALLEL=3                (Bob runs at once; more queue)
 *       ORCHESTRATOR_HOME=~/.orchestrator (where the implementer's changes live)
 */
import { createInterface } from "node:readline";
import { PLAYBOOK, listTools, runTool } from "./repo.mjs";
import { chooseFolder, listRepos, repoRoot, selectRepo, warmFolderDialog } from "./workspace.mjs";
import { bobAvailable, bobKeySet, bobVersion } from "./bob.mjs";
import { installRoles, rolesStatus } from "./roles.mjs";
import { applyChange, discardChange, listChanges } from "./changes.mjs";
import { applySecurity } from "./redact.mjs";
import { LEVELS, securityLevel, setSecurityLevel } from "./settings.mjs";

// Clients lag the spec. Pinning the newest revision and offering it to a client
// that has never heard of it gets the connection refused outright, which is how
// this server first failed to load in Claude Code. Only the basic tools flow is
// implemented here, and that is stable across every revision below, so the safe
// move is to speak whatever the client asks for.
const PREFERRED_VERSION = "2025-06-18";
const VERSION_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const SERVER_INFO = { name: "orchestrator-bob", version: "0.3.0" };

// A client that disconnects mid-write raises EPIPE on stdout. Unhandled, it
// takes the process down with a stack trace — which reads like a server crash
// when it is just a closed pipe.
process.stdout.on("error", (e) => {
  if (e?.code === "EPIPE") process.exit(0);
  throw e;
});

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const log = (...parts) => process.stderr.write(`${parts.join(" ")}\n`);

const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

function initialize(params) {
  const requested = params?.protocolVersion;
  // Echo the client's revision rather than imposing ours. A server that names a
  // version the client does not know is rejected; one that agrees to the
  // client's is not.
  const version =
    typeof requested === "string" && VERSION_SHAPE.test(requested) ? requested : PREFERRED_VERSION;
  log(`initialize: client asked for ${requested ?? "(none)"} -> agreeing to ${version}`);
  return {
    protocolVersion: version,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    // How to lead the Bob agents — Claude Code reads this as the server's
    // standing instructions; the web app puts the same text in its system prompt.
    instructions: PLAYBOOK,
  };
}

const countRedactions = (text) => (String(text).match(/«redacted/g) ?? []).length;

async function callTool(params, signal) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  // Fixed now: a switch mid-run must not relabel what this call read.
  const repo = repoRoot();

  let raw;
  try {
    raw = await runTool(name, args, signal);
  } catch (e) {
    if (e?.code === -32602 || e?.name === "AbortError") throw e;
    // A tool failure the model can act on — reported in the result, not as a
    // protocol error, so it can correct itself and retry.
    return {
      resultType: "complete",
      content: [{ type: "text", text: `Tool "${name}" failed: ${e?.message ?? String(e)}` }],
      isError: true,
    };
  }

  // Everything leaving here goes to a model we do not control. The level is
  // read now, not at startup, so a change on the Bob page applies to the very
  // next call in every copy of this server.
  const level = securityLevel();
  const { text, blocked } = applySecurity(raw.text, level);
  return {
    resultType: "complete",
    content: [{ type: "text", text }],
    isError: blocked,
    _meta: {
      "orchestrator/trace": {
        ...raw.meta,
        repo,
        security: level,
        blocked,
        redactions: blocked ? 0 : countRedactions(text) - countRedactions(raw.text),
      },
    },
  };
}

// Not MCP — the web app's dev-server bridge uses these to drive the Bob page.
// A standard client never calls them, and an unknown method is harmless.

/** What the page needs to show and act on; the record keeps more. */
const changeSummary = (c) => ({
  id: c.id,
  status: c.status,
  task: c.task,
  created: c.created,
  updated: c.updated,
  rounds: c.rounds?.length ?? 0,
  review: c.reviews?.at(-1) ?? null,
  branch: c.branch,
  worktree: c.worktree,
});

const changes = () => listChanges(repoRoot()).map(changeSummary);

async function status() {
  // Only the web app asks for status, so only its copy keeps a dialog ready —
  // Claude Code's copy never starts one.
  warmFolderDialog();
  const repos = listRepos();
  return {
    server: SERVER_INFO,
    repo: repos.current.path,
    git: repos.current.git,
    repos,
    security: securityLevel(),
    levels: LEVELS,
    bob: { installed: bobAvailable(), version: await bobVersion(), keySet: bobKeySet() },
    roles: rolesStatus(),
    tools: listTools().map((t) => t.name),
    instructions: PLAYBOOK,
    changes: changes(),
  };
}

/** requestId -> controller, so notifications/cancelled can stop a Bob run. */
const inflight = new Map();

async function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case "initialize":
        return ok(id, initialize(params));

      case "notifications/initialized":
        return; // notifications take no response

      case "notifications/cancelled":
        inflight.get(params?.requestId)?.abort();
        return;

      case "ping":
        return ok(id, {});

      case "tools/list":
        return ok(id, { resultType: "complete", tools: listTools() });

      case "tools/call": {
        const ctl = new AbortController();
        inflight.set(id, ctl);
        try {
          return ok(id, await callTool(params, ctl.signal));
        } catch (e) {
          // A cancelled request gets no response at all, per the spec.
          if (e?.name === "AbortError") return;
          throw e;
        } finally {
          inflight.delete(id);
        }
      }

      case "orchestrator/status":
        return ok(id, await status());

      case "orchestrator/setSecurity":
        setSecurityLevel(params?.level);
        log(`security set to ${params.level}`);
        return ok(id, await status());

      case "orchestrator/changes":
        return ok(id, { changes: changes() });

      // Which repo every tool works in. The page's picker drives these; a
      // client that never calls them keeps the repo it started with.
      case "orchestrator/chooseFolder":
        return ok(id, { path: await chooseFolder() });

      case "orchestrator/setRepo": {
        const repo = selectRepo(params?.path);
        log(`repo set to ${repo.path}`);
        return ok(id, await status());
      }

      // Applying is the user's decision, so it is a method only the app's own
      // buttons reach — never a tool a model could call.
      case "orchestrator/applyChange": {
        const change = await applyChange(params?.id);
        log(`change ${change.id} applied to ${change.repo}`);
        return ok(id, { change: changeSummary(change), changes: changes() });
      }

      case "orchestrator/discardChange": {
        const change = await discardChange(params?.id);
        log(`change ${change.id} discarded`);
        return ok(id, { change: changeSummary(change), changes: changes() });
      }

      default:
        if (isNotification) return;
        return fail(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    if (isNotification) return;
    return fail(id, e?.code ?? -32603, e?.message ?? "Internal error");
  }
}

// The roles ship with the app; keep Bob's copy of them current.
if (bobAvailable()) {
  try {
    const { path, changed } = installRoles();
    if (changed) log(`roles installed to ${path}`);
  } catch (e) {
    log(`roles not installed: ${e.message}`);
  }
}

log(
  `orchestrator-bob ready · repo=${repoRoot()} · security=${securityLevel()} · ` +
    `bob=${bobAvailable() ? (bobKeySet() ? "present" : "present, BOB_API_KEY not set") : "absent (using source scanner)"}`,
);

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return fail(null, -32700, "Parse error");
  }
  // Batches are legal JSON-RPC; handle each independently.
  const items = Array.isArray(msg) ? msg : [msg];
  for (const item of items) {
    const work = handle(item);
    running.add(work);
    void work.finally(() => running.delete(work));
  }
});
const running = new Set();
rl.on("close", () => {
  // End of input is a shutdown request, not a crash: stop any Bob run rather
  // than orphan it, but let quick answers already in progress go out first.
  for (const ctl of inflight.values()) ctl.abort();
  void Promise.allSettled([...running]).then(() => process.exit(0));
});
