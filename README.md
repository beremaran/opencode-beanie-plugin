# opencode-beanie-plugin

Beanie is an OpenCode plugin with opt-in workflow features for productive agent sessions. The server plugin currently
provides goals, throttling, papercuts, commit commands, and an asynchronous multi-agent orchestrator. The orchestrator
is disabled unless configured explicitly; see [docs/orchestrator.md](docs/orchestrator.md).

## Development

Install dependencies with Bun:

```bash
bun install
```

Useful verification commands:

```bash
bun test
bun run lint
bun run typecheck
bun run build
```

The package exposes its server plugin from `src/index.ts`.

## Goals

Goal status is authoritative in durable, per-session records stored under
`$XDG_STATE_HOME/opencode-beanie-plugin` (or `~/.local/state/opencode-beanie-plugin` when
`XDG_STATE_HOME` is unset). Records are scoped by project, worktree, and session, so status is
not process-memory-only and survives normal plugin disposal and restart. Deleting a session
removes its goal record.

The `sidebar_footer` TUI slot displays the selected session and watches that session's same
authoritative record. A missing record clears the display; a transient malformed read keeps the
last-known-good state until a valid or missing read is observed.

### Goal tools (v2)

The plugin exposes three durable goal tools. Use them in order to manage multi-step work:

| Tool | Purpose |
|------|---------|
| `goal_set` | Create or replace this session's durable goal with an outcome, constraints, and verification criteria. |
| `goal_status` | Check the active goal, its progress, blockers, and verification state. |
| `goal_update` | Update goal progress, record blockers, capture verification evidence, or mark the goal completed. |

**Typical workflow:**
1. Call `goal_set` to define what you want to achieve.
2. Call `goal_status` before starting work to understand the current state.
3. Call `goal_update` as you make progress, report blockers, or claim completion.

> **Note:** In v1, goals used `get_goal` and `update_goal`. These were replaced in v2 with the
> explicit `goal_set` / `goal_status` / `goal_update` trio for clearer CRUD semantics. Legacy
> aliases are not provided because this is a major version (2.0.0) with intentional breaking changes.
