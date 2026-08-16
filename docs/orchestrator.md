# OrchestratorDomain

`OrchestratorDomain` is an opt-in, server-side workflow for decomposing one implementation objective into manager,
coordinator, and build sessions. It does not provide a TUI, and it does not crash-resume running work.

## Configuration

Register the plugin as a tuple and put the orchestrator options in the second tuple element:

```json
{
  "plugin": [
    [
      "opencode-beanie-plugin",
      {
        "orchestrator": {
          "enabled": true,
          "manager": {"agent": "Manager", "model": "openai/gpt-5", "fanOut": 3},
          "coordinators": [
            {"agent": "Coordinator", "model": "openai/gpt-5", "fanOut": 2}
          ],
          "build": {"agent": "build", "model": "openai/gpt-5", "maxParallel": 1},
          "fanOutMode": "exact",
          "failurePolicy": "fail-fast",
          "limits": {
            "maxNodes": 64,
            "maxDurationMs": 3600000,
            "maxCoordinatorAttempts": 2,
            "maxPromptChars": 48000,
            "maxResultChars": 12000
          }
        }
      }
    ]
  ]
}
```

`manager` and every entry in `coordinators` contain `agent`, `model`, and `fanOut`. `build` contains `agent`, `model`,
and `maxParallel`. Models must be `provider/model` identifiers. Coordinator names may repeat across layers, but every
coordinator name must differ from the manager and build names.

## Depth And Limits

Layer 0 is one manager. Each `coordinators` entry describes the next coordinator layer. Its `fanOut` is applied to
each node in the preceding layer. Build nodes are leaves after the final coordinator layer. For manager fan-out `m`
and coordinator fan-outs `c1 ... cn`, the worst-case node count is:

```text
1 + m + (m*c1) + (m*c1*c2) + ... + (m*c1*...*cn)
```

With manager/coordinator fan-outs `[3, 2]`, there are 3 first-layer coordinators, 6 build leaves, and 10 total nodes
(1 manager + 3 coordinators + 6 builds). Configuration is rejected when this worst-case total exceeds `limits.maxNodes`.

`exact` requires each decomposition to return the configured number of children. `atMost` permits any non-empty count up
to the configured fan-out. The configured fan-outs still determine the worst-case `maxNodes` validation.

Build execution is serial by default (`maxParallel: 1`). Increasing it allows concurrent build sessions in the same
worktree; use caution because parallel agents can write shared files and conflict.

## Roles And Permissions

- **Manager:** the configured primary agent. It must call `orchestration_start` and may not implement directly, use the
  native `task` tool, or edit files. Its `edit`, `bash`, and `task` tools and permissions are denied.
- **Coordinator:** configured hidden subagents that only produce decomposition or aggregation data. Their configured tools
  and permissions use wildcard default-deny (`"*": false` and `"*": "deny"`); runtime policy also denies `edit`, `bash`,
  `task`, `todowrite`, and all orchestration tools.
- **Build:** configured subagents that execute the leaf objective. Runtime policy denies `task` and all orchestration
  tools, but leaves `edit` and `bash` available for implementation work.

These are OpenCode tool and permission policies, not an operating-system sandbox.

## Lifecycle

The tools are session-scoped:

- `orchestration_start` validates the manager decomposition, persists a `registered` job, starts execution
  asynchronously, and returns job metadata without waiting for completion.
- `orchestration_status` lists bounded summaries and counts for jobs belonging to the current root session.
- `orchestration_read` reads a bounded partial or terminal result by job ID.
- `orchestration_cancel` asynchronously cancels an active job and is idempotent for terminal jobs.

Jobs transition through `registered` and `running` to `completed`, `failed`, `cancelled`, `timeout`, or `interrupted`.
When execution finishes, the originating session receives a completion prompt containing a marker like
`[orchestration-complete] job=... status=completed`. The marker directs the agent to call `orchestration_read`; it does
not include the result. Child-session cleanup is bounded by a timeout; cleanup failures are retained as diagnostics. Do not
poll for completion.

`fail-fast` aborts descendant work after a child failure. `collect` allows sibling work to finish and records failures in
the resulting job. The duration limit can produce `timeout`, and deleting the root session cancels its active jobs.

## Storage And Recovery

Artifacts are stored under:

```text
<absolute-worktree>/.opencode/beanie/orchestrator/<sha256(project-id)>/<sha256(root-session-id)>/<job-id>.json
```

Each artifact is an atomic JSON file with schema identifier `opencode-beanie.orchestrator.v1` and a serialized job graph.
The artifact byte ceiling is derived from the validated `maxNodes`, `maxPromptChars`, and `maxResultChars` limits, with
structural and configuration overhead included.
On startup, persisted non-terminal jobs are marked `interrupted`; they are not resumed. The repository serializes writes
within one process, but it does not provide cross-process locking. Do not run multiple writers against the same storage
root.

## Activation And Command

The domain returns empty hooks when the plugin has no `orchestrator` option or when `orchestrator.enabled` is `false`.
An explicitly configured invalid object fails plugin startup. When enabled, it registers the orchestration tools, agent
configuration, and the `/orchestrate` command:

```text
/orchestrate $ARGUMENTS
```

Restart OpenCode after changing plugin options in `opencode.json`; configuration is read during plugin startup.

## Verification

Run these commands from the repository root when verifying implementation changes:

```bash
bun test src/domains/orchestrator
bun run lint
bun run typecheck
bun run build
```
