# Orchestrator MCP server

Gives Claude grounded facts about a repo, so it plans against real contracts
instead of guessing. Runs as an MCP server, which means **inference is billed to
the user's own Claude plan** — no API key, no second bill.

Zero dependencies. Plain `node`, nothing to install.

## Connect it to Claude Code

`.mcp.json` in the repo root already declares it:

```json
{
  "mcpServers": {
    "orchestrator-bob": {
      "command": "node",
      "args": ["mcp/server.mjs"],
      "env": { "ORCHESTRATOR_REPO": ".", "ORCHESTRATOR_SECURITY": "restricted" }
    }
  }
}
```

Restart Claude Code in this directory and approve the server when prompted.
Verify with `/mcp`, then ask something like *"which endpoints does this repo
call?"* After editing `mcp/*.mjs`, reconnect with `/mcp` — Claude Code keeps
the old copy running until you do.

To point it at a different repo, set `ORCHESTRATOR_REPO` to that path.

The server inherits its environment from whoever spawns it, so `BOB_API_KEY`
has to be exported in the shell that starts Claude Code (and the dev server).

## The web app's copy

The dev server runs a second copy of the same server and exposes it to the page
at `/bob-api` (`bobBridge` in `vite.config.ts`). That is how models connected
through ICA call these tools — see "Bob in the chat" in `context/CLAUDE.md`.

| Route | Does |
|---|---|
| `GET /bob-api/status` | `orchestrator/status` — server, repo and whether it is under git, security level, Bob Shell, roles, playbook, changes |
| `GET /bob-api/tools` | `tools/list` |
| `POST /bob-api/call` | `tools/call` with `{ name, arguments }`; closing the request cancels the call |
| `POST /bob-api/security` | `orchestrator/setSecurity` with `{ level }` |
| `GET /bob-api/changes` | `orchestrator/changes` — the implementer's changes for this repo |
| `POST /bob-api/changes/apply` | `orchestrator/applyChange` with `{ id }` — the user's decision, from the app's buttons |
| `POST /bob-api/changes/discard` | `orchestrator/discardChange` with `{ id }` |
| `POST /bob-api/repos/choose` | `orchestrator/chooseFolder` — opens the OS's folder dialog; `{ path }`, or `null` if cancelled |
| `POST /bob-api/repos/select` | `orchestrator/setRepo` with `{ path }` — switches every tool to that folder |

Local only: the peer must be loopback, `Host` must be localhost, and any
`Origin` must match `Host` — a page on another site, or a DNS-rebinding
attack, cannot drive a tool that reads your repo. POSTs must be
`application/json`, which a cross-site form cannot send. The bridge starts the
server on first use, restarts it if it dies, and reloads it when `mcp/*.mjs`
changes.

## Tools

| Tool | Answers | Answered by |
|---|---|---|
| `list_endpoints` | every route, its methods, where it is defined, who calls it | scanner |
| `get_endpoint_contract` | one route's methods, definition sites and callers, plus its request/response contract | scanner facts, then a Bob explorer |
| `search_endpoints` | routes matching a keyword in path or filename | scanner |
| `diff_route` | what changed between an old route and its replacement, and who still calls the old one | scanner |
| `delegate` | one task for a read-only role: `explorer` (find and explain code) or `verifier` (rule on claims); `follow_up` resumes the same agent | Bob |
| `implement_change` | a code change made in its own git worktree; with `change_id`, a revision of it | Bob implementer |
| `review_change` | a critique of a change: `approve` or `changes_requested`, issues by severity | Bob reviewer |

The Bob tools are listed only when `bob` is installed, and the change tools
only when the repo is under git. The listing tools stay on the scanner even
with Bob present: they are exhaustive, instant and free, where Bob would be a
slow paraphrase of the same facts.

The server's `initialize` result carries `instructions` — the playbook for
leading the roles (fan out explorers in one turn, verify what decides the next
step, implement → review → revise for at most three rounds, never claim a
change is applied). The web app puts the same text in its system prompt.

