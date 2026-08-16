# OpenCode Plugin Development Checklist

Use this checklist for a new plugin, substantial change, review, or release. Evidence and rationale are in
the [Bible](opencode-plugin-development-bible.md) and [pattern catalog](opencode-plugin-development-patterns.md).

## Scope and design

- [ ] Capability, user value, trust boundary, data flow, and failure policy are written down.
- [ ] The plugin is classified as server, TUI, provider/auth, context, workflow, telemetry, or another explicit
  category.
- [ ] Official host behavior is separated from community convention and experimental behavior.
- [ ] Target OpenCode version/commit, plugin SDK range, OpenCode SDK range, Bun/Node range, and external CLI versions
  are recorded.
- [ ] Security-sensitive behavior is identified before implementation.

## Entry and lifecycle

- [ ] A typed factory receives the official host context.
- [ ] The entrypoint is thin and exports exactly the loader-compatible shape.
- [ ] Server and TUI entrypoints are separate when their contracts differ.
- [ ] Construction, hooks, tools, persistence, transports, and UI are separable modules.
- [ ] Initialization does not start unbounded timers, watchers, processes, or network work without a stop/recovery plan.
- [ ] Unknown or partial events are safely ignored.
- [ ] Duplicate and out-of-order event behavior is specified.

## Hooks and context

- [ ] Each behavior uses the narrowest hook that can satisfy it.
- [ ] `config` mutation preserves unrelated config and has tested collision semantics.
- [ ] Pre-tool enforcement is in `tool.execute.before`; post-tool behavior is not advertised as prevention.
- [ ] Any `command.execute.before` rewriting is gated by a tested host version and bounded for recursion/nesting.
- [ ] Dynamic hook inputs are narrowed at runtime.
- [ ] Prompt additions are bounded, provenance-labeled, stable, and escaped for their serialization.
- [ ] Repository files, subprocess output, memory, web content, and model output are treated as untrusted context.
- [ ] Model/agent/session fields are preserved when creating synthetic prompts.
- [ ] Compaction behavior is tested, including `output.prompt` replacement semantics.
- [ ] Revocation/deletion behavior for cached instructions is deliberate.

## Tools and commands

- [ ] Every tool has a precise description of capability, side effects, limits, and failure behavior.
- [ ] `tool.schema` validates types, and execution validates semantic ranges, paths, and cross-field rules.
- [ ] Inputs and outputs have hard size/count/time limits.
- [ ] Async tools return stable IDs and explicit statuses.
- [ ] Background SDK sessions have bounded prompts, cancellation, and `finally` cleanup when used.
- [ ] Expected errors are actionable; unexpected errors retain a safe diagnostic trail.
- [ ] Commands are namespaced, collision-tested, and package-tested.
- [ ] Packaged command/skill assets are included in `files` and loaded from package-relative paths.
- [ ] README command names match generated/runtime names.

## Auth and providers

- [ ] The plugin uses host-owned auth unless it has a documented provider feature.
- [ ] Provider selection and precedence are deterministic and documented.
- [ ] OAuth state, callback path, redirect bind address, expiry, refresh, and cancellation are tested.
- [ ] Refresh tokens are validated, locked, atomically replaced, permission-hardened, and migrated.
- [ ] Custom fetch passes through unrelated requests and preserves abort/options.
- [ ] Request/response transforms are tested independently.
- [ ] Retry classification, `Retry-After`, caps, jitter, and endpoint/account failover are explicit.
- [ ] Terms-of-service and unofficial-provider risks are documented.

## Configuration and environment

- [ ] Precedence is documented and tested.
- [ ] JSONC/YAML is parsed with a syntax-aware library when comments/formatting matter.
- [ ] Config is schema-validated, including unknown keys, ranges, sizes, paths, and enums.
- [ ] Missing optional config and malformed required config have different behavior.
- [ ] Generated schema/defaults/docs are synchronized.
- [ ] Secrets are not printed in diagnostics.
- [ ] Per-event values are not stored in process-global `process.env`.
- [ ] Config writes preserve unrelated data, are atomic, and are lock/version safe for multiple writers.
- [ ] Applying config twice is a no-op.

## State and concurrency

- [ ] State is classified as per-call, session, process, user, project, credential, or cross-process.
- [ ] Session/process maps have bounds, eviction, and cleanup.
- [ ] Initialization promises are single-flight and cleared on failure.
- [ ] Async jobs have explicit nonterminal and terminal states.
- [ ] Terminal transitions are idempotent and cannot regress from late promises.
- [ ] Cancellation aborts the underlying operation, not merely a `Promise.race` wrapper.
- [ ] Timeouts, retries, polling, watcher events, and lifecycle events cannot overlap incorrectly.
- [ ] Durable output is persisted before notification.
- [ ] Restart recovery is implemented or explicitly not promised.
- [ ] Worktree-scoped state preserves project/worktree identity and never silently falls back when isolation is
  required.
