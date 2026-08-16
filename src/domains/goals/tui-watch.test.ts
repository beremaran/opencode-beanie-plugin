import {expect, test} from "bun:test";
import {mkdir, mkdtemp, rename, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {watchGoalsSnapshot} from "./tui-watch";

const waitFor = async (condition: () => boolean) => {
    for (let attempt = 0; attempt < 150 && !condition(); attempt++) {
        await Bun.sleep(10);
    }
};

test("refreshes when the snapshot is atomically replaced", async () => {
    await assertAtomicReplacement();
});

async function assertAtomicReplacement() {
    const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "beanie-goals-watch-"));
    const path = join(root, "snapshot.json");
    let updates = 0;
    await writeFile(path, "old");
    const stop = watchGoalsSnapshot(path, () => { updates++; });

    try {
        await Bun.sleep(50);
        const replacement = join(root, "snapshot.next");
        await writeFile(replacement, "new");
        await rename(replacement, path);
        await waitFor(() => updates > 0);
        expect(updates).toBeGreaterThan(0);
    } finally {
        stop();
        await rm(root, {recursive: true, force: true});
    }
}

test("retries until a missing snapshot directory is created", async () => {
    await assertMissingDirectoryRetry();
});

async function assertMissingDirectoryRetry() {
    const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "beanie-goals-watch-"));
    const directory = join(root, "goals");
    const path = join(directory, "snapshot.json");
    let updates = 0;
    const stop = watchGoalsSnapshot(path, () => { updates++; });

    try {
        await Bun.sleep(50);
        await mkdir(directory);
        await Bun.sleep(1050);
        await writeFile(path, "created");
        await waitFor(() => updates > 0);
        expect(updates).toBeGreaterThan(0);
    } finally {
        stop();
        await rm(root, {recursive: true, force: true});
    }
}

test("disposal is idempotent and cancels retry callbacks", async () => {
    const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "beanie-goals-watch-"));
    const path = join(root, "missing", "snapshot.json");
    let updates = 0;
    const stop = watchGoalsSnapshot(path, () => {
        updates++;
    });

    stop();
    stop();
    await mkdir(join(root, "missing"));
    await writeFile(path, "after-dispose");
    await Bun.sleep(1050);
    expect(updates).toBe(0);
    await rm(root, {recursive: true, force: true});
});
