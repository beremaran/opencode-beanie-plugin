import {expect, test} from "bun:test";
import {parseGoalCommand, parseTokenCount, resolveOptions} from "./options";

test("resolves default options and bounds minimum transcript chars", () => {
    const resolved = resolveOptions({});
    expect(resolved.maxTranscriptChars).toBe(48_000);
    expect(resolved.continuationDelayMs).toBe(0);
    expect(resolved.deleteEvaluatorSessions).toBe(true);
    expect(resolved.evaluatorModel).toBeUndefined();
    expect(resolved.evaluatorAgent).toBeUndefined();
    expect(resolved.stateDirectory).toBeUndefined();
    expect(resolved.defaultTokenBudget).toBeUndefined();
    expect(resolved.defaultMaxTurns).toBeUndefined();

    const bounded = resolveOptions({goal: {maxTranscriptChars: 500, continuationDelayMs: 1000, deleteEvaluatorSessions: false,
        evaluatorModel: "anthropic/claude-sonnet-4-6", evaluatorAgent: "evaluator", stateDirectory: "/custom/state",
        defaultTokenBudget: 50_000, defaultMaxTurns: 10}});
    expect(bounded.maxTranscriptChars).toBe(1024);
    expect(bounded.continuationDelayMs).toBe(1000);
    expect(bounded.deleteEvaluatorSessions).toBe(false);
    expect(bounded.evaluatorModel).toBe("anthropic/claude-sonnet-4-6");
    expect(bounded.evaluatorAgent).toBe("evaluator");
    expect(bounded.stateDirectory).toBe("/custom/state");
    expect(bounded.defaultTokenBudget).toBe(50_000);
    expect(bounded.defaultMaxTurns).toBe(10);
});

test("parses token counts with k and m suffixes", () => {
    expect(parseTokenCount("100")).toBe(100);
    expect(parseTokenCount("100k")).toBe(100_000);
    expect(parseTokenCount("2.5K")).toBe(2500);
    expect(parseTokenCount("1M")).toBe(1_000_000);
    expect(parseTokenCount("0")).toBeUndefined();
    expect(parseTokenCount("-50")).toBeUndefined();
    expect(parseTokenCount("invalid")).toBeUndefined();
});

test("parses slash goal commands and flags", () => {
    const defaults = {defaultTokenBudget: 10_000, defaultMaxTurns: 5};
    expect(parseGoalCommand("", defaults)).toEqual({action: "status"});
    expect(parseGoalCommand("   ", defaults)).toEqual({action: "status"});
    expect(parseGoalCommand("help", defaults)).toEqual({action: "help"});
    expect(parseGoalCommand("--help", defaults)).toEqual({action: "help"});
    expect(parseGoalCommand("clear", defaults)).toEqual({action: "clear"});
    expect(parseGoalCommand("cancel", defaults)).toEqual({action: "clear"});
    expect(parseGoalCommand("pause", defaults)).toEqual({action: "pause"});
    expect(parseGoalCommand("resume", defaults)).toEqual({action: "resume"});

    expect(parseGoalCommand("Build feature", defaults)).toEqual({
        action: "set", objective: "Build feature", tokenBudget: 10_000, maxTurns: 5,
    });
    expect(parseGoalCommand("--tokens 50k Build feature", defaults)).toEqual({
        action: "set", objective: "Build feature", tokenBudget: 50_000, maxTurns: 5,
    });
    expect(parseGoalCommand("--tokens=25k --max-turns 12 Build feature", defaults)).toEqual({
        action: "set", objective: "Build feature", tokenBudget: 25_000, maxTurns: 12,
    });
    expect(parseGoalCommand("--tokens abc Build feature", defaults)).toEqual({
        action: "invalid", message: "`--tokens` must be a positive integer, optionally ending in k or m.",
    });
    expect(parseGoalCommand("--max-turns -3 Build feature", defaults)).toEqual({
        action: "invalid", message: "`--max-turns` must be a positive integer.",
    });
    expect(parseGoalCommand("--unknown Build feature", defaults)).toEqual({
        action: "invalid", message: "Unknown goal option: --unknown",
    });
    expect(parseGoalCommand("--tokens 50k", defaults)).toEqual({
        action: "invalid", message: "A goal needs a concrete completion condition.",
    });
});
