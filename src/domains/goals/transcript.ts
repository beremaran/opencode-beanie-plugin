import type {ModelRef, TranscriptMessage, TranscriptPart} from "./types";

const TOOL_DETAIL_LIMIT = 4000;

const partToolText = (part: TranscriptPart): string => {
    const status = part.state?.status ?? "unknown";

    const detail = part.state?.output?.trim() || part.state?.error?.trim() || part.state?.title?.trim() || "";

    const truncated = detail.length > TOOL_DETAIL_LIMIT ? `${detail.slice(0, TOOL_DETAIL_LIMIT)}…` : detail;

    return truncated ? `[tool ${part.tool ?? "unknown"} ${status}]\n${truncated}` : `[tool ${part.tool ?? "unknown"} ${status}]`;
};

const partText = (part: TranscriptPart): string | undefined => {
    if (part.type === "text" && part.text?.trim()) {return part.text.trim();}
    if (part.type === "tool" && part.tool) {return partToolText(part);}
    if (part.type === "patch" && part.files && part.files.length > 0) {return `[patch]\n${part.files.join("\n")}`;}
    return undefined;
};

const parseStartedAt = (startedAt: string | number): number =>
    typeof startedAt === "number" ? startedAt : Date.parse(startedAt);

export const goalMessages = (messages: TranscriptMessage[], startedAt: string | number): TranscriptMessage[] => {
    const start = parseStartedAt(startedAt);

    return messages
        .filter((message) => message.info.time.created >= start)
        .sort((a, b) => a.info.time.created - b.info.time.created);
};

export const buildTranscript = (messages: TranscriptMessage[], startedAt: string | number, maxCharacters: number): string => {
    const rendered = goalMessages(messages, startedAt)
        .flatMap((message) => {
            const parts = message.parts.map(partText).filter((v): v is string => Boolean(v));

            return parts.length === 0 ? [] : [`[${message.info.role}]\n${parts.join("\n")}`];
        })
        .join("\n\n");

    if (rendered.length <= maxCharacters) {return rendered;}

    const marker = "[Earlier goal transcript omitted]\n\n";

    return marker + rendered.slice(-(maxCharacters - marker.length));
};

export const latestAssistant = (messages: TranscriptMessage[], startedAt: string | number): TranscriptMessage | undefined =>
    goalMessages(messages, startedAt).filter((message) => message.info.role === "assistant").at(-1);

export const latestUserExecution = (messages: TranscriptMessage[]): {agent?: string; model?: ModelRef} => {
    const latest = [...messages]
        .sort((a, b) => a.info.time.created - b.info.time.created)
        .filter((message) => message.info.role === "user")
        .at(-1);

    const result: {agent?: string; model?: ModelRef} = {};

    if (latest?.info.agent) {result.agent = latest.info.agent;}
    if (latest?.info.model) {result.model = latest.info.model;}
    return result;
};

export const totalGoalTokens = (messages: TranscriptMessage[], startedAt: string | number): number =>
    goalMessages(messages, startedAt)
        .filter((message) => message.info.role === "assistant")
        .reduce((total, message) => {
            const tokens = message.info.tokens;

            return tokens ? total + tokens.input + tokens.output + tokens.reasoning : total;
        }, 0);
