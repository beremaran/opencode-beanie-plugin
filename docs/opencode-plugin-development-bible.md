# OpenCode Plugin Development Bible

This is an evidence-backed field guide for building, reviewing, and shipping OpenCode plugins. It separates **official behavior** documented by OpenCode from **community practice** observed in the corpus. Community code is evidence of a pattern, not a host guarantee.

Related documents:

- [Pattern catalog](opencode-plugin-development-patterns.md)
- [Build, review, and release checklist](opencode-plugin-development-checklist.md)

## Methodology and scope

The corpus was assembled from three requested sources: the `awesome-opencode` plugin list, the committed `opencode.cafe` catalog snapshot, and the official OpenCode ecosystem Plugins table. The manifest records 147 candidates, and the clone audit confirms 147 unique canonical repository roots, 147 actual Git directories, 147 verified analysis worktrees, zero unresolved candidates, zero duplicate roots, and zero extra directories. See `.research/opencode-plugin-corpus/manifest.json`, `.research/opencode-plugin-corpus/repo-map.json`, and `.research/opencode-plugin-corpus/clone-audit.md`.

Every report under `.research/opencode-plugin-corpus/per-repo/000.md` through `146.md` was used. The corpus excludes 108 source entries classified as standalone MCP servers, skill collections, themes, agents, projects, templates, documentation-only repositories, or unrelated tools; bundled repositories were retained when presented as OpenCode plugins. The live `opencode.cafe` page was client-rendered, so its committed `bulk/plugins.json` snapshot was used. Clones are shallow, current snapshots at the recorded heads, not historical longitudinal studies; reports may contain missing dependency verification or snapshot inconsistencies. The complete coverage index is at the end of this document.

## Evidence rules

