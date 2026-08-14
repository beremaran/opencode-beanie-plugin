# OpenCode Plugin Development Patterns

This catalog distills repeatable patterns from the 147-report corpus. "Common" means corroborated across several independent reports; "specialized" means appropriate only to a narrow plugin class; "risky" means observed with a documented failure mode. See the [Bible](opencode-plugin-development-bible.md) for the lifecycle model and [checklist](opencode-plugin-development-checklist.md) for gates.

## Taxonomy

| Pattern | Class | Use |
| --- | --- | --- |
| Thin typed factory returning hooks/tools | Common | Recurring server-plugin structure. |
| Additive config merge with collision policy | Common | Commands, agents, providers, instructions. |
| `tool.schema` plus semantic execution bounds | Common | Model-callable tools. |
| Defensive event adapter | Common | Any `event` or message hook. |
| Session-keyed idempotency guard | Common | Duplicate or multi-phase events. |
| Structured `client.app.log` with redaction | Common | Diagnostics and operations. |
| Abort-aware fetch/process adapter | Common | External work. |
| Atomic file replacement | Common | User/project persistence. |
| Lock/version check for multi-writer state | Common when durable | Cross-process config, credentials, jobs. |
| System/compaction transform | Common for context plugins | Memory, rules, workflow recovery. |
| Temporary SDK session for background/model work | Specialized | Orchestration, title generation, metadata. |
| Custom provider `fetch` and OAuth loader | Specialized | Auth/provider packages only. |
| TUI slot/command/disposal | Specialized | TUI modules. |
| OTel spans and trace propagation | Specialized | Opt-in telemetry with sensitive-data review. |
| File watcher/self-write suppression | Specialized | Config synchronizers. |
| OS notification/sound adapter | Specialized | Desktop/terminal UX. |
| Shell execution with interpolated command | Risky | Avoid unless shell semantics are essential and trusted. |
| Model instruction as security control | Risky | Never rely on it for authorization. |

## Factory and registration

### Thin composition root

```ts
import type { Plugin, PluginInput } from "@opencode-ai/plugin"

export const PluginName: Plugin = async (input) => {
  const deps = createDependencies(input)
  const state = createState()
  return {
    event: (ctx) => onEvent({ deps, state, ...ctx }),
    tool: createTools(deps, state),
  }
}

function createDependencies(input: PluginInput) {
  return { client: input.client, cwd: input.directory, worktree: input.worktree }
}
```

**Why it works:** construction is the only place that knows host context; domain code can receive typed dependencies and be tested without a live OpenCode process. This is corroborated by `opencode-arise`, Background Agents, and Beads (`.research/opencode-plugin-corpus/per-repo/000.md:15-20`, `008.md:16-20`, `009.md:14-21`).

**Trick:** export a loader-compatible default only when the host/package contract requires it. Test the packed export shape, not just the source export (`.research/opencode-plugin-corpus/per-repo/000.md:60-65`).

### Multiple capabilities, separate modules

Named plugin exports are useful when a package contains independent behaviors, such as identity and attribution. Keep each factory independently loadable and document whether users should register one or all (`.research/opencode-plugin-corpus/per-repo/002.md:12-20`). Separate server and TUI entrypoints when contracts differ (`.research/opencode-plugin-corpus/per-repo/010.md:10-13`).

## Config and registration mutation

### Preserve unrelated config

```ts
config.command = {
  ...config.command,
  "my-plugin:status": {
    description: "Show plugin status",
    template: "Call my_plugin_status and summarize it.",
  },
}
```

Choose collision semantics explicitly: preserve user entries, let plugin entries win, or refuse startup. Test both an existing namespace and a repeated invocation. Beads merges; CC Safety Net gives existing commands precedence (`.research/opencode-plugin-corpus/per-repo/009.md:20-21`, `011.md:20-24`).

### Packaged absolute resources

When registering instructions or skills shipped with the package, resolve from `import.meta.url`, not `process.cwd()`. Package the resolved assets in `files`. Tavily demonstrates the minimal config and `shell.env` version of this pattern (`.research/opencode-plugin-corpus/per-repo/146.md:10-18`).

### JSONC patching

Use a JSONC-aware parser/editor when preserving comments matters. Own a prefix such as `ccs-*`, patch only that range, sort deterministically, and verify a second application produces no diff (`.research/opencode-plugin-corpus/per-repo/012.md:41-46`). Use temp-file-plus-rename and a lock for production multi-writer configuration.

## Event and hook patterns

### Defensive event narrowing

```ts
function stringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === "string" ? candidate : undefined
}

export async function eventHook({ event }: { event: unknown }) {
  if (!event || typeof event !== "object") return
  const type = stringField(event, "type")
  if (type !== "session.deleted") return
  const properties = (event as Record<string, unknown>).properties
  const info = properties && typeof properties === "object"
    ? (properties as Record<string, unknown>).info
    : undefined
  const id = stringField(info, "id")
  if (id) await cleanup(id)
}
```

