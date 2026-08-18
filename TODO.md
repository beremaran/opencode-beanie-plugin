# TODO: Feature Parity Gap — `v2` vs `main`

The `v2` branch restructured the plugin from `src/features/*` into `src/domains/*`. Only
**goals**, **orchestrator**, and **throttle** were carried over (rewritten as domains), and two new
domains were added (`commit-command`, `papercuts`). The rest of the `main` feature set was dropped.

Carried over: `goal` → `src/domains/goals`, `orchestrator` → `src/domains/orchestrator`,
`throttle` → `src/domains/throttle`.
New in v2: `src/domains/commit-command`, `src/domains/papercuts`.

## Missing Features

### 1. Providers (`src/features/providers/`, ~1.1k lines)

Missing entirely in v2. Managed OpenAI-compatible providers and their models in opencode.json.

- Commands (registered in the `config` hook):
  - `/add-provider <id> <baseURL> [apiKey] [--name "Display Name"] [--kind auto|openai|ollama|unsloth|lmstudio] [--context N] [--output N] [--no-fetch]`
  - `/providers` — list configured providers with live model counts
- On startup, for each configured source: fetched models from `modelsUrl` (OpenAI `/v1/models` style,
  kind-specific handling for `auto|openai|ollama|unsloth|lmstudio`) and wrote `provider` entries into
  opencode.json (`npm` defaulting to `@ai-sdk/openai-compatible`, `options.baseURL/apiKey/headers`,
  merged user model overrides, `include`/`exclude` filters, `defaultLimit` context/output caps),
  then optionally set `model` and `small_model` from plugin options.
- Options: `providers[]` (id, name, baseUrl, apiKey, headers, npm, kind, modelsUrl, fetchModels,
  staticModels, overrides, include, exclude, defaultLimit, env, timeout), `model`, `smallModel`.
- Files: `commands.ts`, `env.ts`, `index.ts`, `log.ts`, `models.ts`, `node-shims.d.ts`, `options.ts`,
  `store.ts`, `types.ts`.
- Cross-dependency: used `applyOptionsToFile` from `configurator/opencode-file.ts` (see item 4), so this
  depends on the configurator being restored first.
- Acceptance: `/add-provider` and `/providers` work; model fetch failures are logged and non-fatal;
  provider entries merge with pre-existing user config instead of overwriting.

### 2. Skillbox (`src/features/skillbox/`, ~1.4k lines)

Missing entirely in v2. Exposed the agent-skill registries to the agent.

- Tools:
  - `list_skills` — views `all-time|trending|hot`, pagination (`page`, `per_page` max 100), optional descriptions
  - `search_skills` — keyword `query` (min 2 chars), `limit` (max 50), optional `owner`, description truncation at 300 chars
  - `load_skill` — `id`, optional `include_supporting_files`, `max_bytes` (500–100_000) with byte-accurate truncation marker
- Registries (`registries/factory.ts`):
  - `github` (default) with default sources: `vercel-labs/skills`, `anthropics/skills`, `obra/superpowers`,
    `mattpocock/skills`, `microsoft/azure-skills`, `supabase/agent-skills`, `prisma/skills`
  - `skills-sh` (requires `skillsShToken`)
  - `auto` mode: skills-sh if a token is present, otherwise github
- Support: HTTP layer (`http.ts`, `HttpError`), disk cache (`cache.ts`), SKILL.md frontmatter parsing
  (`frontmatter.ts`), shared types/errors (`types.ts`: `SkillSummary`, `SkillDetail`, `SkillFile`,
  `SkillNotFoundError`, `RegistryAuthError`).
- Options: `registry` (`auto|skills-sh|github`), `skillsShToken`, `githubToken`, `githubSources`, `maxBytes`, `debug`.
- Files: `cache.ts`, `frontmatter.ts`, `http.ts`, `index.ts`, `registries/factory.ts`,
  `registries/github.ts`, `registries/skills-sh.ts`, `types.ts`.
- Acceptance: all three tools registered under the `skillbox` domain; auto registry selection; cache
  hit/miss verified by tests.

### 3. Toolbox (`src/features/toolbox/`, ~1.3k lines)

Missing entirely in v2. Aggregated tools from configured MCP servers into this session.

- Tools:
  - `list_tools` — search/reachability listing across upstreams (`limit`, optional `server`, `refresh`)
  - `get_tool_schema` — full JSON Schema for one upstream tool (bare name or `servername__tool`)
  - `invoke_tool` — call an upstream tool and faithfully serialize its result (content +
    `structuredContent` + `isError`)
