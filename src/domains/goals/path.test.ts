import {expect, test} from "bun:test";
import {defaultStateRoot, goalsSnapshotPath, scopedStateDirectory} from "./path";

test("resolves the default state root from XDG_STATE_HOME", () => {
    const original = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = "/tmp/state home";

    try {
        expect(defaultStateRoot()).toBe("/tmp/state home/opencode-beanie-plugin");
    } finally {
        if (original === undefined) {
            delete process.env.XDG_STATE_HOME;
        } else {
            process.env.XDG_STATE_HOME = original;
        }
    }
});

test("returns a deterministic scoped session path outside the worktree", () => {
    const first = goalsSnapshotPath("/tmp/worktree", "project/id", "session/id");
    const second = goalsSnapshotPath("/tmp/worktree", "project/id", "session/id");

    expect(first).toBe(second);
    expect(first).toMatch(new RegExp(`^${defaultStateRoot()}/[0-9a-f]{64}/[0-9a-f]{64}\\.json$`));
    expect(first).not.toContain(".opencode");
});

test("includes the absolute worktree and project in the scope", () => {
    expect(scopedStateDirectory("/tmp/worktree", "project")).not.toBe(
        scopedStateDirectory("/tmp/other-worktree", "project"),
    );
    expect(scopedStateDirectory("/tmp/worktree", "project")).not.toBe(
        scopedStateDirectory("/tmp/worktree", "other-project"),
    );
});

test("hashes separators, whitespace, and traversal-like identities safely", () => {
    const path = goalsSnapshotPath("/tmp/worktree", "../project id", "../../session id");

    expect(path).toMatch(new RegExp(`^${defaultStateRoot()}/[0-9a-f]{64}/[0-9a-f]{64}\\.json$`));
    expect(path).not.toContain("..");
});

test("rejects relative worktrees and blank identities", () => {
    expect(() => goalsSnapshotPath("relative", "project", "session")).toThrow("absolute worktree");
    expect(() => goalsSnapshotPath("/tmp/worktree", "  ", "session")).toThrow("absolute worktree");
    expect(() => goalsSnapshotPath("/tmp/worktree", "project", "  ")).toThrow("absolute worktree");
});
