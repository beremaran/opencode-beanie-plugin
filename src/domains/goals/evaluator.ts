import type {PluginInput} from "@opencode-ai/plugin";
import type {Goal} from "./model";
import {EVALUATOR_SYSTEM_PROMPT, evaluatorPrompt} from "./prompts";
import {buildTranscript, latestUserExecution} from "./transcript";
import type {EvaluationDecision, ModelRef, ResolvedGoalPluginOptions, TranscriptMessage} from "./types";

type OpenCodeClient = PluginInput["client"];

const FENCED_EVAL_RE = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;

const BRACE_OBJECT_RE = /\{[\s\S]*\}/;

const isTextPart = (part: unknown): part is {type: "text"; text: string} =>
    typeof part === "object" && part !== null && (part as {type?: unknown}).type === "text" &&
    typeof (part as {text?: unknown}).text === "string";

const responseText = (parts: unknown): string =>
    Array.isArray(parts) ? parts.filter(isTextPart).map((part) => part.text).join("\n") : "";

export const parseModelRef = (value?: string): ModelRef | undefined => {
    if (!value) {return undefined;}

    const [providerId, ...modelParts] = value.split("/");

    const modelId = modelParts.join("/");

    return providerId && modelId ? {providerId, modelId} : undefined;
};

const resolveSmallModel = async (client: OpenCodeClient): Promise<ModelRef | undefined> => {
    try {
        const config = await client.config.get();

        return parseModelRef(config.data?.small_model);
    } catch {
        return undefined;
    }
};

const evaluatorModel = async (
    client: OpenCodeClient,
    messages: TranscriptMessage[],
    configured?: string,
): Promise<ModelRef | undefined> => {
    const explicit = parseModelRef(configured);

    if (explicit) {return explicit;}

    const small = await resolveSmallModel(client);

    if (small) {return small;}
    return latestUserExecution(messages).model;
};

export const parseEvaluation = (text: string): EvaluationDecision | undefined => {
    const trimmed = text.trim();

    const fenced = trimmed.match(FENCED_EVAL_RE)?.[1];

    const candidate = fenced ?? trimmed.match(BRACE_OBJECT_RE)?.[0];

    if (!candidate) {return undefined;}
    try {
        const value = JSON.parse(candidate) as Record<string, unknown>;

        if (typeof value.complete === "boolean" && typeof value.reason === "string" && value.reason.trim()) {
            return {complete: value.complete, reason: value.reason.trim()};
        }
        return undefined;
    } catch {
        return undefined;
    }
};

export type EvaluateGoalInput = {
    client: OpenCodeClient;
    parentSessionId: string;
    goal: Goal;
    messages: TranscriptMessage[];
    options: ResolvedGoalPluginOptions;
};

const buildPromptBody = (promptText: string, model?: ModelRef, agent?: string) => {
    const body: {
        system: string;
        tools: Record<string, boolean>;
        parts: Array<{type: "text"; text: string}>;
        model?: {providerID: string; modelID: string};
        agent?: string;
    } = {
        system: EVALUATOR_SYSTEM_PROMPT,
        tools: {"*": false},
        parts: [{type: "text", text: promptText}],
    };

    if (model) {body.model = {providerID: model.providerId, modelID: model.modelId};}
    if (agent) {body.agent = agent;}
    return body;
};

const runPrompt = async (client: OpenCodeClient, sessionId: string, body: ReturnType<typeof buildPromptBody>): Promise<EvaluationDecision> => {
    const response = await client.session.prompt({path: {id: sessionId}, body});

    if (response.error) {
        return {complete: false, reason: "Completion evaluation failed because the evaluator model returned an error.", error: true};
    }
    return parseEvaluation(responseText(response.data.parts)) ?? {
        complete: false, reason: "The evaluator returned no valid decision; continue and surface explicit completion evidence.", error: true,
    };
};

const createEvaluatorSession = async (client: OpenCodeClient, parentSessionId: string, outcome: string) => {
    const created = await client.session.create({
        body: {parentID: parentSessionId, title: `[goal evaluator] ${outcome.slice(0, 60)}`},
    });

    return created.data?.id;
};

export const evaluateGoal = async (input: EvaluateGoalInput): Promise<EvaluationDecision> => {
    const transcript = buildTranscript(input.messages, input.goal.createdAt, input.options.maxTranscriptChars);

    const model = await evaluatorModel(input.client, input.messages, input.options.evaluatorModel);

    const sessionId = await createEvaluatorSession(input.client, input.parentSessionId, input.goal.outcome);

    if (!sessionId) {
        return {complete: false, reason: "Completion evaluation could not start; continue and surface clearer verification evidence.", error: true};
    }
    try {
        const body = buildPromptBody(evaluatorPrompt(input.goal, transcript), model, input.options.evaluatorAgent);

        return await runPrompt(input.client, sessionId, body);
    } catch {
        return {complete: false, reason: "Completion evaluation failed; continue and surface explicit verification evidence.", error: true};
    } finally {
        if (input.options.deleteEvaluatorSessions) {
            await input.client.session.delete({path: {id: sessionId}}).catch(() => undefined);
        }
    }
};
