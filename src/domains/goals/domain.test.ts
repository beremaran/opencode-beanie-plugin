import {expect, test} from "bun:test";
import {commandHook, context, createDomain, goalSet, transformHook} from "./test-helpers";

test("injects active goal context in system transform and skips for control turns", async () => {
    const hooks = await createDomain();
    const set = goalSet(hooks);
    const session = context("ctx-session");
    await set.execute({outcome: "Add integration tests"}, session);

    const transform = transformHook(hooks);
    const output = {system: [] as string[]};
    await transform({sessionID: "ctx-session"} as never, output);
    expect(output.system).toHaveLength(1);
    expect(output.system[0]).toContain("<active-goal>");
    expect(output.system[0]).toContain("<objective>Add integration tests</objective>");

    const outputMissing = {system: [] as string[]};
    await transform({sessionID: "nonexistent"} as never, outputMissing);
    expect(outputMissing.system).toHaveLength(0);

    const cmd = commandHook(hooks);
    const cmdOutput = {parts: [{type: "text", text: "cmd"}]};
    await cmd({command: "goal", sessionID: "ctx-session", arguments: "status"}, cmdOutput as never);

    const outputControlTurn = {system: [] as string[]};
    await transform({sessionID: "ctx-session"} as never, outputControlTurn);
    expect(outputControlTurn.system).toHaveLength(0);
});

test("disposes stores cleanly without errors", async () => {
    const hooks = await createDomain();
    await hooks.dispose();
});
