import {afterEach, expect, test} from "bun:test";
import {mkdtemp, readdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createSnapshot, type ThrottleSnapshot} from "./snapshot";
import {createSnapshotWriter, readThrottleSnapshot, writeThrottleSnapshot} from "./storage";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const temporaryPath = async () => {
    const directory = await mkdtemp(join(tmpdir(), "beanie-throttle-"));
    directories.push(directory);
    return join(directory, "nested", "snapshot.json");
};

const snapshot = (sequence: number): ThrottleSnapshot => createSnapshot(sequence, {
    count: 0, foreground: [], background: [],
}, {count: 0, calls: []});

const expectInvalid = async (promise: Promise<unknown>) => {
    await promise.then(() => {
        throw new Error("Expected invalid snapshot to reject.");
    }, (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Invalid throttle snapshot");
    });
};

test("validates schema version and capacity when reading", async () => {
    const path = await temporaryPath();
    await Bun.write(path, JSON.stringify({...snapshot(1), schema: "wrong"}));
    const wrongSchema = readThrottleSnapshot(path);
    await expectInvalid(wrongSchema);
    await Bun.write(path, JSON.stringify({...snapshot(1), capacity: 3}));
    const wrongCapacity = readThrottleSnapshot(path);
    await expectInvalid(wrongCapacity);
});

test("writes atomically and cleans temporary files", async () => {
    const path = await temporaryPath();
    await writeThrottleSnapshot(path, snapshot(3));

    expect(await readThrottleSnapshot(path)).toMatchObject({sequence: 3});
    expect((await readdir(join(path, ".."))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});

test("coalesces pending publishes and leaves the latest snapshot", async () => {
    const path = await temporaryPath();
    const writer = createSnapshotWriter(path);

    writer.publish(snapshot(1));
    writer.publish(snapshot(2));
    writer.publish(snapshot(3));
    await writer.flush();

    expect(await readThrottleSnapshot(path)).toMatchObject({sequence: 3});
});
