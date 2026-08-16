import {expect, test} from "bun:test";
import {tool} from "@opencode-ai/plugin";
import type {Hooks} from "@opencode-ai/plugin";
import {composeCompactingHooks, composeToolAfterHooks, composeToolBeforeHooks, mergeHooks} from "./hooks";

function toolCall() {
    return [
        {tool: "task", sessionID: "test", callID: "call"},
        {args: {}},
    ] as const;
}

test("composes tool hooks sequentially and waits for async domains", async () => {
    const output: string[] = [];
    const hooks: Hooks[] = [
        {
            "tool.execute.before": async () => {
                output.push("before:first");
                await Promise.resolve();
                output.push("before:first:done");
            },
            "tool.execute.after": async () => {
                output.push("after:first");
                await Promise.resolve();
                output.push("after:first:done");
            },
        },
        {
            "tool.execute.before": async () => {
                await Promise.resolve();
                output.push("before:second");
            },
            "tool.execute.after": async () => {
                await Promise.resolve();
                output.push("after:second");
            },
        },
    ];

    await composeToolBeforeHooks(hooks)?.(...toolCall());
    await composeToolAfterHooks(hooks)?.(
        {tool: "task", sessionID: "test", callID: "call", args: {}},
        {title: "", output: "", metadata: {}},
    );

    expect(output).toEqual([
        "before:first",
        "before:first:done",
        "before:second",
        "after:first",
        "after:first:done",
        "after:second",
    ]);
});

test("rejects duplicate tool names instead of overwriting", () => {
    const definition = tool({
        description: "test",
        args: {},
        execute: async () => {
            await Promise.resolve();
            return "";
        },
    });

    expect(() =>
        mergeHooks([
            {tool: {shared: definition}},
            {tool: {shared: definition}},
        ]),
    ).toThrow("Duplicate tool name: shared");
});

test("composes compacting hooks sequentially with accumulated context", async () => {
    const output: string[] = [];
    const hooks: Hooks[] = [
        {
            "experimental.session.compacting": async (_input, context) => {
                output.push("first:start");
                await Promise.resolve();
                context.context.push("first");
                output.push("first:done");
            },
        },
        {
            "experimental.session.compacting": async (_input, context) => {
                output.push(`second:seen:${context.context.join(",")}`);
                await Promise.resolve();
                context.context.push("second");
            },
        },
    ];
    const compacting = composeCompactingHooks(hooks);
    const context = {context: [] as string[]};

    await compacting?.({sessionID: "test"}, context);

    expect(output).toEqual(["first:start", "first:done", "second:seen:first"]);
    expect(context.context).toEqual(["first", "second"]);
});