Every result carries `_meta["orchestrator/trace"]`: `source` (`"bob"` or
`"scanner"` — a scanner answer is never passed off as Bob's), Bob's own stats
when it ran (`session_costs`, `duration_ms`, `tool_calls`, `task_id`), the
role's own fields (`role`, `change_id`, `round`, `verdict`, `cited` and
`verified` citation counts, `files`/`insertions`/`deletions`), and what the
filter did (`security`, `blocked`, `redactions`).

Non-standard methods beside the MCP ones, for the web app: `orchestrator/status`,
`orchestrator/setSecurity`, `orchestrator/changes`, `orchestrator/applyChange`,
`orchestrator/discardChange`, `orchestrator/chooseFolder` and
`orchestrator/setRepo`. Applying is deliberately a method and not a
tool, so no model can apply a change — only the app's buttons reach it.
`notifications/cancelled` is honored — it kills the Bob run behind that request.

## Choosing the repo

Each copy of the server works in one folder at a time (`mcp/workspace.mjs`).

- **Claude Code's copy** is pinned by `.mcp.json` (`ORCHESTRATOR_REPO=.`) to
  the project Claude Code has open, and never switches.
- **The web app's copy** switches at runtime from the Bob page: **Choose
  folder…** opens the operating system's own dialog (`osascript` on macOS,
  `zenity` on Linux, PowerShell on Windows), run by the server so it returns a
  real path — a browser's folder picker hands the page a handle, never a path
  a Bob process can work in. Recent folders and a pasted path work too.
- At startup: `ORCHESTRATOR_REPO` > the last choice (`mcp/repos.local.json`,
  gitignored) > cwd.
- **Refused:** the filesystem root, the home folder itself, anything that is
  not a folder, and anything inside `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.kube`,
  `~/.docker`, `~/.config`, `~/.bob`, `~/.claude`, `~/.orchestrator`,
  `~/Library` or the system folders. Bob reads a workspace as freely as
  source, so these are never one.
- A folder that isn't under git is allowed; the change tools are simply not
  listed there.
- Every trace records the `repo` the call read, fixed when it started. The chat
  replays only facts from the current repo, so a switch doesn't carry another
  project's findings into the next answer.

## Security levels

One filter gates everything on the way out, because every result leaves this
machine for a model we do not control.

The level lives in `mcp/settings.local.json`, which the Bob page writes and
every copy of this server re-reads on every call — so the level chosen in the
web app also governs Claude Code's copy. Precedence: that file >
`ORCHESTRATOR_SECURITY` > `restricted`. The file is written atomically
(write, then rename), so a concurrent read never sees half of it and falls back
to a laxer default.

- **`none`** — no filtering.
- **`restricted`** (default) — API keys, bearer tokens, JWTs, private key blocks
  and `*SECRET*`/`*PASSWORD*` assignments are redacted from every result.
- **`private`** — as above, but a result that needed any redaction is
  **blocked** whole rather than sent scrubbed. Fails closed. The planned AST
  pass is not built.

The scanner never reads `.env*`, `.git/`, `.ssh/`, `node_modules/`, or
`*.pem|p12|key|keystore` files at any level. Bob has its own, narrower guard:
it always refuses `.env`, and refuses whatever the workspace's `.gitignore` and
`.bobignore` list, for reads, writes and listings alike. Anything else Bob can
read, so for Bob answers the output filter is the guard that matters.

## Bob

Bob Shell (`bob`, 2.0.5 at the time of writing) is found on `PATH`, or at
`BOB_BIN`. Without it the server answers from the source scanner alone, so it
stays useful and testable before Bob is set up.

Setup: install with `curl -fsSL https://bob.ibm.com/download/bobshell.sh | bash`
(Node 22.15+), create an **Inference** key at bob.ibm.com and export it as
`BOB_API_KEY`, then run `bob chat` once to accept IBM's license — a headless
run cannot show it.

### Roles

Four roles, defined in `roles/custom_modes.yaml` and installed by the server as
a Bob plugin at `~/.bob/plugins/orchestrator/custom_modes.yaml` — rewritten
whenever the shipped file changes, and never touching the user's own
`~/.bob/settings/custom_modes.yaml`. Uninstalling is deleting that folder.

