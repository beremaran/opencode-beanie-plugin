import type {PluginInput} from "@opencode-ai/plugin";
import type {Goal} from "./model";
import {latestUserExecution} from "./transcript";
import type {Logger, TranscriptMessage} from "./types";

const TOAST_DURATION_MS = 6000;

export const showToast = async (
    client: PluginInput["client"],
    message: string,
    variant: "info" | "success" | "warning" | "error",
): Promise<void> => {
    const tui = (client as unknown as {tui?: {showToast?: (opts: unknown) => Promise<unknown>}}).tui;

    if (typeof tui?.showToast === "function") {
        await tui.showToast({body: {title: "Goal", message, variant, duration: TOAST_DURATION_MS}}).catch(() => undefined);
    }
};

const isParentBusy = (statuses: unknown, sessionId: string): boolean => {
    if (typeof statuses !== "object" || statuses === null) {return false;}

    const status = (statuses as Record<string, {type?: string}>)[sessionId];

    return Boolean(status && status.type !== "idle");
};

const buildContinuationBody = (execution: ReturnType<typeof latestUserExecution>, text: string) => {
    const body: {
        parts: Array<{type: "text"; text: string}>;
        agent?: string;
        model?: {providerID: string; modelID: string};
    } = {parts: [{type: "text", text}]};

    if (execution.agent) {body.agent = execution.agent;}
    if (execution.model) {body.model = {providerID: execution.model.providerId, modelID: execution.model.modelId};}
    return body;
};

const checkParentBusy = async (client: PluginInput["client"], sessionId: string, log: Logger): Promise<boolean> => {
    try {
        const statuses = await client.session.status();

        if (isParentBusy(statuses.data, sessionId)) {
            await log("debug", "Skipped continuation because the parent session is busy", {sessionId});
            return true;
        }
    } catch {
        // session status is best-effort
    }
    return false;
};

export const continueParent = async (input: {
    client: PluginInput["client"];
    goal: Goal;
    messages: TranscriptMessage[];
    text: string;
    log: Logger;
}): Promise<void> => {
    if (await checkParentBusy(input.client, input.goal.sessionID, input.log)) {return;}

    const execution = latestUserExecution(input.messages);

    const body = buildContinuationBody(execution, input.text);

    const response = await input.client.session.promptAsync({path: {id: input.goal.sessionID}, body});

    if (response.error) {
        await input.log("error", "OpenCode rejected an automatic goal continuation", {sessionId: input.goal.sessionID, error: JSON.stringify(response.error)});
    }
};