- [ ] Cross-process writers use locks, optimistic versions, or a serialized queue.

## Subprocess and network safety

- [ ] Executables and argv arrays are used instead of shell interpolation.
- [ ] `shell: true` is justified, trusted, documented, and tested as code execution.
- [ ] cwd/worktree paths are validated and contained.
- [ ] Child processes have timeout, abort, output caps, exit handling, and tree cleanup.
- [ ] Per-operation environment snapshots exclude unnecessary secrets.
- [ ] URLs use allowed schemes/hosts where configuration controls endpoints.
- [ ] HTTP responses have timeouts, size/content validation, and bounded retries.
- [ ] Abort signals reach every external request.
- [ ] Local callback servers bind to loopback by default and validate callback paths.

## Security and privacy

- [ ] Absolute paths, traversal, symlinks, and arbitrary file reads are reviewed.
- [ ] Exact tool-name allowlists prevent capability confusion.
- [ ] Model instructions are not treated as authorization or sandboxing.
- [ ] Prompt, tool, memory, web, subprocess, and telemetry data retention is documented.
- [ ] Logs and telemetry redact secrets, prompts, headers, tool args, raw outputs, and upstream bodies.
- [ ] Sensitive files use restrictive permissions and are ignored by Git where appropriate.
- [ ] Security decisions fail closed; optional enrichment fails open only by design.
- [ ] Malformed security-hook results do not become allow.
- [ ] Installers and update checks are pinned, opt-in or observable, and integrity-checked.
- [ ] Supply-chain, license, and workflow permissions are reviewed.

## Errors and UX

- [ ] `client.app.log()` is used for structured logs, not uncontrolled console output.
- [ ] Logs include operation/session/version/duration/outcome without sensitive payloads.
- [ ] Optional integrations expose disabled/missing/failure state through logs or a diagnostic tool.
- [ ] Cleanup runs in `finally` and is safe to repeat.
- [ ] User-owned titles/config/context are not overwritten after an async stale read.
- [ ] Interactive errors have actionable toast or tool messages.
- [ ] Background operations remain discoverable by stable IDs.
- [ ] Fallback behavior is useful and documented.

## Testing

- [ ] Pure parsing, validation, redaction, path, serialization, retry, and state tests exist.
- [ ] The plugin factory is invoked with a fake but host-shaped context.
- [ ] Returned hook/tool/command/export shape is asserted.
- [ ] Config mutation and collision behavior are asserted.
- [ ] Event payloads include missing, unknown, duplicate, out-of-order, concurrent, and future-shaped cases.
- [ ] Tool execution tests pass abort signals and assert bounds.
- [ ] Prompt/compaction tests assert exact output shape and stable ordering.
- [ ] Process/network tests use controllable adapters and verify args, cwd, timeout, abort, and redaction.
- [ ] Durable persistence tests cover malformed data, traversal, atomic recovery, and concurrent writers.
- [ ] Real binary/collector/provider integration is required in at least one release lane when applicable.
- [ ] Skipped tests are reported as gaps, not silently counted as release evidence.
- [ ] `bun test`, typecheck, lint, and build run with the documented dependency manager.

## Packaging and release

- [ ] ESM entry, `main`, `types`, and conditional `exports` point to real built files.
- [ ] Every runtime asset is in the `files` allowlist and verified from the packed tarball.
- [ ] Runtime dependencies, peer dependencies, and host version range are correct.
- [ ] Lockfile is checked and clean-installable.
- [ ] `prepack`/`prepublishOnly` builds from a clean checkout.
- [ ] Package smoke test imports every advertised entry and checks hooks/tools/assets.
- [ ] Clean temporary project installation works with the documented config.
- [ ] Package name, repository URL, README installation name, binaries, and exports agree.
- [ ] Version, changelog, migration notes, schema, and compatibility matrix are updated.
- [ ] Publish uses least privilege, provenance/attestation where available, and no long-lived token in CI.
- [ ] Release tag/version is checked before publication.
- [ ] Upgrade, rollback, uninstall, and persisted-state migration are tested.

## Final production gate

- [ ] Official behavior and version uncertainty are documented.
- [ ] All high-risk boundaries have an owner and a test.
- [ ] No unreviewed `any`, shell interpolation, ambient secret propagation, raw prompt logging, or unbounded collection
  remains.
- [ ] No feature is advertised as durable, enforceable, isolated, or authoritative unless the implementation proves it.
- [ ] Documentation examples execute against the packed artifact.
- [ ] The final artifact was built and inspected in a clean environment.
- [ ] `git diff` contains only intended plugin documentation/source changes.
- [ ] The release can be disabled or rolled back without corrupting user config or durable state.
