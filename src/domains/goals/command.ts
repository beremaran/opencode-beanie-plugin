import {createGoal} from "./lifecycle";
import type {Goal} from "./model";
import {parseGoalCommand} from "./options";
import {actionPrompt, continuationPrompt, helpPrompt, startingPrompt, statusPrompt} from "./prompts";
import type {GoalStore} from "./store";
import type {CommandInput, GoalCommand} from "./types";

export const replaceTextPart = (parts: Array<{type: string; text?: string}>, text: string): void => {
    const part = parts.find((candidate) => candidate.type === "text");

    if (!part) {
        throw new Error("The /goal command template did not produce a text part");
    }
    part.text = text;
};

const answerCommand = (input: CommandInput, text: string): void => {
    input.controlTurns.add(input.command.sessionID);
    replaceTextPart(input.output.parts, text);
};

const handlePause = async (input: CommandInput, store: GoalStore): Promise<void> => {
    input.controlTurns.add(input.command.sessionID);
    const current = await store.get();

    if (current?.status !== "active") {
        replaceTextPart(input.output.parts, actionPrompt("There is no active goal to pause."));
        return;
    }
    await store.set({...current, status: "paused", updatedAt: new Date().toISOString(), lastReason: "Paused by the user."});
    replaceTextPart(input.output.parts, actionPrompt("The session goal is paused."));
};

const handleResume = async (input: CommandInput, store: GoalStore): Promise<void> => {
    const current = await store.get();

    if (!current) {
        replaceTextPart(input.output.parts, actionPrompt("There is no goal to resume."));
        return;
    }
    if (current.status === "completed") {
        input.controlTurns.add(input.command.sessionID);
        replaceTextPart(input.output.parts, actionPrompt("The previous goal is complete. Set a new goal to do more work."));
        return;
    }

    const resumed = {...current, status: "active" as const, updatedAt: new Date().toISOString(), lastReason: "Resumed by the user."};
    await store.set(resumed);
    replaceTextPart(input.output.parts, continuationPrompt(resumed));
};

const handleSet = async (input: CommandInput, parsed: Extract<GoalCommand, {action: "set"}>, store: GoalStore): Promise<void> => {
    const tokenBudget = parsed.tokenBudget ?? input.options.defaultTokenBudget;

    const maxTurns = parsed.maxTurns ?? input.options.defaultMaxTurns;

    const goal = createGoal(input.command.sessionID, parsed.objective, [], [], tokenBudget, maxTurns);
    await store.set(goal);
    replaceTextPart(input.output.parts, startingPrompt(goal));
};

const handleInfoActions = (input: CommandInput, parsed: GoalCommand, currentGoal: Goal | undefined): boolean => {
    if (parsed.action === "status") {
        answerCommand(input, statusPrompt(currentGoal));
        return true;
    }
    if (parsed.action === "help") {
        answerCommand(input, helpPrompt());
        return true;
    }
    if (parsed.action === "invalid") {
        answerCommand(input, actionPrompt(parsed.message));
        return true;
    }
    return false;
};

const handleSimpleActions = async (input: CommandInput, parsed: GoalCommand, store: GoalStore): Promise<boolean> => {
    if (handleInfoActions(input, parsed, await store.get())) {return true;}
    if (parsed.action === "clear") {
        input.controlTurns.add(input.command.sessionID);
        await store.clear();
        answerCommand(input, actionPrompt("The session goal was cleared."));
        return true;
    }
    return false;
};

export const runGoalCommand = async (input: CommandInput, store: GoalStore): Promise<void> => {
    const parsed = parseGoalCommand(input.command.arguments, input.options);

    if (await handleSimpleActions(input, parsed, store)) {return;}
    if (parsed.action === "pause") {await handlePause(input, store); return;}
    if (parsed.action === "resume") {await handleResume(input, store); return;}
    if (parsed.action === "set") {await handleSet(input, parsed, store);}
};
