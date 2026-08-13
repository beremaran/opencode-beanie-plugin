# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
