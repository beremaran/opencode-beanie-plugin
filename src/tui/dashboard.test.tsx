import {expect, mock, test} from "bun:test";
import {Dashboard, GoalsPanel, registerDashboardRoute} from "./dashboard";
import {createMockTuiApi} from "./test-helpers";

const element = (type: unknown, props: Record<string, unknown>) =>
    typeof type === "function" ? (type as (props: Record<string, unknown>) => unknown)(props) : {type, props};
await mock.module("@opentui/solid/jsx-runtime", () => ({
    Fragment: "fragment", jsx: element, jsxs: element, jsxDEV: element,
}));

test("renders session panels when a session is selected", () => {
    const mock = createMockTuiApi();
    mock.sessions.set("s1", {
        slug: "S", status: "idle",
        todos: [{content: "todo", status: "pending"}],
        diff: [{file: "f.ts", additions: 1, deletions: 0}],
        permissions: [{id: "p1", permission: "edit", patterns: []}],
        questions: [{id: "q1", questions: [1]}],
    });

    const output = JSON.stringify(Dashboard({api: mock.api, sessionId: "s1"}));

    expect(output).toContain("ACTIVITY");
    expect(output).toContain("WORK");
    expect(output).toContain("GOALS");
    expect(output).toContain("THROTTLE");
    expect(output).toContain("ENVIRONMENT");
    expect(output).toContain("session s1");
});

test("renders the empty state without a session", () => {
    const mock = createMockTuiApi();

    const output = JSON.stringify(Dashboard({api: mock.api}));

    expect(output).toContain("Select a session to inspect its dashboard.");
});

test("renders goal progress and blocker details", () => {
    const mock = createMockTuiApi();
    const colors = mock.api.theme.current;
    const blockedGoal = {
        id: "g1", sessionID: "s1", version: 1, createdAt: "", updatedAt: "",
        status: "blocked" as const, outcome: "Ship it", blocker: "Need keys",
        constraints: [], verificationCriteria: [], verificationEvidence: [],
    };
    const progressGoal = {
        id: "g2", sessionID: "s1", version: 1, createdAt: "", updatedAt: "",
        status: "active" as const, outcome: "Fix bug", progress: "Writing tests",
        constraints: [], verificationCriteria: [], verificationEvidence: [],
    };

    const blockedOutput = JSON.stringify(GoalsPanel({goal: blockedGoal, colors}));
    const progressOutput = JSON.stringify(GoalsPanel({goal: progressGoal, colors}));

    expect(blockedOutput).toContain("Need keys");
    expect(blockedOutput).toContain("Ship it");
    expect(progressOutput).toContain("Writing tests");
    expect(progressOutput).toContain("Fix bug");
});

test("registers and unregisters the dashboard route with params and fallback", () => {
    const mock = createMockTuiApi();
    registerDashboardRoute(mock.api);

    expect(mock.registeredRoutes).toEqual(["beanie.dashboard"]);
    mock.setRoute({name: "session", params: {sessionID: "s2"}});
    const renderParam = mock.api.route.register as unknown;
    expect(renderParam).toBeDefined();

    mock.disposers.forEach((dispose) => { dispose(); });
    expect(mock.registeredRoutes).toEqual([]);
});