| Role | Bob mode | Groups | Works in |
|---|---|---|---|
| explorer | `orch-explorer` | read | the repo |
| verifier | `orch-verifier` | read | the repo |
| implementer | `orch-implementer` | read, edit | the change's worktree |
| reviewer | `orch-reviewer` | read | the change's worktree |

They differ by stance and permission, not topic — the orchestrator's task text
says what to look at, so the same four serve any codebase. Each ends its answer
with one fenced json block; the server parses it, **checks every `file:line`
citation against the code** (the line must exist and hold the quoted fragment,
give or take three lines), marks the ones that fail, and renders the report
for the orchestrator. A role that forgets the block still returns its prose.

### Each run

```
bob run --format json --workspace <dir> --mode orch-<role> --max-turns <n> \
  [--resume <task_id>] \
  --disable-tool-groups [edit,]execute,mcp,mode,subtask,subagent,workflow \
  --disable-mcp --disable-subagents
```

- **The flags are the hard boundary; the mode is the ceiling.** Headless Bob
  pre-approves every tool it calls. Nothing may execute, reach other servers,
  switch mode (which could hop back to Agent and take the pre-approval with it)
  or spawn Bob's own subagents — orchestration has one owner. Only the
  implementer keeps `edit`.
- **Bob refuses paths outside the workspace**, absolute or via `..` (verified
  against 2.0.5), so the implementer's edits stay in its worktree.
- **A repository can shadow a role.** Bob merges workspace modes over global
  ones, so a repo's own `.bob/custom_modes.yaml` defining `orch-explorer` would
  replace ours. The flags still bound it, but the server refuses to run rather
  than run someone else's prompt under the role's name.
- **Up to three runs at once** (`BOB_MAX_PARALLEL`); more queue. The web app
  runs a turn's tool calls together, so a fan-out is real parallelism.
- **`--resume`** continues the same agent with its memory: `delegate`'s
  `follow_up`, and every implementer and reviewer round after the first.
  `session_costs` is cumulative across a resumed task.
- **The prompt goes on stdin**, not argv: argv is visible to every process
  through `ps`, and a prompt starting with `-` would parse as a flag.
- The answer is `last_message` from the single `--format json` result; `stats`
  rides along into the trace. In 2.0.5 that is `task_id`, `session_costs`,
  `max_cost`, `tool_calls` and `duration_ms` — no token counts.
- Timeouts by role: 240 s for explorer and verifier, 300 s for the reviewer,
  600 s for the implementer. Cancelling the request kills the run.

### Changes

The implementer never works in the user's checkout. `implement_change` cuts a
git worktree from the **working state** — `git stash create` records staged and
unstaged edits to tracked files without touching them; untracked files are not
carried over — on a branch `orchestrator/<id>`:

```
~/.orchestrator/changes/<id>.json     task, base, rounds, reviews, status
~/.orchestrator/worktrees/<id>/       the implementer's copy
```

(`ORCHESTRATOR_HOME` moves both.) State is on disk so every copy of the server
sees the same changes. Each round is committed on the branch; the diff is
always against the base. A checkout with a symlink pointing outside it is
refused, since an edit through it would land outside the copy. Every git call
runs with `core.hooksPath=/dev/null`: hooks are shared by every worktree of a
repository, and none should run on the orchestrator's behalf.

`orchestrator/applyChange` applies the diff to the user's checkout as
uncommitted edits, then removes the worktree and branch. If the files it
touches changed since, it refuses and gives the command to merge by hand.
`orchestrator/discardChange` removes them without applying.

That leg is process invocation, not MCP — the one hop in the chain with no
protocol guarantees. `bob acp` (Agent Client Protocol) is the structured
alternative if it proves too loose.

## Not yet

Streamable HTTP transport. **ChatGPT connects only to remote HTTPS MCP servers**
— no stdio — so that transport plus the outbound tunnel is what unlocks it.
stdio first because it needs no tunnel and gives the fastest loop.
