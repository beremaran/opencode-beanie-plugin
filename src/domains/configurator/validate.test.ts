import {expect, test} from "bun:test";
import {validateFullOptions} from "./validate";

test("validateFullOptions accepts empty options", () => {
    const result = validateFullOptions({});
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
});

test("validateFullOptions rejects non-object input", () => {
    const result = validateFullOptions("not an object");
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.feature).toBe("plugin");
});

test("validateFullOptions rejects null input", () => {
    const result = validateFullOptions(null);
    expect(result.errors.length).toBe(1);
});

test("validateFullOptions flags unknown top-level keys", () => {
    const result = validateFullOptions({typo: true});
    expect(result.warnings).toContain('Unknown top-level option "typo" (not a feature name).');
});

test("validateFullOptions validates orchestrator via parseOrchestratorConfig", () => {
    const result = validateFullOptions({orchestrator: {enabled: "not-a-boolean"}});
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.feature).toBe("orchestrator");
    expect(result.errors[0]?.ok).toBe(false);
});

test("validateFullOptions accepts valid orchestrator", () => {
    const result = validateFullOptions({
        orchestrator: {
            manager: {agent: "m", model: "p/m", fanOut: 1},
            build: {agent: "b", model: "p/m", maxParallel: 1},
        },
    });
    expect(result.errors).toEqual([]);
});

test("validateFullOptions validates throttle options", () => {
    const result = validateFullOptions({throttle: {maxParallel: "not-a-number"}});
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.feature).toBe("throttle");
});

test("validateFullOptions validates goal options", () => {
    const result = validateFullOptions({goal: {evaluatorModel: ""}});
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.feature).toBe("goal");
});

test("validateFullOptions validates providers options", () => {
    const result = validateFullOptions({providers: {providers: "not-an-array"}});
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.feature).toBe("providers");
});

test("validateFullOptions validates skillbox options", () => {
    const result = validateFullOptions({skillbox: {registry: "invalid"}});
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.feature).toBe("skillbox");
});

test("validateFullOptions validates toolbox options", () => {
    const result = validateFullOptions({toolbox: {config: "external.json"}});
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.feature).toBe("toolbox");
});

test("validateFullOptions validates directives options", () => {
    const result = validateFullOptions({directives: {defaults: "not-a-boolean"}});
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.feature).toBe("directives");
});

test("validateFullOptions accepts valid feature options", () => {
    const result = validateFullOptions({
        throttle: {maxParallel: 3, mode: "global"},
        goal: {evaluatorModel: "p/m"},
        skillbox: {registry: "github"},
        directives: {defaults: true},
    });
    expect(result.errors).toEqual([]);
});

test("validateFullOptions flags unknown keys per feature", () => {
    const result = validateFullOptions({throttle: {typo: true}});
    expect(result.warnings).toContain("throttle.typo");
});
