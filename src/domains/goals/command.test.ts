import {expect, test} from "bun:test";
import {commandHook, context, createDomain, goalStatus, result, type Goal} from "./test-helpers";

test("executes /goal status and help commands", async () => {
    const hooks = await createDomain();
    const cmd = commandHook(hooks);

    const outputStatus = {parts: [{type: "text", text: "initial"}]};
    await cmd({command: "goal", sessionID: "cmd-session", arguments: "status"}, outputStatus as never);
    expect((outputStatus.parts[0] as {text: string}).text).toContain("no goal for this session");

    const outputHelp = {parts: [{type: "text", text: "initial"}]};
    await cmd({command: "goal", sessionID: "cmd-session", arguments: "help"}, outputHelp as never);
    expect((outputHelp.parts[0] as {text: string}).text).toContain("/goal <completion condition>");
});

test("executes /goal set, pause, resume, and clear", async () => {
    const hooks = await createDomain({goal: {defaultTokenBudget: 50_000, defaultMaxTurns: 10}});
    const cmd = commandHook(hooks);
    const status = goalStatus(hooks);
    const session = context("cmd-session");

    const outputSet = {parts: [{type: "text", text: "initial"}]};
    await cmd({command: "goal", sessionID: "cmd-session", arguments: "--tokens 30k Complete refactor"}, outputSet as never);
    const setText = (outputSet.parts[0] as {text: string}).text;
    expect(setText).toContain("<objective>Complete refactor</objective>");
    expect(setText).toContain("token_budget=30000");
    expect(setText).toContain("max_turns=10");

    const created = result(await status.execute({}, session)) as {goal: Goal};
    expect(created.goal.outcome).toBe("Complete refactor");
    expect(created.goal.tokenBudget).toBe(30_000);
    expect(created.goal.maxTurns).toBe(10);
    expect(created.goal.status).toBe("active");

    const outputPause = {parts: [{type: "text", text: "initial"}]};
    await cmd({command: "goal", sessionID: "cmd-session", arguments: "pause"}, outputPause as never);
    expect((outputPause.parts[0] as {text: string}).text).toContain("paused");
    expect((result(await status.execute({}, session)) as {goal: Goal}).goal.status).toBe("paused");

    const outputResume = {parts: [{type: "text", text: "initial"}]};
    await cmd({command: "goal", sessionID: "cmd-session", arguments: "resume"}, outputResume as never);
    expect((outputResume.parts[0] as {text: string}).text).toContain("<goal-continuation>");
    expect((result(await status.execute({}, session)) as {goal: Goal}).goal.status).toBe("active");

    const outputClear = {parts: [{type: "text", text: "initial"}]};
    await cmd({command: "goal", sessionID: "cmd-session", arguments: "clear"}, outputClear as never);
    expect((outputClear.parts[0] as {text: string}).text).toContain("cleared");
    expect((result(await status.execute({}, session)) as {goal: Goal | null}).goal).toBeNull();
});
