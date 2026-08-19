import {evaluateGoal} from "./evaluator";
import {continueParent, showToast} from "./idle-dispatch";
import type {Goal} from "./model";
import {budgetLimitPrompt, continuationPrompt} from "./prompts";
import type {GoalStore} from "./store";
import {latestAssistant, totalGoalTokens} from "./transcript";
import type {EvaluationDecision, IdleInput, TranscriptMessage} from "./types";

export {showToast} from "./idle-dispatch";

const pauseForFailedEvaluation = async (input: IdleInput, current: Goal, reason: string, store: GoalStore): Promise<void> => {
    const paused: Goal = {...current, status: "paused", updatedAt: new Date().toISOString(), lastReason: reason, completionClaim: undefined};
    await store.set(paused);
    await input.log("error", "Goal paused because completion evaluation failed", {sessionId: paused.sessionID, reason});
    await showToast(input.client, "Goal paused: evaluator failed", "error");
};

const completeGoal = async (input: IdleInput, current: Goal, reason: string, store: GoalStore): Promise<void> => {
    const timestamp = new Date().toISOString();

    const completed: Goal = {...current, status: "completed", completedAt: timestamp, updatedAt: timestamp, lastReason: reason, completionClaim: undefined};
    await store.set(completed);
    await input.log("info", "Goal completed", {sessionId: completed.sessionID, turns: completed.turns ?? 0, tokensUsed: completed.tokensUsed ?? 0});
    await showToast(input.client, `Goal complete: ${reason}`, "success");
};

const applyTokenLimit = async (input: IdleInput, current: Goal, reason: string, messages: TranscriptMessage[], store: GoalStore): Promise<boolean> => {
    const tokensUsed = current.tokensUsed ?? 0;

    if (current.tokenBudget === undefined || tokensUsed < current.tokenBudget) {return false;}

    const limited: Goal = {
        ...current,
        status: "budget_limited",
        updatedAt: new Date().toISOString(),
        lastReason: `Token budget reached (${tokensUsed.toLocaleString()} / ${current.tokenBudget.toLocaleString()}). Last evaluation: ${reason}`,
        completionClaim: undefined,
    };
    await store.set(limited);
    await showToast(input.client, "Goal stopped at its token budget", "warning");
    await continueParent({client: input.client, goal: limited, messages, text: budgetLimitPrompt(limited), log: input.log});
    return true;
};

const applyTurnLimit = async (input: IdleInput, current: Goal, reason: string, messages: TranscriptMessage[], store: GoalStore): Promise<boolean> => {
    const turns = current.turns ?? 0;

    if (current.maxTurns === undefined || turns < current.maxTurns) {return false;}

    const limited: Goal = {
        ...current,
        status: "turn_limited",
        updatedAt: new Date().toISOString(),
        lastReason: `Turn budget reached (${String(turns)} / ${String(current.maxTurns)} turns). Last evaluation: ${reason}`,
        completionClaim: undefined,
    };
    await store.set(limited);
    await showToast(input.client, "Goal stopped at its turn budget", "warning");
    await continueParent({client: input.client, goal: limited, messages, text: budgetLimitPrompt(limited), log: input.log});
    return true;
};

const sleep = (ms: number) => ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();

const extendGoal = async (input: IdleInput, current: Goal, reason: string, messages: TranscriptMessage[], store: GoalStore): Promise<void> => {
    const continuing: Goal = {...current, updatedAt: new Date().toISOString(), lastReason: reason, completionClaim: undefined};
    await store.set(continuing);
    await sleep(input.options.continuationDelayMs);
    const latest = await store.get();

    if (!latest || latest.id !== continuing.id || latest.status !== "active") {return;}
    await continueParent({client: input.client, goal: latest, messages, text: continuationPrompt(latest), log: input.log});
};

const recordProgress = async (goal: Goal, messages: TranscriptMessage[], assistant: TranscriptMessage, store: GoalStore): Promise<Goal> => {
    const progress: Goal = {
        ...goal,
        turns: (goal.turns ?? 0) + 1,
        tokensUsed: totalGoalTokens(messages, goal.createdAt),
        updatedAt: new Date().toISOString(),
        lastEvaluatedMessageId: assistant.info.id,
    };
    await store.set(progress);
    return progress;
};

const dispatchDecision = async (
    input: IdleInput,
    current: Goal,
    decision: EvaluationDecision,
    messages: TranscriptMessage[],
    store: GoalStore,
): Promise<void> => {
    if (decision.error) {await pauseForFailedEvaluation(input, current, decision.reason, store); return;}
    if (decision.complete) {await completeGoal(input, current, decision.reason, store); return;}
    if (await applyTokenLimit(input, current, decision.reason, messages, store)) {return;}
    if (await applyTurnLimit(input, current, decision.reason, messages, store)) {return;}
    await extendGoal(input, current, decision.reason, messages, store);
};

const evaluateAndRespond = async (
    input: IdleInput,
    goal: Goal,
    messages: TranscriptMessage[],
    assistant: TranscriptMessage,
    store: GoalStore,
): Promise<void> => {
    const progress = await recordProgress(goal, messages, assistant, store);

    const decision = await evaluateGoal({
        client: input.client, parentSessionId: input.sessionId, goal: progress, messages, options: input.options,
    });

    const current = await store.get();

    if (!current || current.id !== progress.id || current.status !== "active") {return;}
    await dispatchDecision(input, current, decision, messages, store);
};

const readIdleMessages = async (input: IdleInput): Promise<TranscriptMessage[] | undefined> => {
    const response = await input.client.session.messages({path: {id: input.sessionId}});

    if (response.error) {
        await input.log("error", "Failed to read goal session messages", {sessionId: input.sessionId, error: JSON.stringify(response.error)});
        return undefined;
    }
    return Array.isArray(response.data) ? (response.data as TranscriptMessage[]) : [];
};

export const handleIdle = async (input: IdleInput, store: GoalStore): Promise<void> => {
    if (input.processing.has(input.sessionId)) {return;}
    input.processing.add(input.sessionId);
    try {
        const goal = await store.get();

        if (goal?.status !== "active") {return;}

        const messages = await readIdleMessages(input);

        if (!messages) {return;}

        const assistant = latestAssistant(messages, goal.createdAt);

        if (!assistant || assistant.info.id === goal.lastEvaluatedMessageId) {return;}
        await evaluateAndRespond(input, goal, messages, assistant, store);
    } finally {
        input.processing.delete(input.sessionId);
    }
};
