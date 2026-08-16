import {expect, mock, test} from "bun:test";

const element = (type: unknown, props: Record<string, unknown>) => ({type, props});
await mock.module("@opentui/solid/jsx-runtime", () => ({
    Fragment: "fragment", jsx: element, jsxs: element, jsxDEV: element,
}));

const plugin = await import("./tui");

test("registers sidebar footer with absent initial state and disposes its watcher", async () => {
    let disposeCalls = 0;
    let cleanup: (() => void) | undefined;
    let registration: {order: number; slots: {sidebar_footer: () => unknown}} | undefined;
    const api = {
        client: {v2: {location: {get: () => ({data: {project: {id: "tui-test"}}})}}},
        state: {path: {worktree: "/tmp"}},
        lifecycle: {onDispose: (value: () => void) => { disposeCalls++; cleanup = value; }},
        slots: {register: (value: typeof registration) => { registration = value; }},
    } as unknown as Parameters<NonNullable<typeof plugin.default.tui>>[0];

    const tui = plugin.default.tui as unknown as (value: unknown) => Promise<void>;
    await tui(api);

    expect(registration?.order).toBe(300);
    expect(registration?.slots.sidebar_footer()).toEqual({type: "box", props: {height: 0}});
    expect(disposeCalls).toBe(1);
    cleanup?.();
});
