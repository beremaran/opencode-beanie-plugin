import {expect, test} from "bun:test";
import {createPermitPool} from "./permits";

test("reports authoritative active and queued state before acquire settles", async () => {
    const permits = createPermitPool();
    const changes: string[] = [];

    permits.onChange(({type, label}) => changes.push(`${type}:${label ?? ""}`));
    const first = permits.acquire("one");
    const second = permits.acquire("two");
    const third = permits.acquire("three");

    expect(permits.state()).toEqual({active: 2, queued: ["three"]});
    expect(changes).toEqual(["admitted:one", "admitted:two", "queued:three"]);

    const releaseFirst = await first;
    const releaseSecond = await second;
    expect(permits.state()).toEqual({active: 2, queued: ["three"]});

    releaseFirst();
    await third;
    expect(permits.state()).toEqual({active: 2, queued: []});
    releaseSecond();
    expect(permits.state()).toEqual({active: 1, queued: []});
});

test("release is idempotent and dispose rejects queued entries", async () => {
    const permits = createPermitPool();
    const first = await permits.acquire("one");
    const second = await permits.acquire("two");
    const queued = permits.acquire("three");

    permits.dispose();
    await queued.then(() => {
        throw new Error("Expected queued acquire to reject.");
    }, (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
    });

    first();
    first();
    second();
    expect(permits.state()).toEqual({active: 0, queued: []});
    const rejected = permits.acquire("four");
    await rejected.then(() => {
        throw new Error("Expected disposed acquire to reject.");
    }, (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("disposed");
    });
});
