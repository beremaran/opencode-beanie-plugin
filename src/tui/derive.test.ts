import {expect, test} from "bun:test";
import {deriveDiff, deriveHealth, deriveHostSnapshot, derivePending, deriveSession, deriveTodos, deriveTodoCounts} from "./derive";
import {createMockTuiApi} from "./test-helpers";

test("deriveTodoCounts counts each status", () => {
    const counts = deriveTodoCounts([
        {content: "a", status: "pending"},
        {content: "b", status: "in_progress"},
        {content: "c", status: "completed"},
        {content: "d", status: "cancelled"},
    ]);

    expect(counts).toEqual({total: 4, pending: 1, inProgress: 1, completed: 1, cancelled: 1});
});

test("deriveTodos maps items and counts", () => {
    const todos = deriveTodos([{content: "a", status: "pending"}, {content: "b", status: "pending"}]);

    expect(todos.items).toEqual([{content: "a", status: "pending"}, {content: "b", status: "pending"}]);
    expect(todos.counts.pending).toBe(2);
});

test("deriveDiff sums file additions and deletions", () => {
    const diff = deriveDiff([{file: "a.ts", additions: 1, deletions: 2}, {file: "b.ts", additions: 3, deletions: 4}]);

    expect(diff.count).toBe(2);
    expect(diff.additions).toBe(4);
    expect(diff.deletions).toBe(6);
});

test("deriveDiff falls back to summary when no files", () => {
    const diff = deriveDiff([], {additions: 5, deletions: 1, files: 2});

    expect(diff).toEqual({files: [], count: 2, additions: 5, deletions: 1});
});

test("deriveHealth counts connected rows", () => {
    const health = deriveHealth([{id: "a", status: "connected"}, {id: "b", status: "error"}]);

    expect(health.count).toBe(2);
    expect(health.healthy).toBe(1);
    expect(health.unhealthy).toBe(1);
});

test("derivePending maps permissions and question counts", () => {
    const pending = derivePending(
        [{id: "p1", permission: "edit", patterns: ["*.ts"]}],
        [{id: "q1", questions: ["a", "b"]}],
    );

    expect(pending.permissions).toEqual([{id: "p1", permission: "edit", patterns: ["*.ts"]}]);
    expect(pending.questions).toEqual([{id: "q1", count: 2}]);
    expect(pending.permissionCount).toBe(1);
    expect(pending.questionCount).toBe(2);
});

test("deriveSession reads status and slug", () => {
    const mock = createMockTuiApi();
    mock.sessions.set("s1", {slug: "My session", status: "idle", todos: [], diff: [], permissions: [], questions: []});

    expect(deriveSession(mock.api.state, "s1")).toEqual({status: "idle", slug: "My session"});
});

test("deriveHostSnapshot derives the full host snapshot", () => {
    const mock = createMockTuiApi();
    mock.mcpRows.push({name: "mcp-1", status: "connected"});
    mock.lspRows.push({id: "lsp-1", status: "connected", root: "/root"});
    mock.providers.push("provider-1");
    mock.setDefaultModel("model-1");
    mock.setBranch("main");
    mock.sessions.set("s1", {
        slug: "S", status: "idle",
        todos: [{content: "todo", status: "pending"}],
        diff: [{file: "f.ts", additions: 1, deletions: 0}],
        permissions: [{id: "p1", permission: "edit", patterns: []}],
        questions: [{id: "q1", questions: [1]}],
    });

    const snapshot = deriveHostSnapshot(mock.api.state, "s1");

    expect(snapshot.session).toEqual({status: "idle", slug: "S"});
    expect(snapshot.todos.counts.pending).toBe(1);
    expect(snapshot.diff.count).toBe(1);
    expect(snapshot.mcp.healthy).toBe(1);
    expect(snapshot.lsp.healthy).toBe(1);
    expect(snapshot.providers).toEqual({count: 1, defaultModel: "model-1"});
    expect(snapshot.vcs).toEqual({branch: "main"});
    expect(snapshot.pending.permissionCount).toBe(1);
    expect(snapshot.pending.questionCount).toBe(1);
    expect(snapshot.path).toBe("/tmp/beanie-tui-mock");
});
