import {expect, test} from "bun:test";
import {goalsSnapshotPath} from "./path";

test("returns a deterministic safe path inside the worktree", () => {
    const first = goalsSnapshotPath("/tmp/worktree", "project/id", "session/id");
    const second = goalsSnapshotPath("/tmp/worktree", "project/id", "session/id");

    expect(first).toBe(second);
    expect(first).toMatch(/^\/tmp\/worktree\/\.opencode\/beanie\/goals\/[0-9a-f]{64}\.json$/);
});

test("keeps project and session identities unambiguous", () => {
    expect(goalsSnapshotPath("/tmp/worktree", "ab", "c")).not.toBe(
        goalsSnapshotPath("/tmp/worktree", "a", "bc"),
    );
});

test("rejects relative worktrees and blank identities", () => {
    expect(() => goalsSnapshotPath("relative", "project", "session")).toThrow("absolute worktree");
    expect(() => goalsSnapshotPath("/tmp/worktree", "  ", "session")).toThrow("absolute worktree");
    expect(() => goalsSnapshotPath("/tmp/worktree", "project", "  ")).toThrow("absolute worktree");
});