Defensive parsing is common in mature notification/telemetry plugins and avoids crashing on partial or future payloads (`.research/opencode-plugin-corpus/per-repo/088.md:10-16`, `136.md:10-14`). Unknown events should be ignored unless they are required for a safety guarantee.

### Two-phase context bridge

A message hook can capture session/model/agent metadata and a system transform can consume it. Key state by session, clear it in `finally`, bound the map, and define behavior when the second phase never arrives. Agent Identity proves the technique and also exposes its stale-entry risk (`.research/opencode-plugin-corpus/per-repo/002.md:14-17`, `29-34`).

### Compaction recovery

Append a compact, bounded recovery section containing current task, decisions, changed files, active IDs, errors, and next action. Do not insert the whole transcript. If replacing `output.prompt`, remember that `output.context` is ignored by the official contract ([official compaction-hook documentation](https://opencode.ai/docs/plugins/#compaction-hooks)). Background Agents and Beads both use compaction/session events to rehydrate state (`.research/opencode-plugin-corpus/per-repo/008.md:31-36`, `009.md:16-20`).

### Before versus after policy

Use exact tool-name routing in `tool.execute.before`; throw or use the documented denial path for enforcement. After hooks are for observation, output shaping, and metrics. A Claude-hook compatibility layer illustrates the danger of inconsistent blocking and heuristic post-tool failure detection (`.research/opencode-plugin-corpus/per-repo/056.md:52-80`).

## Context and prompt patterns

### Stable static plus dynamic sections

Render stable instructions first and dynamic data in a bounded, labeled section. Sort records deterministically. Escape all fields for the selected format. Agent Memory sorts memory blocks for prompt-cache stability but does not escape all XML fields, so reuse the ordering and fix the serialization boundary (`.research/opencode-plugin-corpus/per-repo/003.md:23-27`, `67-74`).

### Synthetic no-reply prompt

Use the SDK `session.prompt` with `noReply: true` for host-compatible context insertion when a transform is unavailable. Carry the current agent/model and add a durable marker so repeated delivery is harmless (`.research/opencode-plugin-corpus/per-repo/009.md:16-21`).

### Cache with revocation policy

Stat/size fast path plus content hash is an effective per-turn cache. Decide whether deleted content should stop injection or serve the last snapshot. The latter is availability-friendly but can violate authority revocation (`.research/opencode-plugin-corpus/per-repo/115.md:18-37`).

## Tool and command patterns

### Tool contract

```ts
const search = tool({
  description: "Search bounded local records. Never executes commands.",
  args: {
    query: tool.schema.string(),
    limit: tool.schema.number().optional(),
  },
  async execute(args, context) {
    const query = args.query.trim()
    const limit = Math.max(1, Math.min(Math.trunc(args.limit ?? 20), 100))
    if (!query) return "query must not be empty"
    return JSON.stringify(await searchRecords({ query, limit, signal: context.abort }))
  },
})
```

Descriptions are instructions consumed by the model. State side effects, required sequencing, bounds, and whether the result is authoritative. Validate again in execution because schemas can be bypassed by alternate clients or stale host types (`.research/opencode-plugin-corpus/per-repo/030.md:11-17`, `129.md:15-18`).

### Stable asynchronous result

Return `{ id, status, sessionID, createdAt }` immediately; provide `read`, `list`, `cancel`, and bounded output operations. Persist the artifact before sending a parent notification. Background Agents provides a strong state/notification design (`.research/opencode-plugin-corpus/per-repo/008.md:22-36`).

### Command as routing instruction

Commands should tell the model which tool to call, what arguments mean, and how to report failure. Keep command names generated from packaged assets tested against README examples; Beads and Hooks show how stale names create user-visible breakage (`.research/opencode-plugin-corpus/per-repo/009.md:20-21`, `056.md:134-154`).

### Version-sensitive command interception

Some orchestration plugins rewrite `command.execute.before` inputs to add inline subtasks, loops, or model overrides. Use this only against a tested host contract, cap recursion and nesting, and assert the exact `output.parts` mutation (`.research/opencode-plugin-corpus/per-repo/110.md:10-17`).

### SDK-backed background sessions

For background work that needs model reasoning, create a temporary SDK session, bound the prompt, propagate cancellation, and delete the session in `finally`. Reuse the host provider configuration instead of copying credentials; test acceptance separately from streamed completion (`.research/opencode-plugin-corpus/per-repo/006.md:15-17`, `097.md:20-24`).

## Auth and provider patterns

### Host-owned auth

Resolve configured provider/model IDs through `client.config.providers()` or equivalent, and let OpenCode own credentials. This is the common, low-risk route for tools that merely need model work (`.research/opencode-plugin-corpus/per-repo/000.md:42-46`, `005.md:13-17`).

### Custom fetch pass-through

For an actual provider adapter, intercept only matching URLs and pass all other requests to `globalThis.fetch`. Preserve `RequestInit`, headers, and abort. Test exact URL classification and pass-through. Antigravity is a specialized example with strong account rotation, refresh, and transforms, but it also carries legal, storage, and module-global-state risks (`.research/opencode-plugin-corpus/per-repo/004.md:33-45`, `86-107`).

### Credential file protocol

Use a versioned schema, migration, validation, lock, temp file, atomic rename, restrictive mode, and non-merging delete path. Never log refresh tokens or raw auth responses. Treat callback bind overrides and browser launch as privileged boundaries (`.research/opencode-plugin-corpus/per-repo/004.md:47-67`).

## State and concurrency patterns

### Promise-cached singleton

Cache initialization promises to prevent duplicate stores; clear the promise on failure so retry is possible. Bound per-agent/session maps and evict old records (`.research/opencode-plugin-corpus/per-repo/042.md:12-16`).

### Explicit state machine

```ts
type Status = "registered" | "running" | "complete" | "error" | "cancelled" | "timeout"

function finish(task: Task, next: Exclude<Status, "registered" | "running">) {
  if (isTerminal(task.status)) return false
  task.status = next
  task.finishedAt = Date.now()
  return true
}
```

Late promises must not overwrite terminal state. Add deadline timers, cancellation, waiters, and a durable result when work survives a session. Background Agents demonstrates these controls; Background demonstrates their absence in a process manager (`.research/opencode-plugin-corpus/per-repo/008.md:22-29`, `007.md:98-114`).

### Watcher loop suppression

Use content hashes to recognize self-writes, a single-flight promise, and a queued "dirty" flag rather than dropping changes that arrive during a run. CCS Sync suppresses loops but drops an update while sync is active (`.research/opencode-plugin-corpus/per-repo/012.md:15-20`).

## Process and network patterns

### Argument-safe process adapter

```ts
const child = Bun.spawn([executable, ...args], {
  cwd,
  env: { ...process.env, PLUGIN_MODE: "1" },
  stdout: "pipe",
  stderr: "pipe",
})
```

Prefer Bun or Node argv APIs over shell strings. Add timeout and output caps; kill the process and, when needed, its process group. Mnemoria's `execFile` adapter and timeout/retry policy are a reusable baseline (`.research/opencode-plugin-corpus/per-repo/042.md:15-22`).

### Network retry classifier

Retry only transient network/5xx/rate-limit conditions, cap attempts and elapsed time, honor `Retry-After`, jitter, and stop on abort. Do not retry malformed input, missing auth, permission denial, or endpoint policy failures. CCS's implementation explicitly caps retries, while its older design says indefinitely; shipped behavior wins and the docs should be updated (`.research/opencode-plugin-corpus/per-repo/012.md:35-39`, `64-71`).

## Persistence Patterns

### Human-readable local store

Markdown/YAML or JSON is inspectable and migratable. Validate identifiers before constructing paths, ignore or report malformed records, cap record size, and separate global/project scope. Agent Memory combines path-safe labels, atomic replacement, and schema validation, but lacks cross-process locking (`.research/opencode-plugin-corpus/per-repo/003.md:36-48`).

### Rebuild safely

Build a new store beside the old one, fsync if durability matters, retain a rollback backup, then swap. Never delete the live store before a rename/copy is known to succeed; Mnemoria's rebuild path demonstrates the failure mode (`.research/opencode-plugin-corpus/per-repo/042.md:23-28`).

## Security and observability patterns

### Redacted structured logs

```ts
await client.app.log({
  body: {
    service: "my-plugin",
    level: "warn",
    message: "provider request failed",
    extra: { operation: "search", status: 503, retry: 2 },
  },
})
```

Log identifiers, classifications, durations, and counts. Do not log prompts, tokens, headers, tool args, raw output, or upstream bodies. Telemetry plugins show why content capture must be opt-in and redaction tested (`.research/opencode-plugin-corpus/per-repo/088.md:27-33`).

### Fail-closed policy adapter

Separate policy decision from error projection. On malformed input or uncertain tool identity, return a fixed diagnostic without echoing attacker input. CC Safety Net bounds recursive traversal, rejects ambiguous paths, audits redacted denials, and explicitly says it is not an OS sandbox (`.research/opencode-plugin-corpus/per-repo/011.md:31-35`, `54-58`).

### Optional feature gate

Load the plugin even when telemetry/CLI/binary is absent, return an empty or reduced registration, log the reason, and expose status. OTEL uses an environment gate and empty hook object; this is a strong availability pattern for optional instrumentation (`.research/opencode-plugin-corpus/per-repo/088.md:10-12`).

## Testing and packaging practices

- Use a fake home and temporary project/worktree for config and path tests.
- Inject clients, shell runners, fetch, clocks, UUIDs, and binary paths.
- Assert exact `output` mutations, not just helper return values.
- Test event interleavings and duplicate delivery.
- Run a required real-binary/collector lane separately from ordinary unit CI.
- Test packed exports and assets after `bun pm pack`.
- Make generated declarations and `dist` reproducible; never test only a checked-in artifact.
- Check README command/package/export names against package metadata.
- Pin CI action SHAs and use frozen installs where the project supports it.

Representative evidence: BRHP's package verifier (`.research/opencode-plugin-corpus/per-repo/010.md:54-61`), Mnemoria's mocked plus optional real-binary suites (`042.md:30-45`), and identity's exact output/migration tests (`002.md:36-41`).
