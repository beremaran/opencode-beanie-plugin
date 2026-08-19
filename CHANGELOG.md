# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-08-19

### Changed

- Major domain-driven architecture restructure from `src/features/*` to `src/domains/*`.
- Migrated codebase toolchain to Bun runtime and Bun test runner with ESLint flat config.
- Refactored all domains to comply strictly with repository size constraints (<200 lines per file, <=20 lines per method).

### Added

- **Goals Domain**: Durable per-session goal state machine, token budget accounting, subagent transcript analysis, LLM evaluator on session idle, auto-continuation dispatch, `/goal` slash command, and TUI status footers.
- **Orchestrator Domain**: Asynchronous multi-agent orchestration engine with DAG-based task scheduling, fan-out decomposition, isolated leaf execution, bounded artifacts, and recovery lifecycle.
- **Throttle Domain**: Subagent concurrency throttling with configurable permit pooling, live state persistence, and TUI sidebar indicators.
- **Skillbox Domain**: Multi-registry agent skill discovery supporting GitHub repositories and skills.sh with cached index resolution, frontmatter parsing, search, and byte-budgeted skill loading tools (`list_skills`, `search_skills`, `load_skill`).
- **Toolbox Domain**: Dynamic MCP upstream tool aggregator supporting stdio, SSE, and HTTP transports with connection pooling, health checks, filter globbing, schema introspection, and execution tools (`list_tools`, `get_tool_schema`, `invoke_tool`).
- **Directives Domain**: Plugin capability announcements in chat system prompts and contextual "when to use" guidance attached to plugin tools.
- **Configurator Domain**: Self-service plugin configuration via `configure_plugin` tool and `/beanie` command suite (`status`, `validate`, `apply`, `init`, `help`).
- **Papercuts Domain**: Session-level enhancements and papercut mitigations.
- **Commit Command Domain**: Slash command integration for guided, template-driven Git commit workflows.
- **TUI Companion**: Full-featured OpenTUI dashboard route, reactive snapshot store, health monitors, attention alerts, and goal interactive controls.

### Removed

- Dropped legacy `providers` feature in favor of native OpenCode multi-model configuration.

## [0.2.1] - 2026-08-13

### Fixed

- Toolbox (MCP aggregation): surface the spawned process's stderr in stdio server errors. A failing `npx`/`uvx` server previously surfaced only the SDK's cryptic `spawn <cmd>: Connection closed`; the child's actual diagnostic (e.g. `npm error 404`, missing package, permission errors) is now appended as `(stderr: …)`, so server misconfiguration is actionable.
- Toolbox (MCP aggregation): `list_tools` now auto-connects servers with no loaded metadata instead of reporting stale `0 tools`. Default calls trigger a connect-and-refresh when the cache is empty, stale, or the server is idle; `refresh=true` forces a reconnect+reload, `refresh=false` uses only already-loaded metadata (both documented in the tool description, schema, and README). Server rows carry a `[stale]` hint when counts come from a not-yet-loaded or stale cache.

## [0.2.0] - 2026-08-13

### Added

- Optional TUI companion at `@beremaran/opencode-beanie-plugin/tui`, registered separately in `tui.json`. Adds the Beanie dashboard route, palette commands and `<leader>d` shortcut, session status strip, confirmed goal controls, and attention notifications for unhealthy MCP/LSP services, session errors, and completed child sessions. Goal state is not shown live without a public OpenCode bridge; use `/goal status` instead.

## [0.1.5] - 2026-08-13

### Changed

- Codebase cleanup: adopt Biome-compliant formatting, naming conventions, and import ordering across all features, and split large feature modules (orchestrator, goal, providers, skillbox, toolbox) into smaller files with no behavior changes.

## [0.1.4] - 2026-08-13

### Fixed

- Expose a `./server` entrypoint (plus `main`/`types` fields) in the package `exports`. OpenCode 1.18's plugin loader resolves an npm plugin's server entrypoint from the `exports["./server"]` subpath or the `main` field; with only a root `.` export the plugin was reported as "does not expose a server entrypoint" and silently skipped, so no tools, slash commands, or provider models ever loaded. This matches the shape used by the working sibling plugins (`opencode-goal` exports `./server`; `opencode-agent-tree` etc. set `main`).

## [0.1.3] - 2026-08-13

### Added

- Providers: new `kind` option (`auto` | `openai` | `ollama` | `unsloth` | `lmstudio`) selects how model context windows are discovered. `unsloth` reads the real GGUF `context_length` from Unsloth Studio's `/api/models/gguf-variants` per model; `ollama` reads `/api/tags`; `lmstudio` reads LM Studio's native `/api/v0/models` (`max_context_length`, embedding models filtered out). This covers the common self-hosted servers whose OpenAI-compatible `/v1/models` listings expose no context at all.
- Providers: name-based context inference as a last-resort fallback for servers that report nothing (curated family table: Qwen, DeepSeek, Llama, Mistral, GLM, Kimi, Claude, GPT, …). Precedence is detected API value > `defaultLimit` > name inference.
- Providers: vision-capable models are auto-marked so OpenCode accepts image attachments — `attachment: true` plus `modalities: { input: ["text", "image"] }` (the field that actually gates image sending). Detected from Unsloth's `has_vision`, LM Studio's `type: "vlm"`, Ollama's `capabilities`, or embedded `has_vision`/`modalities`/`input_modalities`. `overrides` can set `attachment`/`modalities` to override. `modelOverride` options gain a `modalities` field.

### Fixed

- Providers: always write a complete model `limit` so OpenCode knows the context window and runs auto-compaction. Model listings frequently report only context (not max output); the plugin previously dropped the entire `limit` in that case, leaving OpenCode with `context = 0` and compaction disabled. A missing output now defaults to half the context (capped at 32000, OpenCode's `OUTPUT_TOKEN_MAX`), and a missing context to 128000.

## [0.1.2] - 2026-08-13

### Fixed

- Register feature tools with OpenCode: `composePlugins` built the merged `tool` map but never returned it, so none of the plugin's tools (`get_goal`, `update_goal`, `list_skills`, `search_skills`, `load_skill`, `list_tools`, `get_tool_schema`, `invoke_tool`, `configure_plugin`) were available to agents.
- Inject default directives: the `directives` feature skipped registration whenever no custom `system`/`tools` options were set, so the default system directive and per-tool guidance never loaded.

## [0.1.1] - 2026-08-13

### Changed

- Inline all feature config into plugin options; drop external JSON config files for `providers` and `toolbox` (the `servers` inline option now configures MCP servers directly).

## [0.1.0] - 2026-08-13

### Added

- Initial open-source release of the combined plugin.
- Published on npm as `@beremaran/opencode-beanie-plugin` via a GitHub Actions release workflow using trusted publishing (OIDC).
- Features: `orchestrator`, `throttle`, `goal`, `providers`, `skillbox`, `toolbox`, `directives`, and `configurator`.
- Slash commands: `/beanie`, `/goal`, `/add-provider`, `/providers`.
- Tools: `get_goal`, `update_goal`, `list_skills`, `search_skills`, `load_skill`, `list_tools`, `get_tool_schema`, `invoke_tool`, `configure_plugin`.
- MIT license and full documentation.
