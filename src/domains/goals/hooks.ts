import type {Config, Hooks, PluginInput} from "@opencode-ai/plugin";
import type {Event} from "@opencode-ai/sdk";
import {compactGoal} from "./compacting";
import {handleIdle, showToast} from "./idle";
import {activeGoalContext} from "./prompts";
import {runGoalCommand} from "./command";
import type {GoalStore} from "./store";
import type {Logger, ResolvedGoalPluginOptions} from "./types";

type StoreFor = (sessionID: string) => GoalStore;

export type GoalHooksInput = {
    client: PluginInput["client"];
    storeFor: StoreFor;
    tools: NonNullable<Hooks["tool"]>;
    options: ResolvedGoalPluginOptions;
    disposeStores: () => void;
};

const createLogger = (client: PluginInput["client"]): Logger => async (level, message, extra) => {
    await client.app.log({body: {service: "goals", level, message: `[goals] ${message}`, extra}}).catch(() => undefined);
};

const config = (value: Config) => {
    if (!value.command?.goal) {
        value.command = {
            ...value.command,
            goal: {
                description: "Review and maintain the session goal using goal_status, goal_set, and goal_update.",
                template: "Use the goal tools to inspect or update the current goal. Do not claim completion without verification evidence.",
            },
        };
    }
    return Promise.resolve();
};

const handleSessionDeleted = async (sessionID: string, storeFor: StoreFor) => {
    await storeFor(sessionID).clear();
};

const handleSessionError = async (
    sessionID: string,
    error: unknown,
    storeFor: StoreFor,
    client: PluginInput["client"],
    log: Logger,
) => {
    const errorObj = typeof error === "object" && error !== null ? (error as {name?: string}) : undefined;

    if (errorObj?.name !== "MessageAbortedError") {return;}

    const store = storeFor(sessionID);

    const goal = await store.get();

    if (goal?.status !== "active") {return;}

    const paused = {...goal, status: "paused" as const, updatedAt: new Date().toISOString(), lastReason: "The session was interrupted by the user."};
    await store.set(paused);
    await log("warn", "Active goal paused because session was interrupted", {sessionId: sessionID});
    await showToast(client, "Goal paused due to interruption", "warning");
};

const handleEvent = async (event: Event, ctx: {
    client: PluginInput["client"];
    storeFor: StoreFor;
    options: ResolvedGoalPluginOptions;
    processing: Set<string>;
    log: Logger;
    controlTurns: Set<string>;
}) => {
    if (event.type === "session.deleted") {
        await handleSessionDeleted(event.properties.info.id, ctx.storeFor);
    } else if (event.type === "session.error" && event.properties.sessionID) {
        await handleSessionError(event.properties.sessionID, event.properties.error, ctx.storeFor, ctx.client, ctx.log);
    } else if (event.type === "session.idle") {
        ctx.controlTurns.delete(event.properties.sessionID);
        await handleIdle({
            client: ctx.client, sessionId: event.properties.sessionID, options: ctx.options, processing: ctx.processing, log: ctx.log,
        }, ctx.storeFor(event.properties.sessionID));
    }
};

const makeCommandHook = (options: ResolvedGoalPluginOptions, storeFor: StoreFor, controlTurns: Set<string>) =>
    async (cmd: {command: string; sessionID: string; arguments: string}, output: {parts: Array<{type: string; text?: string}>}) => {
        if (cmd.command !== "goal") {return;}
        await runGoalCommand({command: cmd, output, options, controlTurns}, storeFor(cmd.sessionID));
    };

const makeTransformHook = (storeFor: StoreFor, controlTurns: Set<string>) =>
    async ({sessionID}: {sessionID?: string}, output: {system: string[]}) => {
        if (!sessionID || controlTurns.has(sessionID)) {return;}

        const goal = await storeFor(sessionID).get();

        if (goal?.status === "active") {output.system.push(activeGoalContext(goal));}
    };

export const createGoalHooks = ({client, storeFor, tools, options, disposeStores}: GoalHooksInput) => {
    const processing = new Set<string>();

    const controlTurns = new Set<string>();

    const log = createLogger(client);

    return {
        tool: tools, config,
        "command.execute.before": makeCommandHook(options, storeFor, controlTurns),
        "experimental.chat.system.transform": makeTransformHook(storeFor, controlTurns),
        "experimental.session.compacting": async ({sessionID}: {sessionID: string}, output: {context: string[]}) => {
            compactGoal(await storeFor(sessionID).get(), output.context);
        },
        event: async ({event}: {event: Event}) => {
            await handleEvent(event, {client, storeFor, options, processing, log, controlTurns});
        },
        dispose: () => Promise.resolve().then(disposeStores),
    };
};
