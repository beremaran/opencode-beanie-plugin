import {parseBeanie, renderApply, renderHelp, renderInitDirective, renderStatus, renderValidation} from "./commands";
import {applyOptionsToFile} from "./opencode-file";
import {validateFullOptions, type ValidationResult} from "./validate";
import {errorText, resolveApplyPayload, type BeanieState} from "./shared";

type OutputParts = Array<{type: string; text?: string}>;

function replaceTextPart(parts: OutputParts, text: string): void {
    const part = parts.find((candidate) => candidate.type === "text");

    if (part) {part.text = text;} else {parts.push({type: "text", text});}
}

function writeBeanieConfig(
    parts: OutputParts,
    state: BeanieState,
    worktree: string,
    candidate: Record<string, unknown>,
    validation: ValidationResult,
): void {
    try {
        const result = applyOptionsToFile(worktree, "auto", candidate);

        state.options = candidate;
        state.hasEntry = true;
        replaceTextPart(parts, renderApply(candidate, result, validation));
    } catch (error) {
        replaceTextPart(parts, `Failed to write configuration: ${errorText(error)}`);
    }
}

function handleBeanieApply(payload: string, parts: OutputParts, state: BeanieState, worktree: string): void {
    const decoded = resolveApplyPayload(payload, state);

    if (!decoded.ok) {
        replaceTextPart(parts, decoded.error);
        return;
    }

    const candidate = decoded.options;

    const validation = validateFullOptions(candidate);

    if (validation.errors.length > 0) {
        replaceTextPart(parts, `Refusing to write invalid configuration.\n\n${renderValidation(validation)}`);
        return;
    }
    writeBeanieConfig(parts, state, worktree, candidate, validation);
}

function handleBeanieValidate(payload: string, parts: OutputParts, state: BeanieState): void {
    const decoded = resolveApplyPayload(payload, state);

    if (!decoded.ok) {
        replaceTextPart(parts, decoded.error);
        return;
    }
    replaceTextPart(parts, renderValidation(validateFullOptions(decoded.options)));
}

function handleStaticSubcommand(action: string, parts: OutputParts, state: BeanieState, worktree: string): boolean {
    if (action === "help") {
        replaceTextPart(parts, renderHelp());
        return true;
    }
    if (action === "init") {
        replaceTextPart(parts, renderInitDirective());
        return true;
    }
    if (action === "status") {
        replaceTextPart(parts, renderStatus(state.options, validateFullOptions(state.options), worktree));
        return true;
    }
    return false;
}

function handleBeanieCommand(rawArguments: string, output: {parts: OutputParts}, state: BeanieState, worktree: string): void {
    const parsed = parseBeanie(rawArguments);

    if (handleStaticSubcommand(parsed.action, output.parts, state, worktree)) {
        return;
    }
    if (parsed.action === "validate") {
        handleBeanieValidate(parsed.payload, output.parts, state);
        return;
    }
    if (parsed.action === "apply") {
        handleBeanieApply(parsed.payload, output.parts, state, worktree);
        return;
    }
    replaceTextPart(output.parts, `Unknown /beanie subcommand.\n\n${renderHelp()}`);
}

export {handleBeanieCommand};
