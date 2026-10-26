/**
 * Settings shared by every copy of this server.
 *
 * Claude Code spawns one copy from .mcp.json, the web app's dev server spawns
 * another. Both read the same file, re-read on every call, so the level chosen
 * on the Bob page governs every consumer — not just whichever process the page
 * happened to talk to.
 *
 * Precedence: this file > ORCHESTRATOR_SECURITY > "restricted".
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "settings.local.json");

export const LEVELS = ["none", "restricted", "private"];

function readFile() {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function securityLevel() {
  const saved = readFile().security;
  if (LEVELS.includes(saved)) return saved;
  const env = process.env.ORCHESTRATOR_SECURITY;
  return LEVELS.includes(env) ? env : "restricted";
}

export function setSecurityLevel(level) {
  if (!LEVELS.includes(level)) {
    throw Object.assign(new Error(`security must be one of ${LEVELS.join(", ")}`), { code: -32602 });
  }
  // Write-then-rename, so the other copy never reads half a file — a torn read
  // would fall back to the env default, which may be less strict.
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ ...readFile(), security: level }, null, 2)}\n`);
  renameSync(tmp, FILE);
  return level;
}
