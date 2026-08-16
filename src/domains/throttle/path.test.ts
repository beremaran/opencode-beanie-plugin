import {expect, test} from "bun:test";
import {throttleSnapshotPath} from "./path";

test("returns a deterministic safe path inside the worktree", () => {
    const first = throttleSnapshotPath("/tmp/worktree", "project/id");
    const second = throttleSnapshotPath("/tmp/worktree", "project/id");

    expect(first).toBe(second);
    expect(first).toMatch(/^\/tmp\/worktree\/\.opencode\/beanie\/throttle\/[0-9a-f]{64}\.json$/);
});

test("rejects relative worktrees and blank project IDs", () => {
    expect(() => throttleSnapshotPath("relative", "project")).toThrow("absolute worktree");
    expect(() => throttleSnapshotPath("/tmp/worktree", "  ")).toThrow("absolute worktree");
});
