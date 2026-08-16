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
