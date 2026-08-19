import {expect, test} from "bun:test";
import {registerAttentionPolicy} from "./attention";
import {at, createMockTuiApi} from "./test-helpers";

const session = (id: string, parentID?: string) => {
    const mock = createMockTuiApi();
    mock.sessions.set(id, {slug: id, parentID, todos: [], diff: [], permissions: [], questions: []});
    return mock;
};

test("notifies once per MCP degradation and again after recovery", () => {
    const mock = session("s1");
    mock.mcpRows.push({name: "mcp-1", status: "connected"});
    registerAttentionPolicy(mock.api);

    at(mock.mcpRows, 0).status = "error";
    mock.fire("mcp.tools.changed");
    at(mock.mcpRows, 0).status = "error";
    mock.fire("mcp.tools.changed");
    expect(mock.notifications).toEqual([{title: "MCP unhealthy", message: "MCP server mcp-1 is error."}]);

    at(mock.mcpRows, 0).status = "connected";
    mock.fire("mcp.tools.changed");
    at(mock.mcpRows, 0).status = "error";
    mock.fire("mcp.tools.changed");
    expect(mock.notifications).toHaveLength(2);
});

test("notifies for LSP degradation separately from MCP", () => {
    const mock = session("s1");
    mock.lspRows.push({id: "lsp-1", status: "connected"});
    registerAttentionPolicy(mock.api);

    at(mock.lspRows, 0).status = "error";
    mock.fire("lsp.updated");

    expect(mock.notifications).toEqual([{title: "LSP unhealthy", message: "LSP server lsp-1 is error."}]);
});

test("notifies session errors with sound and dedupes repeats", () => {
    const mock = session("s1");
    registerAttentionPolicy(mock.api);

    mock.fire("session.error", {properties: {sessionID: "s1", error: {name: "Boom", data: {message: "boom"}}}});
    mock.fire("session.error", {properties: {sessionID: "s1", error: {name: "Boom", data: {message: "boom"}}}});
    mock.fire("session.error", {properties: {sessionID: "s1", error: {name: "Other"}}});

    expect(mock.notifications).toEqual([
        {title: "Session error", message: "boom", sound: {name: "error"}},
        {title: "Session error", message: "Other", sound: {name: "error"}},
    ]);
});

test("notifies when a child session of the current session goes idle", () => {
    const mock = session("child-1", "parent-1");
    registerAttentionPolicy(mock.api);
    mock.setRoute({name: "session", params: {sessionID: "parent-1"}});

    mock.fire("session.idle", {properties: {sessionID: "child-1"}});
    mock.fire("session.idle", {properties: {sessionID: "child-1"}});

    expect(mock.notifications).toEqual([
        {title: "Subagent done", message: "child-1 is idle.", sound: {name: "subagent_done"}},
    ]);
});

test("does not notify for the current session or unrelated sessions", () => {
    const mock = session("other-1", "elsewhere");
    registerAttentionPolicy(mock.api);
    mock.setRoute({name: "session", params: {sessionID: "parent-1"}});

    mock.fire("session.idle", {properties: {sessionID: "parent-1"}});
    mock.fire("session.idle", {properties: {sessionID: "other-1"}});

    expect(mock.notifications).toHaveLength(0);
});

test("status change allows a fresh subagent notification", () => {
    const mock = session("child-1", "parent-1");
    registerAttentionPolicy(mock.api);
    mock.setRoute({name: "session", params: {sessionID: "parent-1"}});

    mock.fire("session.idle", {properties: {sessionID: "child-1"}});
    mock.fire("session.status", {properties: {sessionID: "child-1", status: {type: "busy"}}});
    mock.fire("session.idle", {properties: {sessionID: "child-1"}});

    expect(mock.notifications).toHaveLength(2);
});

test("dispose stops attention notifications", () => {
    const mock = session("s1");
    registerAttentionPolicy(mock.api);
    mock.disposers.forEach((dispose) => { dispose(); });

    mock.fire("session.error", {properties: {sessionID: "s1", error: {name: "Boom", data: {message: "boom"}}}});

    expect(mock.notifications).toHaveLength(0);
});
