import {expect, test} from "bun:test";
import {mkdir, mkdtemp, rename, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {watchThrottleSnapshot} from "./tui-watch";

const waitFor = async (condition: () => boolean) => {
    for (let attempt = 0; attempt < 50 && !condition(); attempt++) {
        await Bun.sleep(10);
    }
};

test("refreshes when the snapshot is atomically replaced", async () => {
    const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "beanie-watch-"));
    const path = join(root, "snapshot.json");
    let updates = 0;
    await writeFile(path, "old");
    const stop = watchThrottleSnapshot(path, () => { updates++; });

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
});

test("disposes watcher listeners and does not retry after disposal", async () => {
    const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "beanie-watch-"));
    const path = join(root, "snapshot.json");
    let updates = 0;
    const stop = watchThrottleSnapshot(path, () => { updates++; });

    stop();
    await mkdir(join(root, "unused"));
    await writeFile(path, "after-dispose");
    await Bun.sleep(50);
    expect(updates).toBe(0);
    await rm(root, {recursive: true, force: true});
});
