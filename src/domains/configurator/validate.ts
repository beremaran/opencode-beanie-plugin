import {PLUGIN_OPTIONS_SCHEMA} from "./schema";
import {CHECKS, checkOrchestrator, failure, isRecord} from "./checks";
import type {FeatureReport, ValidationResult} from "./checks";

const featureSchema = (name: string): {properties?: Record<string, unknown>} | undefined =>
    (PLUGIN_OPTIONS_SCHEMA as {properties?: Record<string, {properties?: Record<string, unknown>}>}).properties?.[name];

const unknownKeys = (value: unknown, known: Set<string>, prefix: string): string[] => {
    if (!isRecord(value)) {return [];}
    return Object.keys(value).filter((key) => !known.has(key)).map((key) => `${prefix}.${key}`);
};

const collectWarnings = (options: Record<string, unknown>): string[] => {
    const topKeys = new Set(Object.keys(PLUGIN_OPTIONS_SCHEMA.properties));

    const warnings: string[] = [];

    for (const key of Object.keys(options)) {
        if (!topKeys.has(key)) {
            warnings.push(`Unknown top-level option "${key}" (not a feature name).`);
        }
    }
    return warnings;
};

const runChecks = (options: Record<string, unknown>, errors: FeatureReport[], warnings: string[]): void => {
    for (const [name, check] of CHECKS) {
        const report = check(options[name]);

        if (!report.ok) {errors.push(report);}

        const known = featureSchema(name)?.properties;

        if (known) {warnings.push(...unknownKeys(options[name], new Set(Object.keys(known)), name));}
    }
};

export function validateFullOptions(fullOptions: unknown): ValidationResult {
    if (fullOptions === undefined || fullOptions === null) {
        return {errors: [checkOrchestrator(undefined)], warnings: []};
    }
    if (!isRecord(fullOptions)) {
        return {errors: [failure("plugin", "The plugin options must be an object.")], warnings: []};
    }

    const errors: FeatureReport[] = [];

    const warnings = collectWarnings(fullOptions);
    runChecks(fullOptions, errors, warnings);
    return {errors, warnings};
}

export type {FeatureReport, ValidationResult};
