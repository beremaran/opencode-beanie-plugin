import {expect, test} from "bun:test";
import {context, createDomain, createDomainAt, event, goalSet, goalStatus, goalUpdate, result} from "./test-helpers";
import type {Goal} from "./test-helpers";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";

test("ignores compaction for other sessions", async () => {
    const hooks = await createDomain();
    const set = goalSet(hooks);
    const compact = hooks["experimental.session.compacting"];
    await set.execute({outcome: "Recover me", constraints: ["No regressions"], verification: ["Check output"]}, context("kept"));
    await goalUpdate(hooks).execute({verificationEvidence: ["Output checked"]}, context("kept"));
    const otherOutput = {context: [] as string[]};
    await compact({sessionID: "other"}, otherOutput);
    expect(otherOutput.context).toEqual([]);
});

test("recovers the matching session context", async () => {
    const hooks = await createDomain();
    const set = goalSet(hooks);
    const compact = hooks["experimental.session.compacting"];
    const session = context("kept");
    await set.execute({outcome: "Recover me", constraints: ["No regressions"], verification: ["Check output"]}, session);
    await goalUpdate(hooks).execute({verificationEvidence: ["Output checked"]}, session);
    const matchingOutput = {context: [] as string[]};
    await compact({sessionID: "kept"}, matchingOutput);
    expect(matchingOutput.context).toHaveLength(1);
    expect(matchingOutput.context[0]?.length).toBeLessThanOrEqual(1_500);
    expect(matchingOutput.context[0]).toContain("Recover me");
    expect(matchingOutput.context[0]).toContain("No regressions");
    expect(matchingOutput.context[0]).toContain("Output checked");
});

test("removes deleted goals", async () => {
    const hooks = await createDomain();
    const session = context("kept");
    await goalSet(hooks).execute({outcome: "Recover me"}, session);
    const eventHook = hooks.event;
    await eventHook(event("kept"));
    const status = result(await goalStatus(hooks).execute({}, session)) as {goal: Goal | null};
    expect(status.goal).toBeNull();
});

test("dispose preserves state for a fresh domain instance", async () => {
    const root = await mkdtemp(join(tmpdir(), "beanie-goals-restart-"));
    const hooks = await createDomainAt(root);
    const session = context("disposed");
    await goalSet(hooks).execute({outcome: "Temporary"}, session);
    const dispose = hooks.dispose;
    await dispose();
    const recovered = await createDomainAt(root);
    expect((result(await goalStatus(recovered).execute({}, session)) as {goal: Goal | null}).goal?.outcome).toBe("Temporary");
    await rm(root, {recursive: true, force: true});
});
