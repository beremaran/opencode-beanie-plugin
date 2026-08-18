import {parseOptionsPayload} from "./commands";

export interface BeanieState {
    options: Record<string, unknown>;
    hasEntry: boolean;
}

export function errorText(error: unknown): string {
    if (error instanceof Error) {return error.message;}
    return String(error);
}

export function resolveApplyPayload(
    payload: string | undefined,
    state: BeanieState,
): {ok: true; options: Record<string, unknown>} | {ok: false; error: string} {
    if (payload === undefined || payload.trim() === "") {
        return {ok: true, options: state.options};
    }
    return parseOptionsPayload(payload);
}
