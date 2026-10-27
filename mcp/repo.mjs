import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isForbiddenPath } from "./redact.mjs";
import { bobAvailable, runBob } from "./bob.mjs";
import { ROLES, checkEvidence, installRoles, parseReport, renderReport } from "./roles.mjs";
import { commitRound, createChange, diffChange, discardChange, openChange, repoTop, updateChange } from "./changes.mjs";
import { repoRoot } from "./workspace.mjs";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".cache", ".vite", "coverage", ".figma",
]);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|java|php|rs)$/i;
const MAX_FILES = 4000;
const MAX_BYTES = 400_000;


/* ----------------------------------------------------------------- scanning */

function* walk(root, dir = root, depth = 0) {
  if (depth > 12) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.isDirectory() && entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    const rel = relative(root, full).split(sep).join("/");
    if (isForbiddenPath(rel)) continue;
    if (entry.isDirectory()) {
      yield* walk(root, full, depth + 1);
    } else if (SOURCE_EXT.test(entry.name)) {
      yield { full, rel };
    }
  }
}

function sourceFiles() {
  const out = [];
  for (const file of walk(repoRoot())) {
    out.push(file);
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

function read(file) {
  try {
    if (statSync(file.full).size > MAX_BYTES) return "";
    return readFileSync(file.full, "utf8");
  } catch {
    return "";
  }
}

// Heuristic, and deliberately so — these are the shapes that actually appear
// in source. A miss is better than a fabricated contract.
const CALLER = /(?:fetch|axios(?:\.\w+)?|request|httpClient\.\w+)\(\s*[`'"]([^`'"]{1,200})[`'"]/g;
const DEFINITION = /\b(?:app|router|server|api)\.(get|post|put|patch|delete|all)\(\s*[`'"]([^`'"]{1,200})[`'"]/gi;

/**
 * Source rarely contains a literal URL. `fetch(`${BASE}/messages`)` is the norm,
 * so collapse interpolations: a leading one means the path is what follows it,
 * an inner one is a path parameter.
 *
 *   `${BASE}/messages`     -> /messages
 *   `/api/users/${id}`     -> /api/users/{}
 *   "https://host/v1"      -> unchanged
 */
function normalizeUrl(raw) {
  const MARK = "\u0000";
  let url = raw.replace(/\$\{[^}]*\}/g, MARK).replace(/^\u0000+/, "");
  url = url.replace(/\u0000/g, "{}");
  // A route is a path — drop the query and fragment, or `?alt=sse` disqualifies
  // an otherwise perfectly ordinary endpoint.
  return url.split(/[?#]/)[0];
}

function looksLikeRoute(url) {
  return /^\/[A-Za-z0-9._\-/:{}[\]]*$/.test(url) || /^https?:\/\//.test(url);
}

/** route -> { methods, callers, definitions } */
function index() {
  const routes = new Map();
  const touch = (route) => {
    if (!routes.has(route)) {
      routes.set(route, { route, methods: new Set(), callers: new Set(), definitions: new Set() });
    }
    return routes.get(route);
  };

  for (const file of sourceFiles()) {
    const src = read(file);
    if (!src) continue;

    for (const m of src.matchAll(CALLER)) {
      const url = normalizeUrl(m[1]);
      if (!looksLikeRoute(url)) continue;
      touch(url).callers.add(file.rel);
    }
    for (const m of src.matchAll(DEFINITION)) {
      const entry = touch(normalizeUrl(m[2]));
      entry.methods.add(m[1].toUpperCase());
      entry.definitions.add(file.rel);
    }
  }
  return routes;
}

const shape = (entry) => ({
  route: entry.route,
  methods: [...entry.methods],
  callers: [...entry.callers],
  definitions: [...entry.definitions],
});

/* ------------------------------------------------------------------- tools */

export const TOOLS = [
  {
    name: "list_endpoints",
    title: "List HTTP endpoints",
    description:
      "Every HTTP route found in the repo, with the methods it is served with, the files that define it, and the files that call it. Source-derived, so it reflects the code as written rather than documentation.",
    inputSchema: { type: "object", additionalProperties: false },
  },
  {
    name: "get_endpoint_contract",
    title: "Get one endpoint's contract",
    description:
      "What a specific route expects and returns, plus its definition sites and callers. Use this instead of guessing a request shape from a component.",
    inputSchema: {
      type: "object",
      properties: { route: { type: "string", description: 'Route path, e.g. "/api/login"' } },
      required: ["route"],
      additionalProperties: false,
    },
  },
  {
    name: "search_endpoints",
    title: "Search endpoints",
    description: "Routes whose path, definition file or calling file matches a keyword.",
    inputSchema: {
      type: "object",
      properties: { keyword: { type: "string", description: "Substring to match" } },
      required: ["keyword"],
      additionalProperties: false,
    },
  },
  {
    name: "diff_route",
    title: "Diff two routes",
    description:
      "Compares two routes' methods and callers — the migration case: what changed between an old path and its replacement.",
    inputSchema: {
      type: "object",
      properties: {
        old: { type: "string", description: "Existing route path" },
        next: { type: "string", description: "Replacement route path" },
      },
      required: ["old", "next"],
      additionalProperties: false,
    },
  },
  {
    name: "delegate",
    title: "Delegate to a Bob agent",
    description:
      "Hand one self-contained task to a Bob agent working read-only in the user's repository. Roles: " +
      "explorer — finds and explains code: where something lives, how it works, an endpoint's contract, its callers; " +
      "verifier — skeptically checks claims about the code and rules each confirmed, refuted or unclear (use it when a claim matters or two answers disagree). " +
      "Several delegate calls in one turn run in parallel, so split independent questions instead of asking one broad one. " +
      "Every citation in the answer is checked against the code by the server; ones marked [quote not found…] or [file not found] did not hold up. " +
      "Each call takes 15–60 s. The result carries a task_id: pass it as follow_up to ask that same agent more without it re-reading everything.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", enum: ["explorer", "verifier"], description: "Which agent" },
        task: {
          type: "string",
          description:
            "Self-contained — the agent does not see this conversation. Name files, routes or symbols you already know. For the verifier, list the claims to check.",
        },
        follow_up: { type: "string", description: "A task_id from an earlier delegate result, to continue that agent" },
      },
      required: ["role", "task"],
      additionalProperties: false,
    },
  },
  {
    name: "implement_change",
    title: "Implement a code change",
    description:
      "A Bob Implementer makes a code change in an isolated copy of the user's repository (a git worktree cut from their current working state). " +
      "The user's own files are not touched: you get back a change_id, the Implementer's summary and the diff, and only the user can apply it, from the app. " +
      "The Implementer cannot run commands or tests. Without change_id this starts a new change; with change_id the same Implementer revises that change — " +
      "pass the reviewer's blocker and major issues as the task. Always follow with review_change. Takes 1–5 minutes.",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description:
            "For a new change: exactly what to change and why, with files and constraints. For a revision: the issues to address.",
        },
        change_id: { type: "string", description: "Revise this existing change instead of starting a new one" },
      },
      required: ["task"],
      additionalProperties: false,
    },
  },
  {
    name: "review_change",
    title: "Review a change",
    description:
      "An independent Bob Reviewer critiques a change made by implement_change against its task: correctness, callers and contracts, scope, fit with the codebase, safety, tests. " +
      "Returns approve or changes_requested with issues by severity (blocker, major, minor), each cited and checked against the code. " +
      "When changes are requested, send the blocker and major issues back with implement_change and the same change_id, then review again — at most 3 rounds. " +
      "The same Reviewer is resumed on later rounds, so it checks whether its earlier issues were addressed.",
    inputSchema: {
      type: "object",
      properties: {
        change_id: { type: "string", description: "From implement_change" },
        focus: { type: "string", description: "Optional: something specific to scrutinise" },
      },
      required: ["change_id"],
      additionalProperties: false,
    },
  },
];

const BOB_TOOLS = new Set(["delegate", "implement_change", "review_change"]);
const CHANGE_TOOLS = new Set(["implement_change", "review_change"]);

// Not cached: the repo can change at runtime, and so can whether it is under git.
const repoIsGit = () => repoTop(repoRoot()) !== null;

/** Bob's tools only where Bob can answer, and changes only where git can hold them. */
export function listTools() {
  return TOOLS.filter((t) => (!BOB_TOOLS.has(t.name) || bobAvailable()) && (!CHANGE_TOOLS.has(t.name) || repoIsGit()));
}

/**
 * How the orchestrator should lead the team. Sent as the MCP server's
 * instructions, and by the web app in the system prompt, so every orchestrator
 * — Claude Code's or the chat's — works the same way.
 */
export const PLAYBOOK = [
  "You lead a team of Bob agents (IBM's coding agent) working in the user's repository. You plan, split the work, reconcile what comes back and answer the user; they read and change the code.",
  "- Listing or searching routes: use list_endpoints / search_endpoints / diff_route first. They are instant and exhaustive.",
  "- Questions about the code: split the question into independent parts and call delegate (role explorer) once per part in the same turn. They run in parallel. Give each a self-contained task.",
  "- When a finding decides what you do next, or two answers disagree, call delegate with role verifier and the exact claims.",
  "- Code changes: implement_change, then review_change. If the verdict is changes_requested, pass the blocker and major issues back with implement_change and the same change_id, then review again. Stop after 3 rounds and tell the user what is still open.",
  "- Never say a change is applied. The user applies it from the app; until then it lives only in its own worktree.",
  "- Cite file:line from the results. A citation the server marked as not holding up is not evidence — say so, or check it.",
].join("\n");

function findRoute(routes, route) {
  if (routes.has(route)) return routes.get(route);
  const needle = route.toLowerCase();
  for (const [key, value] of routes) {
    if (key.toLowerCase().endsWith(needle) || key.toLowerCase().includes(needle)) return value;
  }
  return null;
}

const SCANNER = { source: "scanner" };
const TASK_ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_DIFF_CHARS = 60_000;

const clip = (text, max) =>
  text.length <= max ? text : `${text.slice(0, max)}\n… (${text.length - max} more characters not shown)`;

/** One role, run to a report the orchestrator can read. */
async function runRole(role, { prompt, workspace, resume, signal }) {
  if (!bobAvailable()) throw new Error("Bob Shell isn't installed on this machine. The endpoint tools still work.");
  installRoles();
  const spec = ROLES[role];
  const res = await runBob({ prompt, mode: spec.mode, workspace, edit: spec.edit, resume, maxTurns: spec.maxTurns, timeout: spec.timeout, signal });
  return { ...res, report: parseReport(res.text) };
}

async function delegate(args, signal) {
  const role = String(args.role ?? "");
  if (role !== "explorer" && role !== "verifier") {
    throw Object.assign(new Error("role must be explorer or verifier"), { code: -32602 });
  }
  const task = String(args.task ?? "").trim();
  if (!task) throw new Error("task is required");
  const resume = args.follow_up ? String(args.follow_up) : undefined;
  if (resume && !TASK_ID.test(resume)) throw new Error("follow_up must be a task_id from an earlier delegate result");

  const workspace = repoRoot();
  const res = await runRole(role, { prompt: task, workspace, resume, signal });
  const evidence = checkEvidence(res.report.data, workspace);
  return {
    text: renderReport(role, res.report, { task_id: res.taskId }),
    meta: { ...res.meta, role, task_id: res.taskId, ...evidence },
  };
}

async function implementChange(args, signal) {
  const task = String(args.task ?? "").trim();
  if (!task) throw new Error("task is required");
  const revising = Boolean(args.change_id);
  let change = revising ? openChange(String(args.change_id)) : await createChange(repoRoot(), task);
  const round = change.rounds.length + 1;

  const prompt = revising
    ? `Feedback on your change, round ${round}. Address it in the same workspace:\n\n${task}`
    : `Task:\n${task}\n\nThis workspace is an isolated copy of the user's repository. Make the change here; the user reviews and applies it later.`;
  let res;
  try {
    res = await runRole("implementer", { prompt, workspace: change.workspace, resume: change.implementerTask, signal });
  } catch (e) {
    // A first round that never produced anything leaves nothing worth keeping.
    if (!revising) await discardChange(change.id).catch(() => {});
    throw e;
  }
  await commitRound(change, round);
  const diff = await diffChange(change);
  change = updateChange(change, {
    implementerTask: res.taskId,
    rounds: [
      ...change.rounds,
      { round, at: new Date().toISOString(), feedback: revising ? task : null, summary: res.report.data?.summary ?? null },
    ],
  });

  const stat = diff.files.length
    ? `${diff.files.length} file(s), +${diff.insertions} −${diff.deletions}: ${diff.files.map((f) => f.file).join(", ")}`
    : "no files changed";
  const text = [
    renderReport("implementer", res.report, { change_id: change.id, round }),
    `Diff against the user's working state — ${stat}:`,
    diff.patch.trim() ? "```diff\n" + clip(diff.patch, MAX_DIFF_CHARS) + "\n```" : "(empty)",
    diff.patch.trim()
      ? `Next: review_change with change_id ${change.id}. The user's files are untouched until they apply it from the app.`
      : "The Implementer changed nothing; read its notes above.",
  ].join("\n\n");
  return {
    text,
    meta: {
      ...res.meta,
      role: "implementer",
      change_id: change.id,
      round,
      files: diff.files.length,
      insertions: diff.insertions,
      deletions: diff.deletions,
    },
  };
}

async function reviewChange(args, signal) {
  let change = openChange(String(args.change_id ?? ""));
  const diff = await diffChange(change);
  if (!diff.patch.trim()) throw new Error(`Change ${change.id} is empty — there is nothing to review.`);
  const round = change.rounds.length;
  const focus = args.focus ? `\n\nFocus especially on: ${String(args.focus)}` : "";
  const body = "```diff\n" + clip(diff.patch, MAX_DIFF_CHARS) + "\n```";
  // The revision may answer the orchestrator rather than this reviewer, so say
  // what the Implementer was actually asked — or it reads as unrequested scope.
  const feedback = change.rounds.at(-1)?.feedback;
  const prompt = change.reviewerTask
    ? `The Implementer revised the change (round ${round})` +
      (feedback ? ` in response to this feedback from the orchestrator:\n\n${feedback}\n\n` : ". ") +
      `Review the whole change again, and check that each of your earlier issues was addressed. The updated diff, already applied in this workspace:\n\n${body}${focus}`
    : `The task the change was made for:\n${change.task}\n\nThe diff, already applied in this workspace (an isolated copy of the repository):\n\n${body}${focus}`;

  const res = await runRole("reviewer", { prompt, workspace: change.workspace, resume: change.reviewerTask, signal });
  const evidence = checkEvidence(res.report.data, change.workspace);
  const verdict = res.report.data?.verdict ?? null;
  const issues = Array.isArray(res.report.data?.issues) ? res.report.data.issues : [];
  const count = (s) => issues.filter((i) => i.severity === s).length;
  change = updateChange(change, {
    reviewerTask: res.taskId,
    reviews: [...change.reviews, { round, at: new Date().toISOString(), verdict, blocker: count("blocker"), major: count("major"), minor: count("minor") }],
  });
  return {
    text: renderReport("reviewer", res.report, { change_id: change.id, round }),
    meta: { ...res.meta, role: "reviewer", change_id: change.id, round, verdict, ...evidence },
  };
}

/**
 * Resolves { text, meta }. meta.source says who answered — the trace shows it,
 * so a scanner answer is never passed off as Bob's.
 *
 * The listing tools stay on the scanner even with Bob present: they are
 * exhaustive, instant and free, where Bob would be a slow paraphrase of the same
 * facts. Bob earns its latency where reading code matters — contracts,
 * questions and changes.
 */
export async function runTool(name, args = {}, signal) {
  const text = scan(name, args);
  if (text !== undefined) return { text, meta: SCANNER };

  switch (name) {
    case "get_endpoint_contract": {
      const route = String(args.route ?? "").trim();
      if (!route) throw new Error("route is required");
      const entry = findRoute(index(), route);
      const facts = entry
        ? contractFacts(shape(entry))
        : `The source scanner found no route matching "${route}" in ${repoRoot()}.`;
      if (!bobAvailable()) {
        return {
          text: entry
            ? `${facts}\n\nDerived by scanning source. Request and response shapes are not inferred —\nread the definition sites above for the authoritative contract.`
            : facts,
          meta: SCANNER,
        };
      }

      const sites = entry ? [...entry.definitions, ...entry.callers].slice(0, 8) : [];
      try {
        const bob = await delegate(
          {
            role: "explorer",
            task:
              `What is the exact request and response contract of the HTTP route ${route}? ` +
              "Cover the method, path and query parameters, request body, response body, auth, and error responses." +
              (sites.length ? ` Start from these files: ${sites.join(", ")}.` : ""),
          },
          signal,
        );
        return { text: `${facts}\n\nBob's reading of the contract:\n${bob.text}`, meta: bob.meta };
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        // The scanner's facts are still worth returning — say why Bob is missing.
        return { text: `${facts}\n\n(Bob could not add the contract: ${e.message})`, meta: SCANNER };
      }
    }

    case "delegate":
      return delegate(args, signal);

    case "implement_change":
      return implementChange(args, signal);

    case "review_change":
      return reviewChange(args, signal);

    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  }
}

function contractFacts(r) {
  return [
    `Route: ${r.route}`,
    `Methods: ${r.methods.join("/") || "unknown (no server-side definition found)"}`,
    `Defined in: ${r.definitions.join(", ") || "(not found — may be served by another service)"}`,
    `Called from: ${r.callers.join(", ") || "(no callers found)"}`,
  ].join("\n");
}

/** The scanner-only tools; undefined for anything it does not answer. */
function scan(name, args) {
  switch (name) {
    case "list_endpoints": {
      const routes = [...index().values()].map(shape).sort((a, b) => a.route.localeCompare(b.route));
      if (routes.length === 0) return "No HTTP routes found in this repo.";
      return [
        `${routes.length} route(s) in ${repoRoot()}`,
        "",
        ...routes.map((r) => {
          const methods = r.methods.length ? r.methods.join("/") : "—";
          return `${methods}  ${r.route}\n   defined: ${r.definitions.join(", ") || "(not found in source)"}\n   called:  ${r.callers.join(", ") || "(no callers found)"}`;
        }),
      ].join("\n");
    }

    case "search_endpoints": {
      const keyword = String(args.keyword ?? "").trim().toLowerCase();
      if (!keyword) throw new Error("keyword is required");
      const hits = [...index().values()]
        .map(shape)
        .filter(
          (r) =>
            r.route.toLowerCase().includes(keyword) ||
            r.callers.some((f) => f.toLowerCase().includes(keyword)) ||
            r.definitions.some((f) => f.toLowerCase().includes(keyword)),
        );
      if (hits.length === 0) return `No endpoints match "${keyword}".`;
      return hits.map((r) => `${r.methods.join("/") || "—"}  ${r.route}  (${r.callers.length} caller(s))`).join("\n");
    }

    case "diff_route": {
      const routes = index();
      const a = findRoute(routes, String(args.old ?? ""));
      const b = findRoute(routes, String(args.next ?? ""));
      const describe = (entry, label) =>
        entry
          ? `${label}: ${entry.route}\n  methods: ${[...entry.methods].join("/") || "—"}\n  callers: ${[...entry.callers].join(", ") || "none"}`
          : `${label}: not found`;
      const onlyOld = a && b ? [...a.callers].filter((f) => !b.callers.has(f)) : [];
      return [
        describe(a, "old"),
        describe(b, "new"),
        "",
        onlyOld.length
          ? `Still calling the old route only: ${onlyOld.join(", ")}`
          : "No caller references the old route exclusively.",
      ].join("\n");
    }

    default:
      return undefined;
  }
}
