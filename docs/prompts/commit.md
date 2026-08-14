# How to Commit Changes

Use this workflow from the repository root to create focused, verified commits. Keep changes that serve different purposes in separate commits.

## Inspect the Worktree

Review the complete worktree before staging anything:

```sh
git status --short
git diff
git diff --cached
git diff --stat
git diff --check
git log -10 --oneline
```

Do not stage secrets, local configuration, generated files, or unrelated changes. This Bun/TypeScript repository ignores generated output such as `dist/`, `build/`, `coverage/`, and `node_modules/`. Do not stage IDE state or local research output.

## Run the Required Checks

This repository uses Bun. Before each commit, run all applicable checks from the repository root:

```sh
bun build src/index.ts --outdir dist
bunx --no-install tsc --noEmit
bun test
bun test --coverage
bun run lint
```

Run `bun install --frozen-lockfile` when dependency metadata changes, and verify that `bun.lock` remains synchronized. Require at least 80% test coverage; treat a lower result or a missing test suite as a failed check. If a check fails, fix the issue and rerun the complete applicable set.

## Stage One Logical Change

Stage only the files for one change. Use `git add --patch` when a file contains changes for multiple commits:

```sh
git add -- path/to/file
git diff --cached
git diff --cached --check
git commit -m "docs: clarify commit workflow"
```

Never use blanket staging such as `git add -A` or `git add .` when unrelated work may be present. Do not stage changes you did not make or files outside the intended change.

## Format the Commit Message

Use the Conventional Commits format:

```text
<type>(<optional-scope>): <imperative subject>
```

Use a concise, lowercase, imperative subject without a final period or emoji. Prefer `feat`, `fix`, `docs`, `build`, `ci`, `chore`, `refactor`, or `test`. Mark breaking changes with `!` or a `BREAKING CHANGE:` footer.

## Verify the Commit

After each commit, inspect the commit and remaining worktree:

```sh
git show --stat --oneline HEAD
git status --short
```

Repeat the staging and verification steps for each remaining logical change. Stop when the worktree contains only intentional, uncommitted work.

## Wrapper Safety

You are running inside the OpenCode commit helper. Do not run `make commit`, `bun run commit`, or any equivalent commit-wrapper command. Perform the inspection, checks, staging, and `git commit` steps directly. Do not modify unrelated files or commit generated output.

Report each commit hash and subject, all checks run, and any remaining worktree changes.
