# AGENTS.md

OpenCode plugin (TypeScript, ESM) that combines 6 prior tools into one package: agent orchestration, subagent throttling, persistent goals, OpenAI-compatible provider auto-config, MCP tool aggregation, and skill discovery (see TODO.md for the source repos).

## Commands

- `npm run check` — the verification gate: `tsc --noEmit`. Run this after any change.
- `npm run build` — `tsc` emitting to `dist/`. Required before the plugin is loadable in OpenCode (package `exports` point at `dist`).
- No tests, linter, or formatter are configured. `check` is the only CI-equivalent.

## Architecture

- `src/index.ts` is the single plugin entrypoint: it composes 6 features through `composePlugins` in `src/compose.ts`. To add functionality, create `src/features/<name>/index.ts` exporting a `Plugin` and register it in the `features` record in `src/index.ts` — do not add hooks directly to `index.ts`.
- Each feature is `(input, options) => Hooks`. Its per-feature options are read from `options.<featureName>` (compose.ts:21), so option names must be camelCase (the JSON schema uses kebab-case, e.g. `per_page`).
- `composePlugins` merges features: same-named function hooks chain in feature order, `tool` maps are merged and duplicate tool names **throw** at init, and a feature init error aborts the whole plugin (wrapped as `[opencode-beanie-plugin] feature "x" failed to initialize`).
- Runtime hooks matter: `config` mutates the config object in place; `command.execute.before` receives `(command, output)` and must `replaceTextPart(output.parts, ...)` to answer slash commands; `event` is where `session.idle` drives goal evaluation and throttle queue release.

## Toolchain quirks

- `module`/`moduleResolution` is `NodeNext` — relative imports **must** use explicit `.js` extensions (`./compose.js`).
- There is no `@types/node`. Each feature ships a hand-written `node-shims.d.ts` declaring only the `node:*` API surface it uses. If you need more Node APIs, extend the local shim; do not add `@types/node`. Skillbox reads env via `globalThis.process?.env` to stay runtime-agnostic.
- `@opencode-ai/plugin` is pinned to `latest`; API surface can drift. When hooks/types change upstream, reconcile the features accordingly.
- Code is written very densely (single-line helper functions). Preserve this style; do not reformat existing files.

## Feature notes

- **orchestrator**: `subagentModel` option is required and throws at init otherwise; it injects/permission-blocks agents and tools via the `config` hook.
- **goal**: persists state to disk via `FileGoalStore` (state dir scoped by project + directory). Every idle turn triggers an evaluator model call (the expensive path); token/turn budgets cap it.
- **providers**: persists a provider store to disk, injects providers into `config`, and serves the `/add-provider` and `/providers` slash commands.
- **throttle**: intercepts the `task` tool (`tool.execute.before`/`after`), default `maxParallel` 2, mode `session`|`global`.
- **toolbox**: aggregates MCP tools via `ConnectionManager`, which spawns child processes; `dispose` closes connections and force-kills stale processes.
- **skillbox**: exposes `list_skills`/`search_skills`/`load_skill` MCP-driven tools with byte-budgeted payload truncation.

## Gotchas

- `dist/` is gitignored build output; never edit it.
- After `npm install`, lockfile is committed; keep it in sync.
- Testing against a live OpenCode requires building and registering the plugin via the `plugin` array in `opencode.json` (README).
