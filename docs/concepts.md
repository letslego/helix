# Helix concepts

## Filesystem as the authoring interface

Helix treats conventional paths as the API surface:

- `agent/instructions.md` — always-on prompt
- `agent/agent.ts` — model/runtime config via `defineAgent`
- `agent/tools/*.ts` — tools via `defineTool` (name defaults to filename)
- `agent/skills/*.md` — on-demand procedures with YAML front matter
- `agent/policies.json` — approval/deny/max-call policy

## Durability

Each run writes:

- `.helix/sessions/<id>.json` — messages, usage, pending approvals
- `.helix/events.jsonl` — append-only timeline
- `.helix/memory.json` — facts/episodes/preferences

Crash the process mid-turn and you still have checkpoints plus a replayable log.

## Approvals

Tools can set `requiresApproval: true`, or policies can list tool names in `requireApprovalFor`. When gated, Helix parks the session until an operator resolves the approval in the console API.

## Providers

- `provider.mock: true` (default in scaffolds) uses a deterministic demo model.
- Otherwise Helix calls an OpenAI-compatible Chat Completions endpoint.
- `fallbackModels` are tried in order when a model request fails.
