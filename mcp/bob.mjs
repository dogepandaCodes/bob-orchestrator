import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";

/**
 * Bob is a CLI, not an MCP server — this leg is process invocation (Bob Shell's
 * `bob run`) and has no protocol guarantees beyond its --format json result.
 */
const bobBin = () => process.env.BOB_BIN || "bob";
const BOB_MAX_OUTPUT = 4 * 1024 * 1024;

// Each run is a full agent with its own model calls; past a few at once the
// machine and the bill both suffer, and Bob gains nothing from the crowd.
const MAX_PARALLEL = Math.max(1, Number(process.env.BOB_MAX_PARALLEL) || 3);

// Headless Bob pre-approves every tool it calls, so what a run may do has to be
// imposed from outside. A role's mode sets its ceiling; these flags are the
// hard boundary, and hold even when a repository shadows the role's slug with a
// mode of its own. Nothing executes, reaches other servers, switches mode (which
// could hop back to Agent and take the pre-approval with it) or delegates.
const NEVER = "execute,mcp,mode,subtask,subagent,workflow";
const boundary = (edit) => [
  "--disable-tool-groups",
  edit ? NEVER : `edit,${NEVER}`,
  "--disable-mcp",
  "--disable-subagents",
];

export function bobAvailable() {
  const bin = process.env.BOB_BIN;
  if (bin) return existsSync(bin);
  // Walk PATH rather than shelling out — a subprocess here is both slower and,
  // with shell:true, a documented injection footgun.
  for (const dir of (process.env.PATH || "").split(":")) {
    if (dir && existsSync(join(dir, "bob"))) return true;
  }
  return false;
}

/** Bob Shell reads its key from the environment and fails fast without one. */
export const bobKeySet = () => Boolean(process.env.BOB_API_KEY);

let version = null;
export function bobVersion() {
  if (version || !bobAvailable()) return Promise.resolve(version);
  return new Promise((done) => {
    execFile(bobBin(), ["--version"], { timeout: 10_000 }, (err, stdout) => {
      if (!err) version = String(stdout).trim().split("\n")[0] || null;
      done(version);
    });
  });
}

export const abortError = () => Object.assign(new Error("Cancelled"), { name: "AbortError" });
const lastLine = (text) =>
  String(text).trim().split("\n").filter(Boolean).pop()?.replace(/^Error:\s*/, "") ?? "";

/** The --format json result; tolerant of log lines printed ahead of it. */
function parseResult(stdout) {
  const candidates = [stdout.trim(), ...stdout.trim().split("\n").reverse()];
  for (const candidate of candidates) {
    if (!candidate.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed?.type === "result") return parsed;
    } catch {
      // not this one
    }
  }
  return null;
}

/**
 * Bob merges workspace modes over global ones, so a repository can define its
 * own `orch-explorer` and the run would take that persona instead of ours. The
 * flags above still bound what it may do, but the role would no longer be ours
 * — refuse rather than run someone else's prompt under our name.
 */
function shadowedRoles(workspace) {
  const files = [join(workspace, ".bob", "custom_modes.yaml")];
  try {
    for (const entry of readdirSync(join(workspace, ".bob", "plugins"), { withFileTypes: true })) {
      if (entry.isDirectory()) files.push(join(workspace, ".bob", "plugins", entry.name, "custom_modes.yaml"));
    }
  } catch {
    // no workspace plugins
  }
  const found = [];
  for (const file of files) {
    try {
      for (const m of readFileSync(file, "utf8").matchAll(/slug:\s*["']?(orch-[A-Za-z0-9-]+)/g)) found.push(m[1]);
    } catch {
      // absent
    }
  }
  return found;
}

/* ---------------------------------------------------------------- the queue */

let running = 0;
const waiting = [];

function acquire(signal) {
  if (running < MAX_PARALLEL) {
    running++;
    return Promise.resolve();
  }
  return new Promise((done, fail) => {
    const entry = { done, fail };
    waiting.push(entry);
    signal?.addEventListener(
      "abort",
      () => {
        const i = waiting.indexOf(entry);
        if (i >= 0) waiting.splice(i, 1);
        fail(abortError());
      },
      { once: true },
    );
  });
}

function release() {
  const next = waiting.shift();
  if (next) next.done();
  else running--;
}

/* ------------------------------------------------------------------ one run */

/**
 * One Bob run in a role. Resolves { text, taskId, meta }; rejects with Bob's
 * own reason.
 *
 *   mode       the role's slug (mcp/roles/custom_modes.yaml)
 *   workspace  what Bob may read — and, with `edit`, write. Bob refuses paths
 *              outside it, `..` included (checked against Bob Shell 2.0.5)
 *   resume     a previous run's task id: the same agent, with its memory
 */
export async function runBob({ prompt, mode, workspace, edit = false, resume, maxTurns = 12, timeout = 180_000, signal }) {
  if (signal?.aborted) throw abortError();
  const shadowed = shadowedRoles(workspace);
  if (shadowed.length) {
    throw new Error(
      `This repository defines its own Bob modes named ${[...new Set(shadowed)].join(", ")}, which would replace ` +
        "the orchestrator's roles. Rename them in its .bob folder to use the orchestrator here.",
    );
  }

  await acquire(signal);
  try {
    // Cancelled while queued, after a slot was already handed over.
    if (signal?.aborted) throw abortError();
    return await new Promise((done, fail) => {
      const started = Date.now();
      let settled = false;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        fn(value);
      };

      const child = spawn(
        bobBin(),
        [
          "run",
          "--format", "json",
          "--workspace", workspace,
          "--mode", mode,
          "--max-turns", String(maxTurns),
          ...(resume ? ["--resume", resume] : []),
          ...boundary(edit),
        ],
        { cwd: workspace, stdio: ["pipe", "pipe", "pipe"] },
      );
      const onAbort = () => {
        child.kill("SIGTERM");
        settle(fail, abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        settle(fail, new Error(`Bob did not answer within ${timeout / 1000} s`));
      }, timeout);

      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (d) => {
        if (stdout.length < BOB_MAX_OUTPUT) stdout += d;
      });
      child.stderr.setEncoding("utf8").on("data", (d) => {
        if (stderr.length < 64_000) stderr += d;
      });
      child.on("error", (e) =>
        settle(fail, e.code === "ENOENT" ? new Error("Bob Shell is not installed (no `bob` on PATH)") : e),
      );
      child.on("close", (code) => {
        const result = parseResult(stdout);
        if (code === 0 && result?.status === "success" && typeof result.last_message === "string") {
          return settle(done, {
            text: result.last_message,
            taskId: result.stats?.task_id ?? resume ?? null,
            meta: { source: "bob", ...result.stats, wall_ms: Date.now() - started },
          });
        }
        const reason =
          (result?.status === "error" && result.last_message) ||
          lastLine(stderr) ||
          lastLine(stdout) ||
          `exited with code ${code}`;
        settle(fail, new Error(`Bob: ${reason}`));
      });

      // Stdin, not argv: a prompt starting with "-" would parse as a flag, and
      // argv is readable by every process on the machine through `ps`.
      child.stdin.on("error", () => {}); // Bob may exit before reading it
      child.stdin.end(prompt);
    });
  } finally {
    release();
  }
}
