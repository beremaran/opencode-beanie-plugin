import {afterEach, expect, test} from "bun:test";
import {mkdtemp, readdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {emptySnapshot, type GoalSnapshot} from "./snapshot";
import {createSnapshotWriter, writeGoalSnapshot} from "./storage";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const temporaryPath = async () => {
    const directory = await mkdtemp(join(tmpdir(), "beanie-goals-"));
    directories.push(directory);
    return join(directory, "nested", "snapshot.json");
};

const snapshot = (sessionID: string): GoalSnapshot => emptySnapshot("project-1", sessionID);

test("writes deterministic JSON atomically and creates parent directories", async () => {
    const path = await temporaryPath();
    const value = snapshot("session-1");

    await writeGoalSnapshot(path, value);

    expect(await Bun.file(path).text()).toBe(`${JSON.stringify(value)}\n`);
    expect((await readdir(join(path, ".."))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});

test("coalesces pending publishes and leaves the latest snapshot", async () => {
    const path = await temporaryPath();
    const writer = createSnapshotWriter(path);

    writer.publish(snapshot("session-1"));
    writer.publish(snapshot("session-2"));
    writer.publish(snapshot("session-3"));
    await writer.flush();

    expect(JSON.parse(await Bun.file(path).text())).toMatchObject({sessionID: "session-3"});
});
