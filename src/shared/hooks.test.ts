import {expect, test} from "bun:test";
import {tool} from "@opencode-ai/plugin";
import type {Hooks} from "@opencode-ai/plugin";
import {
    composeCompactingHooks,
    composeSystemTransformHooks,
    composeToolAfterHooks,
    composeToolBeforeHooks,
    composeToolDefinitionHooks,
    mergeHooks,
} from "./hooks";

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

test("composes tool definition hooks sequentially", async () => {
    const hooks: Hooks[] = [
        {
            "tool.definition": async ({toolID}, output) => {
                await Promise.resolve();
                output.description = `[first:${toolID}] ${output.description}`;
            },
        },
        {
            "tool.definition": async ({toolID}, output) => {
                await Promise.resolve();
                output.description = `${output.description} [second:${toolID}]`;
            },
        },
    ];
    const toolDef = composeToolDefinitionHooks(hooks);
    const output = {description: "base", parameters: {}};

    await toolDef?.({toolID: "goal_set"}, output);

    expect(output.description).toBe("[first:goal_set] base [second:goal_set]");
});

test("composes system transform hooks sequentially", async () => {
    const hooks: Hooks[] = [
        {
            "experimental.chat.system.transform": async (_input, output) => {
                await Promise.resolve();
                output.system.push("directive1");
            },
        },
        {
            "experimental.chat.system.transform": async (_input, output) => {
                await Promise.resolve();
                output.system.push("directive2");
            },
        },
    ];
    const systemTransform = composeSystemTransformHooks(hooks);
    const output = {system: ["initial"]};

    await systemTransform?.({model: {} as never}, output);

    expect(output.system).toEqual(["initial", "directive1", "directive2"]);
});
