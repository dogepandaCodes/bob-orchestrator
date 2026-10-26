import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/**
 * Where the Implementer works: a git worktree per change, cut from the user's
 * working state, never from their files themselves. A change reaches the
 * user's checkout only through applyChange — which no model can call; the user
 * does, from the app.
 *
 *   ~/.orchestrator/changes/<id>.json    what the change is and where it stands
 *   ~/.orchestrator/worktrees/<id>/      the Implementer's copy
 *
 * State is on disk, not in memory, so every copy of this server — Claude
 * Code's and the web app's — sees the same changes.
 */
const HOME = process.env.ORCHESTRATOR_HOME || join(homedir(), ".orchestrator");
const CHANGES = join(HOME, "changes");
const WORKTREES = join(HOME, "worktrees");
const ID = /^c[a-z0-9]{6,24}$/;

// Hooks are shared by every worktree of a repository, so a post-checkout or
// post-commit hook would run on our behalf with nobody having asked for it.
const GIT = ["-c", "core.hooksPath=/dev/null"];

function git(args, cwd, input) {
  return new Promise((done, fail) => {
    const child = execFile("git", [...GIT, ...args], { cwd, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) fail(new Error(String(stderr || err.message).trim().split("\n").slice(-3).join(" ")));
      else done(String(stdout));
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

/** The repository's top level, or null when `dir` is not inside one. */
export function repoTop(dir) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------- record */

function save(change) {
  mkdirSync(CHANGES, { recursive: true });
  const file = join(CHANGES, `${change.id}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(change, null, 2)}\n`);
  renameSync(tmp, file);
  return change;
}

export function loadChange(id) {
  if (!ID.test(String(id ?? ""))) throw Object.assign(new Error(`No such change: ${id}`), { code: -32602 });
  try {
    return JSON.parse(readFileSync(join(CHANGES, `${id}.json`), "utf8"));
  } catch {
    throw Object.assign(new Error(`No such change: ${id}`), { code: -32602 });
  }
}

export function openChange(id) {
  const change = loadChange(id);
  if (change.status !== "open") throw new Error(`Change ${id} was already ${change.status}.`);
  return change;
}

export const updateChange = (change, patch) => save({ ...change, ...patch, updated: new Date().toISOString() });

/** Newest first. */
export function listChanges(repo) {
  const top = repoTop(repo);
  let files = [];
  try {
    files = readdirSync(CHANGES).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(CHANGES, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter((c) => c && c.repo === top)
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
}

/* ---------------------------------------------------------------- lifecycle */

/**
 * A symlink in the checkout that points outside it would let an edit "inside
 * the workspace" land anywhere the link leads. Bob checks paths, not where
 * they resolve, so refuse such a checkout up front.
 */
async function escapingLinks(worktree) {
  const out = await git(["ls-files", "-s"], worktree);
  const root = realpathSync(worktree);
  const escaping = [];
  for (const line of out.split("\n")) {
    if (!line.startsWith("120000")) continue;
    const file = line.split("\t")[1];
    const target = readlinkSync(join(worktree, file));
    const where = resolve(dirname(join(root, file)), target);
    const rel = relative(root, where);
    if (isAbsolute(target) || rel.startsWith("..") || isAbsolute(rel)) escaping.push(file);
  }
  return escaping;
}

/**
 * Cuts a worktree from the working state at `repo` — staged and unstaged
 * changes to tracked files included, via `git stash create`, which records them
 * without touching the checkout. Untracked files are not carried over.
 */
export async function createChange(repo, task) {
  const top = repoTop(repo);
  if (!top) throw new Error(`${repo} is not a git repository, and the Implementer needs one to work in a copy of it.`);
  let base = (await git(["stash", "create"], top)).trim();
  if (!base) {
    try {
      base = (await git(["rev-parse", "HEAD"], top)).trim();
    } catch {
      throw new Error("The repository has no commits yet; make one so the Implementer has something to copy.");
    }
  }

  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const branch = `orchestrator/${id}`;
  const worktree = join(WORKTREES, id);
  mkdirSync(WORKTREES, { recursive: true });
  await git(["worktree", "add", "-q", "-b", branch, worktree, base], top);

  const links = await escapingLinks(worktree);
  if (links.length) {
    await removeWorktree({ repo: top, worktree, branch });
    throw new Error(`The repository has symlinks that point outside it (${links.slice(0, 3).join(", ")}), so edits could escape the copy. Not running the Implementer here.`);
  }

  const now = new Date().toISOString();
  return save({
    id,
    repo: top,
    // Where the Implementer works, matching where the server was pointed.
    workspace: join(worktree, relative(top, realpathSync(repo))),
    worktree,
    branch,
    base,
    task,
    status: "open",
    created: now,
    updated: now,
    rounds: [],
    reviews: [],
  });
}

/** Commits whatever the Implementer left, so each round is its own step on the branch. */
export async function commitRound(change, round) {
  await git(["add", "-A"], change.worktree);
  const pending = (await git(["status", "--porcelain"], change.worktree)).trim();
  if (!pending) return false;
  await git(
    ["-c", "user.name=Orchestrator", "-c", "user.email=orchestrator@localhost", "commit", "-q", "--no-verify", "-m", `Implementer round ${round}`],
    change.worktree,
  );
  return true;
}

/** The whole change against the state it was cut from. */
export async function diffChange(change) {
  const [patch, numstat] = await Promise.all([
    git(["diff", "--binary", change.base, "HEAD"], change.worktree),
    git(["diff", "--numstat", change.base, "HEAD"], change.worktree),
  ]);
  const files = numstat
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [add, del, ...name] = l.split("\t");
      return { file: name.join("\t"), insertions: Number(add) || 0, deletions: Number(del) || 0 };
    });
  return {
    patch,
    files,
    insertions: files.reduce((n, f) => n + f.insertions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
  };
}

async function removeWorktree(change) {
  try {
    await git(["worktree", "remove", "--force", change.worktree], change.repo);
  } catch {
    rmSync(change.worktree, { recursive: true, force: true });
    await git(["worktree", "prune"], change.repo).catch(() => {});
  }
  await git(["branch", "-D", change.branch], change.repo).catch(() => {});
}

/**
 * Applies the change to the user's checkout as uncommitted edits, for them to
 * read and commit themselves. The user's call, never a model's.
 */
export async function applyChange(id) {
  const change = openChange(id);
  const { patch, files } = await diffChange(change);
  if (!patch.trim()) throw new Error("The change is empty — there is nothing to apply.");
  try {
    await git(["apply", "--whitespace=nowarn", "-"], change.repo, patch);
  } catch (e) {
    throw new Error(
      `It no longer applies cleanly — the files it touches changed since it was made (${e.message}). ` +
        `To merge it by hand: git -C "${change.repo}" diff ${change.base.slice(0, 12)} ${change.branch} | git -C "${change.repo}" apply --3way`,
    );
  }
  await removeWorktree(change);
  return updateChange(change, { status: "applied", applied: files.map((f) => f.file) });
}

export async function discardChange(id) {
  const change = openChange(id);
  await removeWorktree(change);
  return updateChange(change, { status: "discarded" });
}
