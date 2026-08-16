import {expect, test} from "bun:test";
import {createSnapshot, emptySnapshot} from "./snapshot";

test("creates the versioned snapshot with authoritative task counts", () => {
    const snapshot = createSnapshot(7, {
        count: 2,
        foreground: [{callID: "foreground"}],
        background: [{callID: "background", sessionID: "child"}],
    }, {count: 1, calls: [{callID: "queued"}]});

    expect(snapshot).toEqual({
        schema: "opencode-beanie.throttle.v1",
        sequence: 7,
        capacity: 2,
        active: {
            count: 2,
            foreground: [{callID: "foreground"}],
            background: [{callID: "background", sessionID: "child"}],
        },
        queued: {count: 1, calls: [{callID: "queued"}]},
        inactive: false,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.active.foreground[0])).toBe(true);
});

test("empty snapshot is inactive and preserves sequence", () => {
    expect(emptySnapshot(8)).toMatchObject({
        schema: "opencode-beanie.throttle.v1",
        sequence: 8,
        capacity: 2,
        active: {count: 0, foreground: [], background: []},
        queued: {count: 0, calls: []},
        inactive: true,
    });
});
