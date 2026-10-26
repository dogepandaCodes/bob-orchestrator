import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isForbiddenPath } from "./redact.mjs";

/**
 * The orchestrator's Bob roles. Their prompts and tool groups live in
 * roles/custom_modes.yaml; this is what the server needs to know to run one.
 * Roles differ by stance and permission, not by topic — the orchestrator's task
 * text says what to look at, so the same four serve any codebase.
 */
export const ROLES = {
  explorer: { mode: "orch-explorer", edit: false, maxTurns: 16, timeout: 240_000 },
  verifier: { mode: "orch-verifier", edit: false, maxTurns: 16, timeout: 240_000 },
  implementer: { mode: "orch-implementer", edit: true, maxTurns: 30, timeout: 600_000 },
  reviewer: { mode: "orch-reviewer", edit: false, maxTurns: 20, timeout: 300_000 },
};

/* ------------------------------------------------------------- installation */

const SHIPPED = join(dirname(fileURLToPath(import.meta.url)), "roles", "custom_modes.yaml");

// Bob loads global modes from ~/.bob/settings/custom_modes.yaml and from
// ~/.bob/plugins/*/custom_modes.yaml. A plugin directory of our own means the
// user's file is never touched, and uninstalling is deleting one folder.
const INSTALLED = join(homedir(), ".bob", "plugins", "orchestrator", "custom_modes.yaml");

const read = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

/** Writes the shipped roles into Bob's plugin folder when that copy is missing or stale. */
export function installRoles() {
  const shipped = read(SHIPPED);
  if (shipped === null) throw new Error(`The orchestrator's role definitions are missing (${SHIPPED}).`);
  if (read(INSTALLED) === shipped) return { path: INSTALLED, changed: false };
  mkdirSync(dirname(INSTALLED), { recursive: true });
  // Bob hot-reloads this file; never let it see half of one.
  const tmp = `${INSTALLED}.${process.pid}.tmp`;
  writeFileSync(tmp, shipped);
  renameSync(tmp, INSTALLED);
  return { path: INSTALLED, changed: true };
}

export function rolesStatus() {
  const installed = read(INSTALLED);
  return {
    path: INSTALLED,
    installed: installed !== null,
    current: installed !== null && installed === read(SHIPPED),
    roles: Object.keys(ROLES),
  };
}

/* ------------------------------------------------------------------ reports */

/**
 * Every role ends with one fenced json block (see customInstructions). Take the
 * last one: the prose before it is the role's own explanation and is kept.
 * A role that forgot the block still returns its prose — only the structure
 * is lost.
 */
export function parseReport(text) {
  const blocks = [...String(text).matchAll(/```json\s*\n([\s\S]*?)\n\s*```/g)];
  const last = blocks.at(-1);
  if (!last) return { prose: String(text).trim(), data: null };
  try {
    return { prose: String(text).slice(0, last.index).trim(), data: JSON.parse(last[1]) };
  } catch {
    return { prose: String(text).trim(), data: null };
  }
}

const squash = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();
const MAX_CHECK_BYTES = 2 * 1024 * 1024;

/**
 * Checks one citation against the workspace. The point of evidence is that it
 * can be checked; a model's "src/a.ts:12" is a claim like any other.
 *
 * Returns "verified" (the line exists and holds the quote, within a few lines
 * either way), "line exists" (no quote to compare), or why it failed.
 */
function checkCitation(workspace, cite) {
  const file = String(cite?.file ?? "").trim();
  const line = Number(cite?.line);
  if (!file) return "no file named";
  const full = resolve(workspace, file);
  const rel = relative(workspace, full);
  if (rel.startsWith("..") || isAbsolute(rel)) return "outside the workspace";
  if (isForbiddenPath(rel.split(sep).join("/"))) return "protected file, not checked";
  let lines;
  try {
    if (statSync(full).size > MAX_CHECK_BYTES) return "file too large to check";
    lines = readFileSync(full, "utf8").split(/\r?\n/);
  } catch {
    return "file not found";
  }
  if (!Number.isInteger(line) || line < 1 || line > lines.length) return `no line ${cite?.line} (file has ${lines.length})`;
  const quote = squash(cite?.quote ?? "");
  if (!quote) return "line exists";
  const window = lines.slice(Math.max(0, line - 4), line + 3).map(squash).join(" ");
  return window.includes(quote) ? "verified" : "quote not found near that line";
}

/**
 * Marks every citation in a report — findings[].evidence, results[].evidence,
 * issues[] — with what the check found, and counts them.
 */
export function checkEvidence(data, workspace) {
  const counts = { cited: 0, verified: 0 };
  const visit = (cite) => {
    if (!cite || typeof cite !== "object" || !("file" in cite)) return;
    cite.check = checkCitation(workspace, cite);
    counts.cited++;
    if (cite.check === "verified" || cite.check === "line exists") counts.verified++;
  };
  for (const item of [...(data?.findings ?? []), ...(data?.results ?? [])]) {
    for (const cite of Array.isArray(item?.evidence) ? item.evidence : []) visit(cite);
  }
  for (const issue of Array.isArray(data?.issues) ? data.issues : []) visit(issue);
  return counts;
}

const at = (c) => `${c.file}:${c.line}${c.check && c.check !== "verified" ? ` [${c.check}]` : ""}`;
const list = (items, fmt) => (Array.isArray(items) && items.length ? items.map(fmt).join("\n") : "");

/**
 * The report as the orchestrator reads it: the role's structured answer laid
 * out plainly, with every citation that failed its check marked where it sits.
 */
export function renderReport(role, report, extra = {}) {
  const { prose, data } = report;
  const head = [`Role: ${role}`, ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`)].join(" · ");
  if (!data) return `${head}\n(The role returned no structured report; its answer follows.)\n\n${prose}`;

  const parts = [head];
  if (data.verdict) parts.push(`Verdict: ${data.verdict}`);
  if (data.summary) parts.push(String(data.summary));

  const findings = list(data.findings, (f, i) =>
    `${i + 1}. ${f.claim}\n   evidence: ${(f.evidence ?? []).map(at).join(", ") || "none given"}`,
  );
  if (findings) parts.push(`Findings:\n${findings}`);

  const results = list(data.results, (r, i) =>
    `${i + 1}. [${r.verdict}] ${r.claim}${r.note ? `\n   ${r.note}` : ""}\n   evidence: ${(r.evidence ?? []).map(at).join(", ") || "none given"}`,
  );
  if (results) parts.push(`Rulings:\n${results}`);

  const issues = list(data.issues, (x, i) =>
    `${i + 1}. [${x.severity}] ${at(x)} — ${x.problem}${x.suggestion ? `\n   suggestion: ${x.suggestion}` : ""}`,
  );
  if (data.verdict) parts.push(issues ? `Issues:\n${issues}` : "Issues: none");

  const plain = (label, key) => {
    const text = list(data[key], (s) => `- ${typeof s === "string" ? s : JSON.stringify(s)}`);
    if (text) parts.push(`${label}:\n${text}`);
  };
  plain("Files changed", "files_changed");
  plain("Decisions", "decisions");
  plain("Open questions", "open_questions");
  plain("Unknowns", "unknowns");
  const addressed = list(data.addressed, (a) => `- ${a.issue} → ${a.resolution}`);
  if (addressed) parts.push(`Addressed:\n${addressed}`);
  if (prose) parts.push(`Notes from the role:\n${prose}`);
  return parts.join("\n\n");
}
