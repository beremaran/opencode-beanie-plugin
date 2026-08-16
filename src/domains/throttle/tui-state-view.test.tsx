import {expect, mock, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {createSnapshot} from "./snapshot";
import {parseThrottleStatus, readThrottleStatus} from "./tui-state";

const valid = createSnapshot(4, {
    count: 2,
    foreground: [{callID: "fg"}],
    background: [{callID: "bg"}],
}, {count: 1, calls: [{callID: "queued"}]});

test("reads absent, malformed, old-schema, and inactive snapshots as absent", async () => {
    const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "beanie-tui-"));
    const path = join(root, "snapshot.json");

    try {
        expect(await readThrottleStatus(path)).toBeUndefined();
        expect(parseThrottleStatus({schema: "old", inactive: false})).toBeUndefined();
        expect(parseThrottleStatus({...valid, schema: "opencode-beanie.throttle.v0"})).toBeUndefined();
        expect(parseThrottleStatus({...valid, inactive: true})).toBeUndefined();
    } finally {
        await rm(root, {recursive: true, force: true});
    }
});

test("parses a valid active snapshot using counts and task lists", () => {
    expect(parseThrottleStatus(valid)).toEqual({
        active: 2,
        capacity: 2,
        queued: 1,
        foreground: 1,
        background: 1,
    });
});

test("renders absent and active status with exact compact text", async () => {
    const element = (type: unknown, props: Record<string, unknown>) => ({type, props});
    await mock.module("@opentui/solid/jsx-runtime", () => ({
        Fragment: "fragment", jsx: element, jsxs: element, jsxDEV: element,
    }));
    const view: typeof import("./tui-view") = await import("./tui-view");

    expect(view.renderThrottleStatus(undefined)).toEqual({type: "box", props: {height: 0}});
    const rendered: unknown = view.renderThrottleStatus(parseThrottleStatus(valid));
    const text = (rendered as { props: { children: { props: { children: unknown } } } })
        .props.children.props.children;

    expect(text).toEqual([
        {type: "span", props: {style: {fg: "cyan"}, children: "throttle"}}, " ",
        {type: "span", props: {children: [2, "/", 2]}}, " active, ",
        {type: "span", props: {style: {fg: "yellow"}, children: [1, " queued"]}}, " (",
        {type: "span", props: {style: {fg: "green"}, children: ["fg ", 1]}}, ", ",
        {type: "span", props: {style: {fg: "magenta"}, children: ["bg ", 1]}}, ")",
    ]);
});
