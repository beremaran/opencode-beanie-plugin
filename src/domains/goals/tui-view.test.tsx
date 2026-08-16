import {expect, mock, test} from "bun:test";
import type {GoalSnapshotGoal} from "./snapshot";

const goal: GoalSnapshotGoal = {
    id: "goal-private-id", sessionID: "session-1", version: 1,
    createdAt: "2026-08-16T10:00:00.000Z", updatedAt: "2026-08-16T10:05:00.000Z",
    status: "active", outcome: "Ship the sidebar", constraints: ["private constraint"],
    verificationCriteria: ["private criterion"], verificationEvidence: ["private evidence"],
    progress: "Renderer is nearly ready", nextAction: "Run focused tests", blocker: "private blocker",
};

const state = (overrides: Partial<GoalSnapshotGoal> = {}) => ({
    projectID: "project-1", sessionID: "session-1", goal: {...goal, ...overrides},
});

const loadView = async () => {
    const element = (type: unknown, props: Record<string, unknown>) => ({type, props});
    await mock.module("@opentui/solid/jsx-runtime", () => ({
        Fragment: "fragment", jsx: element, jsxs: element, jsxDEV: element,
    }));

    return import("./tui-view");
};

const textChildren = (rendered: unknown) =>
    (rendered as {props: {children: {props: {children: unknown}}}}).props.children.props.children;

test("renders absent goals as a zero-height box", async () => {
    const view = await loadView();

    expect(view.renderGoalsStatus(undefined)).toEqual({type: "box", props: {height: 0}});
});

test("renders an active goal with progress and no private fields", async () => {
    const view = await loadView();

    expect(textChildren(view.renderGoalsStatus(state()))).toEqual([
        {type: "span", props: {style: {fg: "cyan"}, children: "Goal"}}, " ",
        {type: "span", props: {style: {fg: "green"}, children: "active"}}, " - ", "Ship the sidebar", " · ",
        {type: "span", props: {style: {fg: "magenta"}, children: ["progress", ": ", "Renderer is nearly ready"]}},
    ]);
});

test("renders blocked, completed, and next-action details exactly", async () => {
    const view = await loadView();

    expect(textChildren(view.renderGoalsStatus(state({status: "blocked", blocker: "Waiting on review"})))).toEqual([
        {type: "span", props: {style: {fg: "cyan"}, children: "Goal"}}, " ",
        {type: "span", props: {style: {fg: "red"}, children: "blocked"}}, " - ", "Ship the sidebar", " · ",
        {type: "span", props: {style: {fg: "red"}, children: ["blocker", ": ", "Waiting on review"]}},
    ]);
    expect(textChildren(view.renderGoalsStatus(state({status: "completed", progress: undefined, nextAction: "Celebrate"})))).toEqual([
        {type: "span", props: {style: {fg: "cyan"}, children: "Goal"}}, " ",
        {type: "span", props: {style: {fg: "green"}, children: "completed"}}, " - ", "Ship the sidebar", " · ",
        {type: "span", props: {style: {fg: "magenta"}, children: ["next", ": ", "Celebrate"]}},
    ]);
});

test("bounds long detail output", async () => {
    const view = await loadView();
    const longProgress = "x".repeat(100);
    const children = textChildren(view.renderGoalsStatus(state({progress: longProgress}))) as unknown[];

    expect(children[children.length - 1]).toEqual({
        type: "span", props: {style: {fg: "magenta"}, children: ["progress", ": ", "x".repeat(72)]},
    });
});