- Internals:
  - `config.ts` — full config normalization/validation (server specs, env `${VAR:-default}` substitution,
    glob filters, search top-k 1–500, process pool 1–64, timeout 1–600 s, idle timeout 0–1 h)
  - `connection.ts` — `ConnectionManager`: stdio/HTTP MCP connections, stale-connection force-kill,
    `closeAll` on dispose
  - `registry.ts` — `UpstreamRegistry` + `ToolRegistry` naming (`servername__tool`)
  - `tools.ts`, `filters.ts`, `logger.ts`
- Options: `servers` map (command/args/env or url/headers per server), `searchTopK`, `processPoolSize`,
  `timeoutSeconds`, `idleTimeoutMs`.
- Acceptance: configured servers connect and their tools are listed/invocable; dispose closes all
  connections; stale connections are force-killed.

### 4. Configurator (`src/features/configurator/`, ~1.3k lines)

Missing entirely in v2. Self-service configuration of the plugin itself.

- Tool: `configure_plugin` — actions `status|schema|validate|apply`; `scope` `auto|project|global`;
  writes validated options into the right opencode.json.
- Commands: `/beanie status`, `/beanie validate`, `/beanie apply`, `/beanie init` (guided setup),
  `/beanie help`.
- Internals:
  - `opencode-file.ts` — `parseBeanie`, `applyOptionsToFile`, `resolveTargetPath`, `isPluginEntryName`,
    `PLUGIN_NAME` (also reused by providers, see item 1)
  - `schema.ts` — `PLUGIN_OPTIONS_SCHEMA` (JSON Schema for all plugin options; must be extended when
    the other features return)
  - `validate.ts` — `validateFullOptions`
  - `commands.ts` — renderers: `renderStatus`, `renderValidation`, `renderApply`, `renderHelp`,
    `renderInitDirective`
- Files: `commands.ts`, `index.ts`, `node-shims.d.ts`, `opencode-file.ts`, `schema.ts`, `validate.ts`.
- Acceptance: `configure_plugin apply` writes and persists options; `validate` reports all errors
  without writing; `/beanie` command suite behaves identically to main.

**Verification (implemented, commit `75a2345`; 53 tests pass, lint clean):**

- Good: `configure_plugin` implements all four actions (status/schema/validate/apply) with scope
  `auto|project|global`; the `/beanie` suite (status/validate/apply/init/help) is registered via the
  `config` + `command.execute.before` hooks; the text-span upsert in `opencode-upsert.ts` is robust
  (replaces existing entries, inserts into an existing array, adds the array when absent, preserves
  other plugins); `validateFullOptions` reuses the orchestrator's `parseOrchestratorConfig` instead of
  duplicating it; the schema covers all seven feature namespaces (forward-looking).
- Bad:
  - `orchestrator.subagentModel` is a phantom "required" option — the tool description, `renderHelp`,
    and `renderInitDirective` all claim it is required, but no such field exists (the v2 orchestrator
    uses `manager`/`build`/`coordinators` with `.model`), `schema.ts` has no `subagentModel` property,
    and `validateFullOptions({})` reports zero errors (nothing is actually required). The help text is
    stale from `main`.
  - `/beanie apply` with no payload writes `{}` (wipes the config), while the tool's `apply` with no
    `config` uses the current options — the two apply paths disagree on the no-arg case.
  - File-length rule (<200 lines) violated: `index.ts` (260), `schema.ts` (263), `validate.ts` (221).
- Improvable: fix the `subagentModel` help text to match v2's real orchestrator options and drop the
  false "required" claim; make the command vs. tool `apply` paths consistent; the `subagent_depth` read
  via `(cfg as Config & {subagent_depth?: unknown})` is a non-standard field that is likely always
  undefined (dead-ish path); split `index.ts` (it holds both the tool executor and the command handler).
- Diverged from spec: spec lists `node-shims.d.ts` (absent) and `parseBeanie` in `opencode-file.ts`
  (it's in `commands.ts`); impl adds `opencode-upsert.ts` (not in spec) and moves `isPluginEntryName`
  there. `goal` options are forward-looking: schema/validate include `evaluatorModel`, `stateDirectory`,
  `defaultTokenBudget`, `maxTranscriptChars`, etc., but the goals domain reads none of them yet (item 6
  not done) — acceptable per spec, but setting them now is a no-op.

### 5. Directives (`src/features/directives/index.ts`)

Missing entirely in v2. Note: v2's `src/domains/orchestrator/directives.ts` is unrelated — it configures
orchestrator agents/commands, not this guidance injection.

- Appended "when to use" guidance to the plugin's own tool descriptions via the `tool.definition`
  hook. Default guidance covered: `get_goal`, `update_goal`, `list_skills`, `search_skills`,
  `load_skill`, `configure_plugin`.
- Injected a `# Plugin capabilities (opencode-beanie-plugin)` section via
  `experimental.chat.system.transform`, listing mechanism notes for: goal, orchestrator, throttle,
  skillbox, toolbox, providers, configurator.
- Options: `defaults` (bool), `system` (extra system lines), `tools` (tool id → guidance map),
  `mechanisms` (subset of the seven mechanism keys).
- Acceptance: plugin tool descriptions carry `[opencode-beanie-plugin]` guidance; the system section is
  injected with the correct mechanism subset; custom `tools`/`system` entries are appended.

### 6. Goal LLM Evaluator + Auto-Continuation (part of `src/features/goal/`)

v2's `domains/goals` rewrote goals as a manual state machine (`goal_status`/`goal_set`/`goal_update`,
statuses `active|paused|blocked|completed|cancelled`, `verificationEvidence` required for completion).
The main branch additionally had automatic, LLM-driven goal evaluation:

