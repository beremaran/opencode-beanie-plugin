import {expect, test} from "bun:test";
import {buildTranscript, goalMessages, latestAssistant, latestUserExecution, totalGoalTokens} from "./transcript";
import type {TranscriptMessage} from "./types";

const makeMessage = (role: "user" | "assistant", created: number, parts: TranscriptMessage["parts"], extra: Partial<TranscriptMessage["info"]> = {}): TranscriptMessage => ({
    info: {id: `msg-${String(created)}`, role, time: {created}, ...extra},
    parts,
});

test("filters goal messages chronologically and calculates totals", () => {
    const messages: TranscriptMessage[] = [
        makeMessage("user", 1000, [{type: "text", text: "Before goal"}], {agent: "user-agent", model: {providerId: "openai", modelId: "gpt-4o"}}),
        makeMessage("assistant", 2000, [{type: "text", text: "Working on it"}], {tokens: {input: 100, output: 50, reasoning: 10}}),
        makeMessage("assistant", 3000, [{type: "tool", tool: "run_command", state: {status: "done", output: "All tests pass"}}], {tokens: {input: 200, output: 80, reasoning: 0}}),
    ];

    expect(goalMessages(messages, 1500)).toHaveLength(2);
    expect(goalMessages(messages, new Date(1500).toISOString())).toHaveLength(2);
    expect(totalGoalTokens(messages, 1500)).toBe(100 + 50 + 10 + 200 + 80);
    expect(latestAssistant(messages, 1500)?.info.id).toBe("msg-3000");
    expect(latestUserExecution(messages)).toEqual({agent: "user-agent", model: {providerId: "openai", modelId: "gpt-4o"}});
});

test("builds bounded transcript with tool detail and truncation", () => {
    const longOutput = "x".repeat(5000);
    const messages: TranscriptMessage[] = [
        makeMessage("user", 2000, [{type: "text", text: "Implement feature"}]),
        makeMessage("assistant", 3000, [
            {type: "text", text: "Running tool"},
            {type: "tool", tool: "test_runner", state: {status: "error", error: longOutput}},
            {type: "patch", files: ["src/index.ts", "src/types.ts"]},
        ]),
    ];

    const transcript = buildTranscript(messages, 1000, 100_000);
    expect(transcript).toContain("[user]\nImplement feature");
    expect(transcript).toContain("[assistant]\nRunning tool\n[tool test_runner error]\n");
    expect(transcript).toContain("[patch]\nsrc/index.ts\nsrc/types.ts");
    expect(transcript).toContain("…");

    const capped = buildTranscript(messages, 1000, 80);
    expect(capped).toContain("[Earlier goal transcript omitted]\n\n");
    expect(capped.length).toBeLessThanOrEqual(80);
});
