import {expect, test} from "bun:test";
import {evaluateGoal, parseEvaluation, parseModelRef} from "./evaluator";
import {createGoal} from "./lifecycle";
import {mockClient} from "./test-helpers";
import type {TranscriptMessage} from "./types";

test("parses model references correctly", () => {
    expect(parseModelRef("anthropic/claude-sonnet-4-6")).toEqual({providerId: "anthropic", modelId: "claude-sonnet-4-6"});
    expect(parseModelRef("custom/openai/deepseek-r1")).toEqual({providerId: "custom", modelId: "openai/deepseek-r1"});
    expect(parseModelRef("invalid")).toBeUndefined();
    expect(parseModelRef("")).toBeUndefined();
    expect(parseModelRef(undefined)).toBeUndefined();
});

test("parses evaluation JSON in fenced code blocks and raw objects", () => {
    expect(parseEvaluation('{"complete": true, "reason": "Verification succeeded"}')).toEqual({
        complete: true, reason: "Verification succeeded",
    });
    expect(parseEvaluation('```json\n{"complete": false, "reason": "Tests not run"}\n```')).toEqual({
        complete: false, reason: "Tests not run",
    });
    expect(parseEvaluation('Some text before {"complete": true, "reason": "Ready"} and after')).toEqual({
        complete: true, reason: "Ready",
    });
    expect(parseEvaluation('{"complete": "not-a-bool"}')).toBeUndefined();
    expect(parseEvaluation('Not valid json')).toBeUndefined();
});

test("evaluates goals using isolated session and handles responses", async () => {
    const mock = mockClient();
    const goal = createGoal("session-1", "Pass all tests", ["No regressions"], ["Coverage 80%"]);
    const messages: TranscriptMessage[] = [
        {info: {id: "1", role: "user", time: {created: Date.now()}}, parts: [{type: "text", text: "Run tests"}]},
    ];

    const decision = await evaluateGoal({
        client: mock.client,
        parentSessionId: "session-1",
        goal,
        messages,
        options: {
            maxTranscriptChars: 48_000,
            continuationDelayMs: 0,
            deleteEvaluatorSessions: true,
            evaluatorModel: "anthropic/claude-sonnet-4-6",
            evaluatorAgent: "tester",
        },
    });

    expect(decision).toEqual({complete: false, reason: "Still working"});
    expect(mock.createdSessions).toHaveLength(1);
    expect(mock.createdSessions[0]?.parentID).toBe("session-1");
    expect(mock.deletedSessions).toContain("eval-session-1");
    expect(mock.prompted).toHaveLength(1);
    const body = mock.prompted[0]?.body as {agent?: string; model?: {providerID: string; modelID: string}} | undefined;
    expect(body?.agent).toBe("tester");
    expect(body?.model).toEqual({providerID: "anthropic", modelID: "claude-sonnet-4-6"});
});
