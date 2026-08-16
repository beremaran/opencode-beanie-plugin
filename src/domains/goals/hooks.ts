import type {Config, Hooks} from "@opencode-ai/plugin";
import type {Event} from "@opencode-ai/sdk";
import {compactGoal} from "./compacting";
import type {GoalStore} from "./store";

type StoreFor = (sessionID: string) => GoalStore;

const config = (value: Config) => {
    if (!value.command?.goal) {
        value.command = {...value.command, goal: {
            description: "Review and maintain the session goal using goal_status, goal_set, and goal_update.",
            template: "Use the goal tools to inspect or update the current goal. Do not claim completion without verification evidence.",
        }};
    }

    return Promise.resolve();
};

const event = async (storeFor: StoreFor, value: Event) => {
    if (value.type === "session.deleted") {
        await storeFor(value.properties.info.id).clear();
    }
};

export const createGoalHooks = (storeFor: StoreFor, tools: NonNullable<Hooks["tool"]>, disposeStores: () => void) => ({
    tool: tools,
    config,
    "experimental.session.compacting": async (value: {sessionID: string}, output: {context: string[]}) => {
        compactGoal(await storeFor(value.sessionID).get(), output.context);
    },
    event: async (value: {event: Event}) => {
        await event(storeFor, value.event);
    },
    dispose: () => Promise.resolve().then(disposeStores),
});
