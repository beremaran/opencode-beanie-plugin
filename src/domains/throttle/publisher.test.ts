import {expect, test} from "bun:test";
import {createPermitPool} from "./permits";
import {createThrottlePublisher, type ThrottleTask} from "./publisher";
import type {ThrottleSnapshot} from "./snapshot";

test("publishes queued, foreground, and background transitions", async () => {
    const permits = createPermitPool();
    const releaseOne = await permits.acquire("one");
    await permits.acquire("two");
    const queued = permits.acquire("three");
    const tasks = new Map<string, ThrottleTask>([
        ["one", {phase: "foreground"}],
        ["two", {phase: "background", sessionID: "child"}],
        ["three", {phase: "queued"}],
    ]);
    const snapshots: ThrottleSnapshot[] = [];
    const writer = {publish: (value: ThrottleSnapshot) => snapshots.push(value), flush: () => Promise.resolve()};
    const publisher = createThrottlePublisher(permits, tasks, writer);

    publisher.publish();
    expect(snapshots[0]).toMatchObject({
        active: {count: 2, foreground: [{callID: "one"}], background: [{callID: "two"}]},
        queued: {count: 1, calls: [{callID: "three"}]},
    });

    publisher.admitted("three");
    expect(tasks.get("three")?.phase).toBe("foreground");
    releaseOne();
    await queued;
    publisher.publish();
    const latest = snapshots[1];
    if (!latest) {
        throw new Error("Expected a second snapshot.");
    }
    expect(latest.active.foreground.map(({callID}) => callID)).toEqual(["one", "three"]);
});

test("publishes an inactive empty snapshot on terminal cleanup", () => {
    const permits = createPermitPool();
    const tasks = new Map<string, ThrottleTask>();
    const snapshots: ThrottleSnapshot[] = [];
    const writer = {publish: (value: ThrottleSnapshot) => snapshots.push(value), flush: () => Promise.resolve()};
    const publisher = createThrottlePublisher(permits, tasks, writer);

    publisher.empty();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({inactive: true, active: {count: 0}, queued: {count: 0}});
});