- `session.idle` hook → `evaluateGoal` (`evaluator.ts`): built a transcript from the session
  (`transcript.ts`, `maxTranscriptChars` default 48k), ran an LLM evaluator
  (`evaluatorModel`/`evaluatorAgent`), parsed the fenced/brace JSON `EvaluationDecision`
  (`complete` + `reason`), and recorded a `CompletionClaim` for independent verification.
- Auto-continuation: when the goal was incomplete and under budget, injected a continuation prompt
  after `continuationDelayMs`; statuses `budget_limited` and `turn_limited` based on `tokenBudget`,
  `maxTurns`, and live `tokensUsed`/`remainingTokens` accounting.
- Lifecycle extras: pause + toast on `MessageAbortedError` (session.error), toast notifications
  (6 s), active-goal context injected via `experimental.chat.system.transform` and
  `experimental.session.compacting`.
- Slash command: `/goal status|help|clear|pause|resume|set <objective> [--tokens N] [--max-turns N]`.
- Options: `evaluatorModel`, `evaluatorAgent`, `stateDirectory`, `maxTranscriptChars`,
  `defaultTokenBudget`, `defaultMaxTurns`, `continuationDelayMs`, `deleteEvaluatorSessions`.
- Files: `evaluator.ts`, `prompts.ts`, `transcript.ts`, `types.ts`, plus budget logic in `lifecycle.ts`.
- Acceptance: evaluator runs on idle, completion claims are verified, budget/turn limits are enforced,
  interrupted sessions pause the goal. Must be adapted to the v2 goals domain model (which currently has
  no token budgets or evaluator at all).

### 7. TUI Dashboard (`src/tui/dashboard.tsx` and friends)

v2 registers only two TUI footers (goals, throttle) in `src/tui.tsx`. The `main` branch had a full
route-based OpenTUI dashboard:

- `dashboard.tsx` — per-session dashboard route with panels, health rows, status colors, and empty
  states
- `attention.ts` — attention/needs-review surfacing
- `goal-controls.ts` — goal control widgets
- `navigation.ts` — route navigation
- `snapshot-store.ts` — reactive snapshot store
- `derive.ts` — snapshot derivation (diffs, LSP, MCP, pending permissions, question, todos, sessions)
- `events.ts` — TUI refresh event names
- `types.ts` — `TuiDashboardSnapshot`, `TuiHealthRow`, `TuiSession`, `TuiProviderSummary`, `TuiTodoItem`, etc.
- Acceptance: dashboard route renders for a session; snapshots are derived from the v2 domain state
  (goals/throttle first, then orchestrator/toolbox once restored); refresh events trigger re-derivation.

## Missing Infrastructure / Non-Feature Items

- `.github/workflows/publish.yml` — tag-triggered (`v*`) publish workflow: Node 24, install, type check,
  build, git-tag-vs-package-version verification, `npm publish --provenance --access public` under an
  `npm-publish` environment. Must be recreated; consider adapting to Bun since v2 dropped
  `package-lock.json` in favor of `bun.lock`.
- `CHANGELOG.md` — removed in v2; recreate if releases continue.
- `LICENSE` (MIT) — removed in v2; required for public npm publishing.
- `package.json` — v2 dropped `version` (main was `0.2.1`), `repository`, and `publishConfig`; needed
  for publishing.
- Lint toolchain — v2 replaced `biome.json` with `eslint.config.js` (already handled, noted for
  context only).

## Suggested Order

1. Configurator (item 4) — providers depends on its `opencode-file.ts` helpers, and `configure_plugin`
   is the control point for everything else. (Done — see verification notes above; fix the flagged
   issues before `providers` leans on this domain.)
2. Providers (item 1)
3. Skillbox (item 2) and Toolbox (item 3) — independent of each other.
4. Directives (item 5) — re-enable guidance for all restored tools.
5. Goal evaluator (item 6) — integrate into the v2 goals domain.
6. TUI dashboard (item 7) — last, since it depends on live state from all restored domains.
7. Infrastructure — publish workflow, CHANGELOG, LICENSE, package.json fields.
