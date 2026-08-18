import {tool} from "@opencode-ai/plugin";
import {createGoal, remainingTokens, updateGoal} from "./lifecycle";
import type {GoalStatus, UpdateArgs} from "./model";
import {bounded, boundedList, nonEmpty, statuses} from "./schema";
import type {GoalStore} from "./store";
import type {ResolvedGoalPluginOptions} from "./types";

const json = (value: unknown) => JSON.stringify(value);

const error = (message: string) => json({error: {code: "invalid_goal_update", message}});
type StoreFor = (sessionID: string) => GoalStore;

class GoalUpdateError extends Error {}

const goalSet = (storeFor: StoreFor, options?: ResolvedGoalPluginOptions) => tool({
    description: "Create or replace this session's durable goal.",
    args: {
        outcome: nonEmpty().describe("Required desired outcome."),
        constraints: boundedList().optional().describe("Optional constraints."),
        verification: boundedList().optional().describe("Optional verification criteria."),
        tokenBudget: tool.schema.number().int().positive().optional().describe("Optional token budget cap."),
        maxTurns: tool.schema.number().int().positive().optional().describe("Optional turn limit cap."),
    },
    async execute(args, context) {
        const tokenBudget = args.tokenBudget ?? options?.defaultTokenBudget;

        const maxTurns = args.maxTurns ?? options?.defaultMaxTurns;

        const goal = createGoal(context.sessionID, args.outcome, args.constraints ?? [], args.verification ?? [], tokenBudget, maxTurns);
        await storeFor(context.sessionID).set(goal);
        return json({goal, remainingTokens: remainingTokens(goal) ?? null});
    },
});

const goalStatus = (storeFor: StoreFor) => tool({
    description: "Return the complete current durable goal for this session, or null.",
    args: {},
    async execute(_args, context) {
        const goal = await storeFor(context.sessionID).get();

        if (!goal) {return json({goal: null});}
        return json({goal, remainingTokens: remainingTokens(goal) ?? null});
    },
});

const mutateGoal = (store: GoalStore, args: UpdateArgs) => store.mutate((goal) => {
    if (!goal) {throw new GoalUpdateError("No goal exists for this session; use goal_set first.");}

    const result = updateGoal(goal, args);

    if (typeof result === "string") {throw new GoalUpdateError(result);}
    return result;
});

const executeGoalUpdate = async (args: UpdateArgs, sessionID: string, storeFor: StoreFor) => {
    try {
        const updated = await mutateGoal(storeFor(sessionID), args);

        return json({goal: updated, remainingTokens: updated ? (remainingTokens(updated) ?? null) : null});
    } catch (cause) {
        if (cause instanceof GoalUpdateError) {return error(cause.message);}
        throw cause;
    }
};

const mapLegacyStatus = (status?: string): GoalStatus | undefined =>
    status === "complete" ? "completed" : (status as GoalStatus | undefined);

const goalUpdate = (storeFor: StoreFor) => tool({
    description: "Update the current goal's bounded progress, next action, blocker, evidence, or lifecycle status.",
    args: {
        progress: bounded().optional(),
        nextAction: bounded().optional(),
        blocker: bounded().optional(),
        verificationEvidence: boundedList().optional(),
        status: tool.schema.enum(statuses).optional(),
        reason: bounded().optional().describe("Concise reason for status change or update."),
        tokenBudget: tool.schema.number().int().positive().optional(),
        maxTurns: tool.schema.number().int().positive().optional(),
    },
    execute(args, context) {
        const status = mapLegacyStatus(args.status);

        const claim = args.reason ? {reason: args.reason, createdAt: new Date().toISOString()} : undefined;

        return executeGoalUpdate({...args, status, completionClaim: claim}, context.sessionID, storeFor);
    },
});

export const createGoalTools = (storeFor: StoreFor, options?: ResolvedGoalPluginOptions) => ({
    goal_set: goalSet(storeFor, options),
    goal_status: goalStatus(storeFor),
    goal_update: goalUpdate(storeFor),
});
