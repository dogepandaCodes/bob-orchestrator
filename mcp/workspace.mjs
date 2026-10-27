import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { repoTop } from "./changes.mjs";

/**
 * Which repository this copy of the server works in, and how the user picks it.
 *
 * Claude Code's copy is pinned by .mcp.json (ORCHESTRATOR_REPO=".") to the
 * project Claude Code has open. The web app's copy starts where the user last
 * chose and switches at runtime from the Bob page — no restart.
 *
 * At startup: ORCHESTRATOR_REPO > the last choice saved here > cwd.
 */
const FILE = join(dirname(fileURLToPath(import.meta.url)), "repos.local.json");
const MAX_RECENT = 8;

function readFile() {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function save(state) {
  // Write-then-rename, as with the security level: never half a file.
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, FILE);
}

const initial = () => {
  if (process.env.ORCHESTRATOR_REPO) return resolve(process.env.ORCHESTRATOR_REPO);
  const saved = readFile().current;
  return typeof saved === "string" && existsSync(saved) ? saved : process.cwd();
};

let current = initial();

/** The repository every tool works in right now. */
export const repoRoot = () => current;

/* --------------------------------------------------------------- checking */

const HOME = (() => {
  try {
    return realpathSync(homedir());
  } catch {
    return homedir();
  }
})();

// Bob reads a workspace as freely as source code, so these are never one, nor
// anything inside them: credentials, the agents' own state, and the system.
const NEVER = [
  ...[".ssh", ".aws", ".gnupg", ".kube", ".docker", ".config", ".bob", ".claude", ".orchestrator", "Library"].map((d) =>
    join(HOME, d),
  ),
  "/System",
  "/Library",
  "/usr",
  "/bin",
  "/sbin",
  "/etc",
  "/private/etc",
  "/dev",
  "/Applications",
];

const refuse = (message) => Object.assign(new Error(message), { code: -32602 });

/** The folder as a real path, or why it can't be a workspace. */
export function checkRepo(input) {
  let raw = String(input ?? "").trim();
  if (!raw) throw refuse("Choose a folder first.");
  if (raw === "~" || raw.startsWith("~/")) raw = join(HOME, raw.slice(1));
  if (!isAbsolute(raw)) throw refuse("Give the folder's full path, like ~/code/my-site.");

  let path;
  try {
    path = realpathSync(raw);
  } catch {
    throw refuse(`${raw} doesn't exist.`);
  }
  if (!statSync(path).isDirectory()) throw refuse(`${display(path)} is a file, not a folder.`);
  if (path === sep || path === HOME) {
    throw refuse("That's a whole drive or your home folder. Choose the project's own folder.");
  }
  const blocked = NEVER.find((d) => path === d || path.startsWith(d + sep));
  if (blocked) throw refuse(`${display(path)} holds credentials or system files, so Bob won't work in it.`);
  return path;
}

const display = (path) => (path === HOME || path.startsWith(HOME + sep) ? `~${path.slice(HOME.length)}` : path);

/* ------------------------------------------------------------------ state */

const describe = (path) => ({
  path,
  display: display(path),
  name: basename(path),
  exists: existsSync(path),
  git: existsSync(path) && repoTop(path) !== null,
});

/** The current repository and the recent ones, newest first. */
export function listRepos() {
  const recent = (readFile().recent ?? []).filter((p) => typeof p === "string" && p !== current);
  return {
    current: describe(current),
    recent: recent.map(describe).filter((r) => r.exists),
  };
}

/** Switches every tool to `input`, after checking it, and remembers it. */
export function selectRepo(input) {
  const path = checkRepo(input);
  const state = readFile();
  const recent = [current, ...(state.recent ?? [])].filter((p, i, all) => typeof p === "string" && p !== path && all.indexOf(p) === i);
  current = path;
  save({ current: path, recent: recent.slice(0, MAX_RECENT) });
  return describe(path);
}

/* ---------------------------------------------------------- native dialog */

