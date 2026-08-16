import {afterEach, expect, test} from "bun:test";
import {mkdtemp, readdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {writeAtomically} from "./storage";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const temporaryPath = async () => {
    const directory = await mkdtemp(join(tmpdir(), "beanie-goals-"));
    directories.push(directory);
    return join(directory, "nested", "snapshot.json");
};

test("writes deterministic JSON atomically and creates parent directories", async () => {
    const path = await temporaryPath();
    const value = {schema: "test", value: 1};

    await writeAtomically(path, `${JSON.stringify(value)}\n`);

    expect(await Bun.file(path).text()).toBe(`${JSON.stringify(value)}\n`);
    expect((await readdir(join(path, ".."))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});
