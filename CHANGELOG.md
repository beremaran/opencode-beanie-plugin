# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