const PROMPT = "Choose the repository Bob should work in";
const quote = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// The dialog runs on this machine, so it returns a real path — which a
// browser's own folder picker never hands to the page.
function dialogCommand(start) {
  switch (platform()) {
    case "darwin":
      // `activate` brings osascript's own dialog to the front without asking
      // to script another app, which would need an Automation permission.
      return [
        "osascript",
        ["-e", "activate", "-e", `POSIX path of (choose folder with prompt "${PROMPT}" default location (POSIX file "${quote(start)}"))`],
      ];
    case "linux":
      return ["zenity", ["--file-selection", "--directory", `--title=${PROMPT}`, `--filename=${start}/`]];
    case "win32":
      return [
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; " +
            `$d.Description = '${PROMPT}'; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }`,
        ],
      ];
    default:
      return null;
  }
}

/* macOS: a warm helper (folder-dialog.js). A cold osascript takes 2-3 s to
   become a GUI app and load AppKit before its dialog shows; kept running, the
   panel opens at once. Anything that goes wrong falls back to the cold path. */

const HELPER = join(dirname(fileURLToPath(import.meta.url)), "folder-dialog.js");
let helper = null;

function startHelper() {
  if (helper || platform() !== "darwin") return helper;
  const proc = spawn("osascript", ["-l", "JavaScript", HELPER], { stdio: ["pipe", "pipe", "ignore"] });
  const h = { proc, waiting: null, ready: null };
  let markReady;
  let markFailed;
  h.ready = new Promise((ok, no) => ((markReady = ok), (markFailed = no)));
  h.ready.catch(() => {});

  createInterface({ input: proc.stdout }).on("line", (line) => {
    if (line === "ready") return markReady();
    const waiting = h.waiting;
    h.waiting = null;
    try {
      waiting?.done(JSON.parse(line).path ?? null);
    } catch (e) {
      waiting?.fail(e);
    }
  });
  const gone = () => {
    if (helper === h) helper = null;
    markFailed(new Error("The folder dialog helper stopped."));
    h.waiting?.fail(new Error("The folder dialog closed unexpectedly."));
    h.waiting = null;
  };
  proc.on("exit", gone);
  proc.on("error", gone);
  proc.stdin.on("error", () => {});
  helper = h;
  return h;
}

/** Starts the helper before the first click. Cheap to call again. */
export function warmFolderDialog() {
  try {
    startHelper();
  } catch {
    // The cold path still works.
  }
}

const within = (promise, ms) =>
  Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error("timed out")), ms))]);

async function chooseWarm(h) {
  if (h.waiting) throw refuse("A folder dialog is already open.");
  return new Promise((done, fail) => {
    h.waiting = { done, fail };
    h.proc.stdin.write(`${JSON.stringify({ prompt: PROMPT, start: dirname(current) })}\n`);
  });
}

/** Opens the OS's folder dialog. Resolves the chosen path, or null if cancelled. */
export async function chooseFolder() {
  const h = startHelper();
  if (h) {
    let warm = true;
    try {
      await within(h.ready, 5000);
    } catch {
      warm = false;
      h.proc.kill();
    }
    if (warm) return chooseWarm(h);
  }
  return chooseCold();
}

function chooseCold() {
  const cmd = dialogCommand(dirname(current));
  if (!cmd) return Promise.reject(new Error("This system has no folder dialog the server can open. Paste the path instead."));
  return new Promise((done, fail) => {
    execFile(cmd[0], cmd[1], { timeout: 5 * 60_000 }, (err, stdout, stderr) => {
      const path = String(stdout).trim().replace(/\/+$/, "");
      if (!err) return done(path || null);
      if (err.code === "ENOENT") return fail(new Error(`${cmd[0]} isn't available here. Paste the path instead.`));
      // Cancelling exits non-zero: osascript with "User canceled (-128)", zenity with 1.
      if (/-128|cancel/i.test(String(stderr)) || err.code === 1) return done(null);
      fail(new Error(String(stderr).trim() || err.message));
    });
  });
}
