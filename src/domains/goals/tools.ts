import {tool} from "@opencode-ai/plugin";
import type {Goal} from "./model";
import {createGoal, updateGoal} from "./lifecycle";
import {bounded, boundedList, nonEmpty, statuses} from "./schema";

const json = (value: unknown) => JSON.stringify(value);

const error = (message: string) => json({error: {code: "invalid_goal_update", message}});
type Goals = Map<string, Goal>;
type Publisher = {publish: (goal: Goal) => void};

const goalSet = (goals: Goals, publisher: Publisher) => tool({
    description: "Create or replace this session's process-memory goal. State is lost when the plugin restarts.",
    args: {outcome: nonEmpty().describe("Required desired outcome."), constraints: boundedList().optional().describe("Optional constraints."), verification: boundedList().optional().describe("Optional verification criteria.")},
    execute(args, context) {
        const goal = createGoal(context.sessionID, args.outcome, args.constraints ?? [], args.verification ?? []);
        goals.set(context.sessionID, goal);
        publisher.publish(goal);
        return Promise.resolve(json({goal}));
    },
});

const goalStatus = (goals: Goals) => tool({
    description: "Return the complete current process-memory goal for this session, or null.", args: {},
    execute(_args, context) { return Promise.resolve(json({goal: goals.get(context.sessionID) ?? null})); },
});

const goalUpdate = (goals: Goals, publisher: Publisher) => tool({
    description: "Update the current goal's bounded progress, next action, blocker, evidence, or lifecycle status.",
    args: {progress: bounded().optional(), nextAction: bounded().optional(), blocker: bounded().optional(), verificationEvidence: boundedList().optional(), status: tool.schema.enum(statuses).optional()},
    execute(args, context) {
        const goal = goals.get(context.sessionID);

        if (!goal) {
            return Promise.resolve(error("No goal exists for this session; use goal_set first."));
        }

        const updated = updateGoal(goal, args);

        if (typeof updated !== "string") {
            publisher.publish(updated);
        }

        return Promise.resolve(typeof updated === "string" ? updated : json({goal: updated}));
    },
});

export const createGoalTools = (goals: Goals, publisher: Publisher) => ({
    goal_set: goalSet(goals, publisher), goal_status: goalStatus(goals), goal_update: goalUpdate(goals, publisher),
});
