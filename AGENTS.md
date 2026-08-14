# Agent Guidance

## Basics

- We use semantic versioning.
- Everything must be reproducible/reusable when it involves multiple commands. Write scripts under `scripts/` when
  needed or something may be needed again in the future.

## Punishable by Law

> Current number of death penalties since January: 332

- Editing linting configuration or smashing ignore comments is strictly forbidden.
- Not running linting & formatting before each commit is strictly forbidden.
    - No matter if a linting/formatting issue is pre-existing or not, all must be handled.
- Creating "god" files or "god" methods is strictly forbidden. No method should be longer than 20 lines, no file should
  be longer than 200 lines.
- Not having at least 80% test coverage is punishable by death.
- Skipping linting, fast-running unit tests, not ensuring if project builds; all punishable by death.
- Having lots of files under `src/` is punishable by death. Organize everything into topic/domain-specific folders.
- Chasing backward-compatibility is punishable by death. All breaking changes can be simply addressed by bumping the
  version according to the semantic versioning rules.
- Installing stuff globally on the host machine with no trace of what happened and how it can be reproduced later is
  punishable by death. Use a ephemeral Docker container if you need something.
- Running tests/linting etc for non-code changes is punishable for death due to time-wasting.

## Useful documentation

### About plugin development

- https://opencode.ai/docs/plugins/
- `docs/opencode-plugin-development-bible.md` - comprehensive local plugin development guide
- `docs/opencode-plugin-development-patterns.md` - recurring implementation patterns and techniques
- `docs/opencode-plugin-development-checklist.md` - development, review, and release checklist

### Other OpenCode Documentation

- https://opencode.ai/docs/sdk
- https://opencode.ai/docs/server/
- https://opencode.ai/docs/ecosystem/

## Bun and stuff

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

### APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

### Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```
