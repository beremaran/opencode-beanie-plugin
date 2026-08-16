import {tool} from "@opencode-ai/plugin";
import {createGoal, updateGoal} from "./lifecycle";
import type {UpdateArgs} from "./model";
import {bounded, boundedList, nonEmpty, statuses} from "./schema";
import type {GoalStore} from "./store";

const json = (value: unknown) => JSON.stringify(value);

const error = (message: string) => json({error: {code: "invalid_goal_update", message}});
type StoreFor = (sessionID: string) => GoalStore;

class GoalUpdateError extends Error {}

const goalSet = (storeFor: StoreFor) => tool({
    description: "Create or replace this session's durable goal.",
    args: {outcome: nonEmpty().describe("Required desired outcome."), constraints: boundedList().optional().describe("Optional constraints."), verification: boundedList().optional().describe("Optional verification criteria.")},
    async execute(args, context) {
        const goal = createGoal(context.sessionID, args.outcome, args.constraints ?? [], args.verification ?? []);
        await storeFor(context.sessionID).set(goal);
        return json({goal});
    },
});

const goalStatus = (storeFor: StoreFor) => tool({
    description: "Return the complete current durable goal for this session, or null.", args: {},
    async execute(_args, context) { return json({goal: await storeFor(context.sessionID).get() ?? null}); },
});

const mutateGoal = (store: GoalStore, args: UpdateArgs) => store.mutate((goal) => {
    if (!goal) {
        throw new GoalUpdateError("No goal exists for this session; use goal_set first.");
    }

    const result = updateGoal(goal, args);

    if (typeof result === "string") {
        throw new GoalUpdateError(result);
    }

    return result;
});

const executeGoalUpdate = async (args: UpdateArgs, sessionID: string, storeFor: StoreFor) => {
    try {
        const updated = await mutateGoal(storeFor(sessionID), args);

        return json({goal: updated});
    } catch (cause) {
        if (cause instanceof GoalUpdateError) {return error(cause.message);}

        throw cause;
    }
};

const goalUpdate = (storeFor: StoreFor) => tool({
    description: "Update the current goal's bounded progress, next action, blocker, evidence, or lifecycle status.",
    args: {progress: bounded().optional(), nextAction: bounded().optional(), blocker: bounded().optional(), verificationEvidence: boundedList().optional(), status: tool.schema.enum(statuses).optional()},
    execute(args, context) {return executeGoalUpdate(args, context.sessionID, storeFor);},
});

export const createGoalTools = (storeFor: StoreFor) => ({
    goal_set: goalSet(storeFor), goal_status: goalStatus(storeFor), goal_update: goalUpdate(storeFor),
});
