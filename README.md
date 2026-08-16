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
