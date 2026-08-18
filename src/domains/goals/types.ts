import type {PluginInput} from "@opencode-ai/plugin";

export type GoalPluginOptions = {
    evaluatorModel?: string;
    evaluatorAgent?: string;
    stateDirectory?: string;
    maxTranscriptChars?: number;
    defaultTokenBudget?: number;
    defaultMaxTurns?: number;
    continuationDelayMs?: number;
    deleteEvaluatorSessions?: boolean;
};

export type ResolvedGoalPluginOptions = {
    evaluatorModel?: string;
    evaluatorAgent?: string;
    stateDirectory?: string;
    maxTranscriptChars: number;
    defaultTokenBudget?: number;
    defaultMaxTurns?: number;
    continuationDelayMs: number;
    deleteEvaluatorSessions: boolean;
};

export type GoalCommand =
    | {action: "status"}
    | {action: "help"}
    | {action: "clear"}
    | {action: "pause"}
    | {action: "resume"}
    | {action: "set"; objective: string; tokenBudget?: number; maxTurns?: number}
    | {action: "invalid"; message: string};

export type ModelRef = {
    providerId: string;
    modelId: string;
};

export type TranscriptPart = {
    type: string;
    text?: string;
    tool?: string;
    state?: {status?: string; title?: string; output?: string; error?: string};
    files?: string[];
};

export type TranscriptMessage = {
    info: {
        id: string;
        role: "user" | "assistant";
        time: {created: number};
        agent?: string;
        model?: ModelRef;
        tokens?: {input: number; output: number; reasoning: number; cache?: {read: number; write: number}};
    };
    parts: TranscriptPart[];
};

export type EvaluationDecision = {
    complete: boolean;
    reason: string;
    error?: boolean;
};

export type Logger = (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    extra?: Record<string, unknown>,
) => Promise<void>;

export type IdleInput = {
    client: PluginInput["client"];
    sessionId: string;
    options: ResolvedGoalPluginOptions;
    processing: Set<string>;
    log: Logger;
};

export type CommandInput = {
    command: {command: string; sessionID: string; arguments: string};
    output: {parts: Array<{type: string; text?: string}>};
    options: ResolvedGoalPluginOptions;
    controlTurns: Set<string>;
};
