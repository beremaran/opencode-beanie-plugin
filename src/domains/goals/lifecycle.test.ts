import {expect, test} from "bun:test";
import {context, createDomain, goalSet, goalStatus, goalUpdate, result, type Goal} from "./test-helpers";

test("updates progress and blocks invalid completion", async () => {
    const hooks = await createDomain();
    const set = goalSet(hooks);
    const update = goalUpdate(hooks);
    const session = context("lifecycle");
    await set.execute({outcome: "Finish work"}, session);
    const progress = result(await update.execute({progress: "Half done", nextAction: "Write tests"}, session)) as {goal: Goal};
    expect(progress.goal.status).toBe("active");
    expect(progress.goal.progress).toBe("Half done");
    expect(progress.goal.nextAction).toBe("Write tests");
    const blocked = result(await update.execute({status: "blocked", blocker: "Dependency"}, session)) as {goal: Goal};
    expect(blocked.goal.status).toBe("blocked");
    const blockedCompletion = result(await update.execute({status: "completed", verificationEvidence: ["Not yet"]}, session)) as {error: {code: string; message: string}};
    expect(blockedCompletion.error.message).toContain("Cannot transition blocked to completed");
});

test("requires evidence and allows replacement after completion", async () => {
    const hooks = await createDomain();
    const set = goalSet(hooks);
    const update = goalUpdate(hooks);
    const status = goalStatus(hooks);
    const session = context("lifecycle");
    await set.execute({outcome: "Finish work"}, session);
    await update.execute({status: "active"}, session);
    const completedWithoutEvidence = result(await update.execute({status: "completed"}, session)) as {error: {code: string; message: string}};
    expect(completedWithoutEvidence.error.message).toContain("verificationEvidence");
    const completed = result(await update.execute({status: "completed", verificationEvidence: ["Tests passed"]}, session)) as {goal: Goal};
    expect(completed.goal.status).toBe("completed");
    expect(completed.goal.verificationEvidence).toEqual(["Tests passed"]);
    expect(completed.goal.completedAt).toBeTruthy();
    const terminal = result(await update.execute({progress: "late"}, session)) as {error: {code: string; message: string}};
    expect(terminal.error.message).toContain("Terminal goals");
    await set.execute({outcome: "Replacement"}, session);
    expect((result(await status.execute({}, session)) as {goal: Goal}).goal.outcome).toBe("Replacement");
});