- **Official:** stated by the current pages at [OpenCode Plugins](https://opencode.ai/docs/plugins/) and [OpenCode SDK](https://opencode.ai/docs/sdk/), fetched 2026-08-14. Treat these as the host contract, while still testing the installed host version.
- **Corroborated:** appears independently in multiple reports. Recommendations below name representative reports rather than claiming all 147 repositories agree.
- **Specialized:** useful for a narrow class such as TUI, OAuth, telemetry, or durable local state.
- **Risky or isolated:** observed implementation detail with a documented downside. Do not copy it without an explicit decision.
- Report citations use the requested relative form, for example `.research/opencode-plugin-corpus/per-repo/042.md:14-27`; source file and line references are included when the report provides them.

## 1. Mental model and lifecycle

An OpenCode plugin is a JavaScript/TypeScript module exporting one or more plugin functions. A function receives host context and returns a registration object containing hooks, tools, configuration mutation, commands, authentication/provider entries, or TUI registrations.

The official server-plugin context is `{ project, client, $, directory, worktree }`. `client` is the OpenCode SDK client; `$` is Bun's shell API; `directory` is the current directory; `worktree` identifies the Git worktree. The plugin function is an initialization boundary, not a request handler: capture dependencies and construct instance-scoped state there, then keep each returned hook small. This shape is demonstrated by the official basic structure and by `opencode-arise`, `opencode-background-agents`, and `opencode-beads` (`.research/opencode-plugin-corpus/per-repo/000.md:15-20`, `008.md:16-20`, `009.md:16-21`).

Typical lifecycle:

1. OpenCode discovers local files or npm packages and loads them at startup.
2. The host invokes plugin functions and collects registration objects.
3. Hooks run as host lifecycle events occur. Hook bodies may be async.
4. Tools and commands execute later with session, message, directory, worktree, and abort context.
5. Plugin-owned timers, watchers, child processes, files, and network clients must be stopped or made harmless when sessions disappear or the process exits.

The official load order is global config, project config, global plugin directory, then project plugin directory; hooks run in sequence. Duplicate npm packages with the same name and version load once, while similarly named local and npm plugins are separate. Do not infer a stronger ordering between individual hooks or rely on an undocumented "last writer wins" rule. If ordering matters, make the transformation idempotent, use a marker, or document a deliberate dependency ([official load-order documentation](https://opencode.ai/docs/plugins/#load-order)).

## 2. Current SDK surface and version drift

The current plugin contract and official examples describe these server surfaces. Experimental and community-only surfaces need separate compatibility checks:

| Surface | Use |
| --- | --- |
| `event` | Subscribe to command, file, installation, LSP, message, permission, server, session, todo, shell, tool, and TUI events. |
| `config` | Mutate the supplied config at load time. |
| `tool.<name>` | Add model-callable tools using `tool({ description, args, execute })`. |
| `tool.execute.before/after` | Inspect or modify tool execution. Throw to enforce a pre-tool policy. |
| `shell.env` | Add environment variables to shell execution. |
| `chat.message` and experimental chat transforms | Observe messages or change system/message context where supported. |
| `experimental.session.compacting` | Add context to, or replace, the compaction prompt. |
| TUI plugin APIs | Community and experimental TUI modules can register commands, slots, state, and disposal. |

The official SDK page documents `@opencode-ai/sdk` operations for health, logs, projects, config/providers, sessions, files, TUI, auth, and events. Notable session operations include `create`, `get`, `children`, `messages`, `prompt`, `prompt` with `noReply`, `prompt` with structured output, `abort`, `summarize`, and `delete`; `event.subscribe()` exposes an SSE stream. Use generated SDK types rather than hand-written client interfaces.

Version drift is real. Reports cite `@opencode-ai/plugin` versions from early `1.0.x` through `>=1.0.0`, `>=1.4.0 <2`, and current-looking pinned ranges; several repositories bridge missing runtime fields with local casts or `any` (`.research/opencode-plugin-corpus/per-repo/002.md:22-27`, `010.md:10-13`, `115.md:48-53`). Experimental hooks, TUI APIs, `PluginModule` metadata, auth loader shapes, and event payload fields are especially version-sensitive. The official pages do not provide a plugin SDK compatibility table or freeze the generated SDK version in the docs. Therefore:

- Pin or bound the host/plugin peer range and record the tested OpenCode version.
- Compile against the exact peer version used in CI.
- Add runtime contract tests with real-shaped event payloads.
- Narrow unavoidable casts to one adapter file, explain the missing field, and remove the cast when the SDK catches up.
- Treat a changed tool output format or prompt contract as a compatibility change even when TypeScript still compiles (`.research/opencode-plugin-corpus/per-repo/002.md:51-58`).

## 3. Minimal Architecture

Start with one boring entrypoint and separate domain code:

```ts
import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

export const ExamplePlugin: Plugin = async ({ client, directory, worktree }) => {
  const state = createState()

  return {
    config: async (input) => {
      input.config.command = {
        ...input.config.command,
        "example:status": {
          description: "Show example status",
          template: "Use the example_status tool and report the result.",
        },
      }
    },
    tool: {
      example_status: tool({
        description: "Return bounded status for the current session.",
        args: {},
        async execute(_args, context) {
          return JSON.stringify({
            sessionID: context.sessionID,
            directory,
            worktree,
            status: state.status,
          })
        },
      }),
    },
    event: async ({ event }) => {
      await handleEvent({ client, state, event })
    },
  }
}

export default ExamplePlugin
```

Keep registration, event adaptation, policy, persistence, provider transport, and presentation in separate modules. Large "god modules" make lifecycle and security review difficult; this was explicitly observed in large auth/orchestration implementations (`.research/opencode-plugin-corpus/per-repo/004.md:86-95`, `008.md:69-76`). A named export plus default alias is common, but export shape must match the loader and be tested; some ecosystem packages intentionally expose multiple named plugin factories (`.research/opencode-plugin-corpus/per-repo/002.md:12-20`, `129.md:15-18`).

## 4. Hooks, events, ordering, and mutation

Use the narrowest hook that can enforce the behavior:

- Use `config` for additive startup registration of commands, agents, instructions, or provider records.
- Use `tool.execute.before` for precondition checks and enforceable policy. Validate tool identity exactly; do not treat lookalikes as shells (`.research/opencode-plugin-corpus/per-repo/011.md:20-31`, `129.md:15-20`).
- Use `tool.execute.after` for bounded output shaping, metrics, or advisory post-processing. Do not pretend it can prevent an action that already happened (`.research/opencode-plugin-corpus/per-repo/056.md:54-74`).
- Use `command.execute.before` only when the tested host exposes it; treat command rewriting as version-sensitive and test the exact `output.parts` mutation (`.research/opencode-plugin-corpus/per-repo/110.md:10-17`).
- Use `event` for session, message, permission, file, command, and status signals. Parse event payloads defensively and ignore unknown events.
- Use `chat.message` for message-scoped observation or one-time context injection.
- Use system transforms for stable, explicitly delimited context. Preserve model and agent fields when synthesizing a no-reply prompt (`.research/opencode-plugin-corpus/per-repo/009.md:16-21`).
- Use compaction hooks to preserve decisions, active work, identifiers, errors, and recovery instructions; `output.prompt` replaces the default prompt, while `output.context` adds context only when `output.prompt` is not set ([official compaction-hook documentation](https://opencode.ai/docs/plugins/#compaction-hooks)).

Hooks are mutable data-flow boundaries. Initialize missing arrays/maps, preserve unrelated values, define name collision policy, and make repeated invocation safe. Config merge is common, but collisions differ: `opencode-beads` merges commands/agents while `CC Safety Net` deliberately lets existing commands win (`.research/opencode-plugin-corpus/per-repo/009.md:20-21`, `011.md:20-24`). Pick and test one policy.

Do not assume hook order beyond the official plugin load sequence. A two-hook handoff that stores state in one hook and consumes it in another is ordering-sensitive; scope it by session and clean it in `finally` (`.research/opencode-plugin-corpus/per-repo/002.md:14-17`, `003.md:18-21`). If two events can race, use a per-key promise/state machine and re-check user-owned state before writing.

## 5. Context and prompt transformation

Prompt changes are an authority boundary, not string formatting. Use these rules:

- Add provenance and source identity, but avoid exposing absolute local paths unless useful.
- Bound every file, CLI, memory, tool-output, and network-derived insertion by bytes or characters.
- Escape dynamic values for the chosen serialization. XML-like tags are not a security boundary; memory labels and values can corrupt the structure (`.research/opencode-plugin-corpus/per-repo/003.md:23-27`).
- Keep static instructions stable and dynamic material in separate sections to improve cache behavior (`003.md:23-27`).
- Treat repository files, fetched web pages, subprocess stdout, memory, and model-produced citations as untrusted content. Delimit and label them; never imply that delimiters prevent prompt injection.
- Preserve user and host context. Synthetic prompts should carry the current `model`, `agent`, and `noReply` intent.
- Prefer explicit tools for optional historical metadata rather than permanently polluting every message (`.research/opencode-plugin-corpus/per-repo/002.md:45-57`).
- On deletion or revocation, choose fail-open versus fail-closed deliberately. Serving cached instructions after the source is deleted is available but can violate revocation expectations (`.research/opencode-plugin-corpus/per-repo/115.md:20-37`).

## 6. Tools and commands

Tool descriptions are agent-facing behavioral contracts. Explain capability, limits, side effects, failure modes, and safe sequencing. Use `tool.schema` (the official helper) for runtime argument validation and add semantic bounds in execution code. A schema that says only `number` is not a positive integer policy (`.research/opencode-plugin-corpus/per-repo/030.md:21-24`).

Return concise, structured, bounded results. Include stable IDs for asynchronous work, status, timestamps, and a retrieval path. Convert expected validation failures into actionable tool text; preserve unexpected failures for diagnostics without dumping secrets.

Commands are configuration entries whose template instructs the model how to call the tool or workflow. Package command assets and test their names. Command registration can be additive, but name collisions and stale README examples are common release defects (`.research/opencode-plugin-corpus/per-repo/009.md:40-50`, `056.md:134-154`).

## 7. Auth and provider integrations

First decide whether the plugin needs provider integration at all. The safest default is to use OpenCode's configured providers and auth, resolve models through the SDK, and avoid copying credentials (`.research/opencode-plugin-corpus/per-repo/000.md:42-46`, `005.md:13-17`).

For a provider/auth plugin:

1. Register the narrowest auth/provider surface supported by the tested SDK.
2. Keep OAuth, storage, account selection, request transforms, and tools in separate modules.
3. Pass through unrelated requests unchanged when implementing custom `fetch`.
4. Forward `AbortSignal`, set bounded timeouts, classify retryable errors, cap backoff, and add jitter.
5. Store refresh tokens with restrictive permissions, file locking, atomic replacement, migrations, and delete-safe semantics (`.research/opencode-plugin-corpus/per-repo/004.md:47-67`).
6. Test provider precedence, missing auth, request bodies, streaming response transforms, refresh, expiry, and pass-through.

Provider integrations are specialized and can carry legal or terms-of-service risk. Unofficial proxying, hard-coded OAuth material, embedded client secrets, raw upstream errors, and model-generated citations require explicit review (`.research/opencode-plugin-corpus/per-repo/004.md:86-107`, `129.md:25-30`).

## 8. Configuration, schema, and environment

Configuration is user-owned input. A robust loader:

- Defines precedence: tuple options, project config, global config, environment, defaults, or another explicit order.
- Parses JSONC/YAML only with a syntax-aware parser when comments or formatting must survive.
- Validates with Zod or equivalent at the boundary, including ranges, enums, sizes, paths, and unknown-key policy.
- Reports the source of each effective value without printing secrets.
- Uses generated schema assets when users configure JSON (`.research/opencode-plugin-corpus/per-repo/004.md:56-60`).
- Distinguishes missing optional config from malformed required config.
- Does not mutate process-wide `process.env` to carry per-event values; pass an environment snapshot to each child instead (`.research/opencode-plugin-corpus/per-repo/056.md:93-96`).
- Makes invalid values visible through structured logs, a diagnostic command, or a status tool.

For config file edits, preserve unrelated keys and comments, claim ownership with a namespace/prefix, write atomically, and verify a second application is a no-op. `opencode-ccs-sync` demonstrates syntax-aware JSONC patching and idempotence, but its direct writes remain a crash/concurrency risk (`.research/opencode-plugin-corpus/per-repo/012.md:41-46`).

## 9. State, persistence, and concurrency

Classify state before choosing storage:

| State | Appropriate storage | Required controls |
| --- | --- | --- |
| Per-call | Local variables/context | Abort and bounded output. |
| Per-session ephemeral | Factory closure keyed by session ID | TTL/eviction, duplicate guard, cleanup. |
| Process cache | In-memory map | Size cap, invalidation, instance scope. |
| User settings | OpenCode config/KV | Schema, migration, collision policy. |
| Durable project data | Project or user data directory | Path containment, atomic writes, locking, backups. |
| Credentials | Dedicated config/data file | `0600`, lock, atomic replace, redaction. |
| Cross-process jobs | Database/queue/service | Leases, recovery, idempotency, terminal transitions. |

Atomic rename prevents partial files, not lost updates. Use a lock, optimistic version check, or serialized writer when multiple OpenCode processes may write (`.research/opencode-plugin-corpus/per-repo/003.md:36-43`, `001.md:55-64`). In-memory "global" task managers are not restart persistence; do not advertise them as such (`.research/opencode-plugin-corpus/per-repo/007.md:98-114`).

For asynchronous work, model explicit states such as `registered`, `running`, `complete`, `error`, `cancelled`, and `timeout`. Make terminal transitions idempotent, reject late regressions, persist durable output before notifying, and make retries distinct from duplicate triggers (`.research/opencode-plugin-corpus/per-repo/008.md:22-36`). Guard timers, event-triggered polls, and watcher callbacks against overlap. A timeout race does not cancel the underlying promise unless the underlying operation is aborted (`008.md:38-45`).

## 10. Subprocess and network boundaries

Treat every boundary as hostile and expensive:

- Prefer `execFile`/`spawn` with executable and argument arrays. Use a shell only when shell semantics are the feature and the configuration is trusted (`.research/opencode-plugin-corpus/per-repo/042.md:18-28`, `007.md:61-64`).
- Set cwd explicitly, validate it, and avoid shell interpolation.
- Apply timeout, output limit, cancellation, child-tree cleanup, and exit-status handling.
- Bound response bodies and validate content type/schema before using output.
- Restrict URLs/schemes/hosts where configuration can redirect network traffic.
- Pass per-operation environment snapshots; never leak unrelated ambient secrets.
- Preserve source labels when subprocess or network output enters model context.

For HTTP, use `fetch` with the tool/session abort signal. Use retry only for classified transient failures, honor `Retry-After`, cap total time, and avoid retrying auth, validation, or permission failures. For local callback servers, bind to loopback by default and validate callback paths; remote bind overrides are security decisions (`.research/opencode-plugin-corpus/per-repo/004.md:47-54`).

## 11. Security, privacy, and secrets

The plugin has the host process's privileges. Model instructions, command templates, and skill files are not enforcement boundaries. A skill that tells the model to replace all web tools does not actually override host policy (`.research/opencode-plugin-corpus/per-repo/146.md:20-28`).

Review:

- File reads: reject absolute paths and traversal; resolve symlinks before containment checks (`.research/opencode-plugin-corpus/per-repo/030.md:21-24`).
- Tool identity: exact allowlists for command-capable tools; unknown tools get conservative handling.
- Config mutation: preserve unrelated content and avoid credential-like values in config unless unavoidable.
- Prompt data: redact secrets, cap size, mark untrusted content, and define retention.
- Logs/telemetry: do not record prompts, tool arguments, outputs, tokens, or raw upstream errors by default. Redact and bound all attributes (`.research/opencode-plugin-corpus/per-repo/088.md:27-33`).
- Installers: avoid unpinned `curl | bash`, moving branches, and unverifiable archives (`.research/opencode-plugin-corpus/per-repo/005.md:30-32`, `042.md:23-28`).
- Permissions: review `config`-injected agents, primary tools, network, shell, and delegation recursion as policy changes (`.research/opencode-plugin-corpus/per-repo/000.md:54-58`).
- Supply chain: pin CI actions, use least-privilege workflow permissions, lock dependencies, audit licenses, and publish provenance where available (`.research/opencode-plugin-corpus/per-repo/003.md:44-55`).

Fail closed for a security decision, fail open only for optional enrichment, and document the difference. Never let malformed security-hook output silently become allow (`.research/opencode-plugin-corpus/per-repo/056.md:75-80`).

## 12. Errors and graceful degradation

Define an error policy per operation:

- **Required policy/config:** reject startup or tool execution with a safe, actionable error.
- **Optional enrichment/telemetry/notification:** log structured context and continue.
- **User mutation:** do not claim success before durable write; retain recoverable data and expose failure.
- **Background work:** record terminal error, preserve IDs/artifacts, and notify best-effort.
- **Cleanup:** run in `finally`, make repeated cleanup safe, and do not mask the primary failure.

Use `client.app.log()` for structured logs, with `debug`, `info`, `warn`, and `error` levels ([official logging documentation](https://opencode.ai/docs/plugins/#logging)). Normalize `unknown` errors, attach operation/session IDs, and avoid raw payloads. Suppressed errors need a diagnostic path; otherwise "graceful" becomes invisible failure. Several reports identify silent catches and missing binaries as operational gaps (`.research/opencode-plugin-corpus/per-repo/009.md:31-38`, `042.md:20-28`).

## 13. Performance and idempotency

Measure the hot path. Avoid synchronous large-file reads or full directory scans in per-turn hooks; use bounded async I/O, stat-plus-hash invalidation, caching, or a watcher (`.research/opencode-plugin-corpus/per-repo/115.md:18-37`). Keep prompt additions small and stable. Cache provider discovery and models with an in-flight promise, but clear it on failure so a later call can retry (`.research/opencode-plugin-corpus/per-repo/042.md:12-16`).

Every event handler should tolerate duplicate delivery. Use one of:

- A durable marker in the host/session data.
- A per-session state machine.
- A keyed in-flight promise.
- A compare-and-set check immediately before mutation.
- A content hash or self-write suppression window for watchers.

Bound maps, queues, retries, output, prompt context, and telemetry cardinality. Do not use timestamp-only IDs or polling without overlap guards (`.research/opencode-plugin-corpus/per-repo/003.md:69-74`, `007.md:109-114`).

## 14. Observability

At minimum record structured, redacted fields: plugin version, operation, session ID, project/worktree identity (prefer a stable hash), duration, outcome, retry count, and bounded error class. Add counters for hook calls, denied calls, duplicate events, cache hits/misses, queue depth, external latency, and dropped output. Provide a diagnostic/status tool or command for disabled features, missing binaries, config source, last failure, and queued work.

Telemetry is specialized. The OTel corpus example has strong correlation, bounded maps, flush/shutdown handling, and opt-in propagation, but also shows that prompts/tool data in spans can expose secrets (`.research/opencode-plugin-corpus/per-repo/088.md:10-24`, `27-40`). Default to metadata, not content; make capture opt-in and redaction testable.

## 15. Testing and fixtures

Use layers:

1. Pure tests for parsing, validation, redaction, path containment, serialization, retry classification, and state transitions.
2. Boundary tests with a fake `client`, `tool` context, `AbortSignal`, and shell/process adapter.
3. Plugin contract tests that invoke the factory and assert returned hook/tool names, config mutation, command collision behavior, and exact output mutations.
4. Lifecycle sequence tests for duplicate, out-of-order, concurrent, cancelled, timeout, deleted-session, and compaction events.
5. Process/network integration tests with a controllable fixture binary, fake fetch, fake collector, or temporary callback server.
6. Packed-artifact tests: `bun pm pack`, inspect files, install into a temporary project, import every advertised export, and verify packaged assets.

Use temporary directories and fake homes. Mock heavyweight model/embedding/process boundaries while retaining a required integration lane when the dependency is available. A skipped integration suite should be visible as a release gap, not a pass (`.research/opencode-plugin-corpus/per-repo/042.md:30-36`). Typechecking alone misses hook registration, runtime event shapes, package omissions, and races (`.research/opencode-plugin-corpus/per-repo/146.md:29-33`).

## 16. Packaging, installation, and release

Minimum package contract:

- ESM metadata and a built JavaScript entrypoint.
- `types`/declarations if TypeScript consumers are expected.
- Explicit `exports` for every supported entry, including separate TUI/server entries.
- `files` allowlist containing all runtime assets: commands, skills, schemas, sounds, prompts, or licenses.
- Correct runtime dependencies and an explicit peer dependency/host range for OpenCode.
- Reproducible lockfile and supported Bun/Node/OpenCode versions.
- `prepack` or `prepublishOnly` build, package smoke test, and clean-install import test.
- README installation using a pinned package version and documented rollback.
- Changelog/migration note for output, prompt, hook, provider, or command changes.

The official install behavior is: local plugins load from `.opencode/plugins/` or `~/.config/opencode/plugins/`; npm plugins are installed by Bun at startup and cached under `~/.cache/opencode/node_modules/`. Community practice varies from source TypeScript packages to `dist`-only packages and registry facades; mismatched registry targets, package names, README commands, and exports are recurring defects (`.research/opencode-plugin-corpus/per-repo/008.md:53-58`, `056.md:127-154`). Verify the packed artifact, not just the source tree.

## 17. Compatibility and versioning

Use semver for plugin API and behavior, but define what "breaking" means:

- Hook names, event assumptions, and config keys.
- Tool names, schemas, result shape, and error semantics.
- Prompt/command/skill text that changes agent behavior.
- Provider/auth storage format and model routing.
- Required host, Bun/Node, CLI, or binary versions.

Maintain a compatibility matrix with plugin version, OpenCode version/commit, `@opencode-ai/plugin` and SDK ranges, runtime, and tested surfaces. Add migrations for persisted state and explicit deprecation windows. Release-please, changelogs, migration guides, frozen installs, npm provenance, and package verification are strong community patterns (`.research/opencode-plugin-corpus/per-repo/002.md:36-41`, `010.md:54-61`).

## 18. Documentation and UX

Document the user-visible contract:

- Installation, exact package/version, local development, and uninstall.
- Required host/runtime/CLI versions and permissions.
- Config precedence, schema, defaults, examples, and where state lives.
- Data sent to providers, subprocesses, files, logs, and telemetry.
- Command/tool names, argument examples, output shape, limits, and failure recovery.
- What is enforceable versus advisory.
- Concurrency, restart, cancellation, and cleanup behavior.
- Upgrade, migration, rollback, and troubleshooting.

UX should provide immediate useful fallback where possible, avoid surprising edits to user-owned titles/config/context, show actionable toasts for interactive errors, and keep background work discoverable by stable IDs. Do not let "silent graceful degradation" leave users unable to tell whether the feature is installed or working.

## 19. Anti-Patterns

- Treating `any` as a compatibility strategy instead of a narrow adapter.
- Mutating process-global environment or module-global state for session-local data.
- Read-modify-write without locking or atomic replacement.
- Shell interpolation of user/model/config data.
- Unbounded prompt insertion, output capture, logs, maps, retries, or directory scans.
- Assuming event delivery order, exactly-once delivery, or authoritative fields that are absent in the tested SDK.
- Using model instructions as security enforcement.
- Failing open on malformed security-hook results.
- Advertising restart persistence for in-memory state.
- Shipping source/assets that are absent from `files` or exports.
- Testing helpers but not the returned factory and real hook shapes.
- Publishing moving-branch installers or raw upstream credentials/errors.
- Letting documentation, generated commands, package names, and release metadata drift.

## 20. Design decision matrix

| Decision | Prefer | Use alternative when | Evidence/risk |
| --- | --- | --- | --- |
| Context injection | System transform or bounded no-reply prompt | The data is optional and better exposed as a tool | Prompt injection and token cost; `.research/opencode-plugin-corpus/per-repo/003.md:23-27`. |
| Enforcement | `tool.execute.before` with explicit throw/deny | Advisory post-tool/event logging | After hooks cannot undo execution; `.research/opencode-plugin-corpus/per-repo/056.md:54-74`. |
| Auth | OpenCode auth/config | Plugin owns a real OAuth/provider feature | Credential storage is specialized; `.research/opencode-plugin-corpus/per-repo/000.md:42-46`, `004.md:47-67`. |
| State | Factory closure/session map | Durable store or queue for restart/cross-process needs | In-memory state is not persistence; `.research/opencode-plugin-corpus/per-repo/007.md:98-114`. |
| Process | `spawn`/`execFile` argv | Trusted shell semantics are essential | Shell injection/child cleanup; `.research/opencode-plugin-corpus/per-repo/042.md:18-22`. |
| Config edit | Syntax-aware merge and atomic write | Full replacement only for an owned file | Preserve comments/unrelated keys; `.research/opencode-plugin-corpus/per-repo/012.md:41-46`. |
| Background job | Explicit state machine plus durable artifact | Fire-and-forget notification | Timeouts do not cancel promises; `.research/opencode-plugin-corpus/per-repo/008.md:22-45`. |
| Telemetry | Metadata-only, opt-in content capture | Trusted collector with tested redaction | Prompts/tool data are sensitive; `.research/opencode-plugin-corpus/per-repo/088.md:27-33`. |
| Distribution | Built ESM + declarations + packed smoke test | Source local plugin for development only | Snapshot packages show source/dist/export drift; `.research/opencode-plugin-corpus/per-repo/146.md:35-40`. |

## 21. Implementation recipe

1. Write the capability, trust boundary, data flow, and failure policy in one page.
2. Pin the target OpenCode/plugin/SDK versions and inspect current official types.
3. Create a thin typed factory and one minimal returned registration object.
4. Add one pure module for parsing/validation/policy and one adapter for OpenCode events.
5. Register only the required hook/tool/command surface.
6. Add schemas, semantic bounds, stable result IDs, and collision policy.
7. Implement idempotency before adding asynchronous work.
8. Add bounded I/O, abort propagation, timeouts, retries, and cleanup.
9. Add structured redacted logging and a diagnostic path.
10. Add unit, contract, lifecycle, boundary, and packed-artifact tests.
11. Document installation, configuration, permissions, data handling, limits, compatibility, and rollback.
12. Build, typecheck, lint, test, pack, clean-install, smoke-import, and review the final diff.

## 22. Reusable Bun/TypeScript templates

### Safe event adapter

```ts
type EventRecord = Record<string, unknown>

function record(value: unknown): EventRecord | undefined {
  return value && typeof value === "object" ? value as EventRecord : undefined
}

export async function handleEvent(event: unknown, state: State) {
  const input = record(event)
  const type = typeof input?.type === "string" ? input.type : "unknown"
  if (type !== "session.idle") return

  const properties = record(input?.properties)
  const info = record(properties?.info)
  const sessionID = typeof info?.id === "string" ? info.id : undefined
  if (!sessionID || state.inFlight.has(sessionID)) return

  const work = runOnce(sessionID, state)
  state.inFlight.set(sessionID, work)
  try {
    await work
  } finally {
    state.inFlight.delete(sessionID)
  }
}
```

### Bounded argv subprocess

```ts
import { spawn } from "node:child_process"

export function runCommand(command: string, args: string[], cwd: string, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, env: { ...process.env } })
    let output = ""
    const limit = 1_000_000
    const onAbort = () => child.kill("SIGTERM")
    signal?.addEventListener("abort", onAbort, { once: true })
    child.stdout.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-limit)
    })
    child.once("error", reject)
    child.once("close", (code) => {
      signal?.removeEventListener("abort", onAbort)
      if (code === 0) resolve(output)
      else reject(new Error(`command exited with ${code}`))
    })
  })
}
```

### Atomic, locked-ish local write

```ts
import { mkdir, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

export async function atomicWrite(path: string, body: string) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
  await writeFile(temp, body, { encoding: "utf8", mode: 0o600 })
  await rename(temp, path)
}
```

Atomic replacement still needs a lock or version check when writers can overlap.

### Abort-aware fetch

```ts
export async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { accept: "application/json" } })
  const text = (await response.text()).slice(0, 1_000_000)
  if (!response.ok) throw new Error(`upstream ${response.status}`)
  return JSON.parse(text) as T
}
```

## 23. Troubleshooting

| Symptom | Likely cause | Check |
| --- | --- | --- |
| Plugin does not load | Wrong export, package entry, or missing built asset | Import the packed entry; inspect `exports`, `main`, `files`, and loader-compatible default/named exports. |
| Hook runs twice | Duplicate local/npm registration or duplicate event delivery | Check official load order and add an idempotency marker. |
| Config disappears | Whole-object replacement or collision policy | Merge only owned keys and test unrelated config preservation. |
| Tool is visible but fails | Schema accepts values semantic code rejects | Test execution-time bounds and return actionable diagnostics. |
| Context is missing after compaction | Injection only happened once | Rehydrate from `session.compacted`/messages and test compaction. |
| Background work never finishes | Timeout raced the underlying promise or no terminal transition | Abort the actual operation, record terminal state, and test late completion. |
| Secrets appear in logs | Raw prompt/tool/upstream payload logging | Redact by field and test logs as output. |
| External command is unsafe | `shell: true` or interpolated arguments | Replace with argv APIs, cwd validation, and allowlists. |
| Works locally, fails after npm install | `dist`/assets/peer dependency omitted | `bun pm pack`, inspect tarball, clean-install, import, and run smoke tests. |
| CI says tests pass but feature is broken | Only pure helpers or skipped integration tests ran | Invoke the actual factory and host-shaped hooks; make required integration dependencies explicit. |
| Version upgrade breaks fields | Generated SDK/plugin type drift | Compare pinned types, narrow adapter casts, and run compatibility fixtures. |

## 24. Production gate

Use the full [checklist](opencode-plugin-development-checklist.md). At a minimum, no release is ready until the plugin has a tested export, bounded inputs/outputs, explicit trust and failure policies, idempotent lifecycle behavior, safe process/network boundaries, redacted observability, durable-state guarantees if advertised, clean-install/package verification, documented compatibility, and a rollback path.

## Corpus Coverage Index

The following compact index acknowledges every analyzed report. Names come from the manifest/audit; detailed evidence is in the corresponding report.

| Reports | Repository roots |
| --- | --- |
| 000-009 | bluelovers/opencode-arise; aerovato/opencode-quotes-plugin; gotgenes/opencode-agent-identity; joshuadavidthomas/opencode-agent-memory; NoeFabris/opencode-antigravity-auth; theblazehen/opencode-antigravity-multi-auth; pawelma/opencode-autotitle; zenobi-us/opencode-background; kdcokenny/opencode-background-agents; joshuadavidthomas/opencode-beads |
| 010-019 | ZanzyTHEbar/brhp; kenryu42/claude-code-safety-net; JasonLandbridge/opencode-ccs-sync; shihyuho/opencode-command-inject; IgorWarzocha/Opencode-Context-Analysis-Plugin; xberg-io/plugins; CrewBeeLab/CrewBee; athal7/opencode-devcontainers; simonwjackson/opencode-direnv; dodopayments/dodo-agent-plugin |
| 020-029 | Tarquinen/opencode-dynamic-context-pruning; boxpositron/envsitter-guard; DVNghiem/FlowDeck; forloop-cc/forloop-opencode-plugin-planner; smartfrog/opencode-froggy; jenslys/opencode-gemini-auth; amestsantim/opencode-github-release; IgorWarzocha/Opencode-Google-AI-Search-Plugin; hffmnnj/opencode-goopspec; yuji-hatakeyama/opencode-gpt-imagegen |
| 030-039 | joshuadavidthomas/opencode-handoff; smc2315/harness-memory; HiAi-gg/hiai-opencode; plastic-labs/opencode-honcho; Looted/kibi; JungHoonGhae/opencode-kilo-auth; xenitV1/lemma; cortexkit/opencode-magic-context; vtemian/micode; ramarivera/opencode-model-announcer |
| 040-049 | JRedeker/opencode-morph-fast-apply; one-bit/oc-mnemoria; code-yeongyu/oh-my-opencode; alvinunreal/oh-my-opencode-slim; Alph4d0g/opencode-omniroute-auth; martinzokov/open-conclave; Suraj1235/open-dynamic-workflows; ndom91/open-plan-annotator; numman-ali/opencode-openai-codex-auth; ian-pascoe/opencode-adaptive-thinking |
| 050-059 | AnganSamadder/opencode-agent-tmux; Mark1708/opencode-agents-sidebar; mailshieldai/opencode-canvas; DJOCKER-FACE/opencode-chromium-browser-plugin; kuitos/opencode-claude-memory; hueyexe/opencode-ensemble; romain325/opencode-hooks-plugin; Zaradacht/opencode-host-notify-bridge; lgladysz/opencode-ignore; yuseferi/opencode-litellm |
| 060-069 | errhythm/opencode-log-sanitizer; tickernelz/opencode-mem; nigel-dev/opencode-mission-control; yuhp/opencode-models-discovery; kdcokenny/opencode-notify; lannuttia/opencode-ntfy.sh; yurihbm/opencode-plan-manager; baranwang/opencode-provider-alias; slkiser/opencode-quota; IgorWarzocha/Opencode-Roadmap |
| 070-079 | malhashemi/opencode-sessions; JosXa/opencode-snippets; zaxbysauce/opencode-swarm; iHildy/opencode-synced; agostinilabsrl/opencode-telemetry; Howardzhangdqs/opencode-throughput; eserete/opencode-token-tracker; StefanoChiodino/opencode-tts; tim-hilde/opencode-update-notifier; Mark1708/opencode-usage-monitor |
| 080-089 | psinetron/opencode-visualiser; RoderickQiu/opencode-workaholic; kdcokenny/opencode-workspace; kdcokenny/opencode-worktree; d3vv3/opencode-ascii; Alex-stack-cell/opencode-bmad-workflow; vbgate/opencode-mystatus; joostvanwollingen/opencode-personality; DEVtheOPS/opencode-plugin-otel; sun-praise/opencode-review |
| 090-099 | andrejtonev/opencode-short-term-memory; VincentHardouin/opencode-snip; MrDoe/OpenCodeRAG; open-hax/codex; Octane0411/opencode-plugin-openspec; Lyapsus/opencode-optimal-model-temps; useorgx/orgx-opencode-plugin; athal7/opencode-pilot; backnotprop/plannotator; spoons-and-mirrors/pocket-universe |
| 100-109 | arttttt/opencode-pr-signature; Th0rgal/opencode-ralph-wiggum; saim-x/opencode-research-papers; JensGrote/opencode-semantic-anchors; JRedeker/opencode-shell-strategy; cnicolov/opencode-plugin-simple-memory; Yusuzhan/opencode-simple-notify; Tarquinen/opencode-smart-title; MasuRii/opencode-smart-voice-notify; raisbecka/opencode-subagent-output |
| 110-119 | spoons-and-mirrors/subtask2; joelhooks/opencode-swarm-plugin; tlinhart/opencode-system-prompt-logger; Ainsley0917/opencode-token-monitor; ramtinJ95/opencode-tokenscope; mmynsted/opencode-toon-config-plugin; ulthon/ul-opencode-event; bastiangx/opencode-unmoji; Wangmerlyn/vibe-coding-slack-notifier; angristan/opencode-wakatime |
| 120-129 | pantheon-org/opencode-warcraft-notifications; boxpositron/with-context-mcp; Edison-A-N/opencode-worktree-memory-sync; Xquik-dev/x-twitter-scraper; 24601/opencode-zellij-namer; H2Shami/opencode-helicone-session; nick-vi/opencode-type-inject; shekohex/opencode-google-antigravity-auth; Opencode-DCP/opencode-dynamic-context-pruning; ghoulr/opencode-websearch-cited |
| 130-139 | shekohex/opencode-pty; franlol/opencode-md-table-formatter; daytona/integrations; inkdust2021/opencode-vibeguard; morphllm/opencode-morph-plugin; panta82/opencode-notificator; mohak34/opencode-notifier; zenobi-us/opencode-skillful; supermemoryai/opencode-supermemory; different-ai/opencode-scheduler |
| 140-146 | derekbar90/opencode-conductor; vtemian/octto; stolinski/opencode-sentry-monitor; firecrawl/opencode-firecrawl; jfrog/opencode-jfrog-plugin; willytop8/OpenCode-goal-plugin; tavily-ai/opencode-tavily |

The `arttttt` spelling above is normalized from the manifest owner; the authoritative identity and report remain `.research/opencode-plugin-corpus/per-repo/100.md`.

## Version Uncertainty

The official documentation is current as fetched on 2026-08-14, but it does not state a single plugin/SDK version in these pages. Corpus repositories target materially different SDK/plugin ranges and some use experimental or TUI surfaces. This Bible therefore specifies the current documented behavior, not a guaranteed API for every historical OpenCode release. Pin the host and peer versions, run the contract/packed tests against the exact target, and consult the generated SDK types before release.
