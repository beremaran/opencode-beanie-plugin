import type {Config, Hooks} from "@opencode-ai/plugin";
import type {Event} from "@opencode-ai/sdk";
import type {Goal} from "./model";
import {compactGoal} from "./compacting";
import type {createGoalPublisher} from "./publisher";

type Goals = Map<string, Goal>;
type Publisher = ReturnType<typeof createGoalPublisher>;

const config = (value: Config) => {
    if (!value.command?.goal) {
        value.command = {...value.command, goal: {
            description: "Review and maintain the session goal using goal_status, goal_set, and goal_update.",
            template: "Use the goal tools to inspect or update the current goal. Do not claim completion without verification evidence.",
        }};
    }

    return Promise.resolve();
};

const event = (goals: Goals, publisher: Publisher, value: Event) => {
    if (value.type === "session.deleted") {
        publisher.empty(value.properties.info.id);
        goals.delete(value.properties.info.id);
    }
};

export const createGoalHooks = (goals: Goals, publisher: Publisher, tools: NonNullable<Hooks["tool"]>) => ({
    tool: tools,
    config,
    "experimental.session.compacting": (value: {sessionID: string}, output: {context: string[]}) => {
        compactGoal(goals.get(value.sessionID), output.context);
        return Promise.resolve();
    },
    event: (value: {event: Event}) => {
        event(goals, publisher, value.event);
        return Promise.resolve();
    },
    dispose: async () => {
        await publisher.dispose();
        goals.clear();
    },
});
