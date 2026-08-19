import {expect, test} from "bun:test";
import {registerGoalControls} from "./goal-controls";
import {at, createMockTuiApi} from "./test-helpers";

const wait = (milliseconds = 0) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("registers goal commands in the keymap layer", () => {
    const mock = createMockTuiApi();
    registerGoalControls(mock.api);

    expect(at(mock.keymapLayers, 0).commands.map((command) => command.name))
        .toEqual(["beanie.goal.status", "beanie.goal.pause", "beanie.goal.resume", "beanie.goal.clear"]);
});

test("executes the goal command for the current session", async () => {
    const mock = createMockTuiApi();
    registerGoalControls(mock.api);
    mock.setRoute({name: "session", params: {sessionID: "s1"}});

    at(at(mock.keymapLayers, 0).commands, 0).run();
    await wait();

    expect(mock.goalCommands).toEqual([{sessionID: "s1", command: "goal", arguments: "status"}]);
    expect(mock.toasts).toEqual([{title: "Goal", message: "Goal status requested", variant: "success"}]);
});

test("toasts an error when no session is current", async () => {
    const mock = createMockTuiApi();
    registerGoalControls(mock.api);

    at(at(mock.keymapLayers, 0).commands, 1).run();
    await wait();

    expect(mock.toasts).toEqual([{title: "Goal", message: "No active session", variant: "error"}]);
    expect(mock.goalCommands).toHaveLength(0);
});

test("toasts an error when the command throws", async () => {
    const mock = createMockTuiApi();
    registerGoalControls(mock.api);
    mock.setRoute({name: "session", params: {sessionID: "s1"}});
    mock.setGoalCommandError(() => {throw new Error("boom");});

    at(at(mock.keymapLayers, 0).commands, 2).run();
    await wait();

    expect(mock.toasts).toEqual([{title: "Goal", message: "Goal command failed", variant: "error"}]);
});

test("toasts an error when the command response is an error", async () => {
    const mock = createMockTuiApi();
    registerGoalControls(mock.api);
    mock.setRoute({name: "session", params: {sessionID: "s1"}});
    mock.setGoalCommandError(() => ({error: "failed"}));

    at(at(mock.keymapLayers, 0).commands, 0).run();
    await wait();

    expect(mock.toasts).toEqual([{title: "Goal", message: "Goal command failed", variant: "error"}]);
});

test("clear asks for confirmation before executing", async () => {
    const mock = createMockTuiApi();
    registerGoalControls(mock.api);
    mock.setRoute({name: "session", params: {sessionID: "s1"}});

    at(at(mock.keymapLayers, 0).commands, 3).run();
    expect(mock.dialogEntries).toHaveLength(1);
    const confirm = at(mock.dialogEntries, 0).render() as {onConfirm?: () => void};
    confirm.onConfirm?.();
    await wait();

    expect(mock.goalCommands).toEqual([{sessionID: "s1", command: "goal", arguments: "clear"}]);
});

test("cancelling the confirmation does not execute clear", async () => {
    const mock = createMockTuiApi();
    registerGoalControls(mock.api);
    mock.setRoute({name: "session", params: {sessionID: "s1"}});

    at(at(mock.keymapLayers, 0).commands, 3).run();
    const cancel = at(mock.dialogEntries, 0).render() as {onCancel?: () => void};
    cancel.onCancel?.();
    await wait();

    expect(mock.goalCommands).toHaveLength(0);
});

test("dispose unregisters the layer and clears an open dialog", () => {
    const mock = createMockTuiApi();
    registerGoalControls(mock.api);
    at(at(mock.keymapLayers, 0).commands, 3).run();

    mock.disposers.forEach((dispose) => { dispose(); });

    expect(mock.keymapLayers).toHaveLength(0);
    expect(mock.dialogEntries).toHaveLength(0);
});
