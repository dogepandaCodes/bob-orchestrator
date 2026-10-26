# Archived: multi-provider chat app (2026-09-22)

Snapshot of the web app as it stood before the pivot to an MCP server. It is a
complete, buildable copy of `src/` and was working when archived:

- Live streaming chat against Anthropic, OpenAI and Gemini APIs, called
  directly from the browser (`src/lib/providers/`)
- Key verification at connect time, org-scoped Anthropic workspace support
- Per-message token usage, live model catalogs, Gemini callability probe
- Three full provider themes, the account dial, the switch confirm and the
  mid-reply lock

**Why it was retired:** it required users to buy API credit on top of the
Claude/ChatGPT subscription they already pay for, and there is no sanctioned
way to spend the subscription from a third-party app. See "Pivot to MCP" in
`context/CLAUDE.md`.

Not compiled or bundled — `tsconfig.json` only includes the live `src/`. To run
it, copy this folder somewhere else, restore the files and `npm install`.
