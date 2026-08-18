import {expect, test} from "bun:test";
import {parseBeanie, parseOptionsPayload, renderHelp, renderInitDirective, renderStatus, renderValidation} from "./commands";

test("parseBeanie defaults to status", () => {
    expect(parseBeanie("")).toEqual({action: "status", payload: ""});
    expect(parseBeanie("  ")).toEqual({action: "status", payload: ""});
});

test("parseBeanie recognizes subcommands", () => {
    expect(parseBeanie("help").action).toBe("help");
    expect(parseBeanie("--help").action).toBe("help");
    expect(parseBeanie("-h").action).toBe("help");
    expect(parseBeanie("status").action).toBe("status");
    expect(parseBeanie("validate").action).toBe("validate");
    expect(parseBeanie("apply").action).toBe("apply");
    expect(parseBeanie("init").action).toBe("init");
});

test("parseBeanie passes payload to subcommands", () => {
    expect(parseBeanie("validate {\"throttle\": {}}").payload).toBe(`{"throttle": {}}`);
    expect(parseBeanie("apply {\"goal\": {}}").payload).toBe(`{"goal": {}}`);
});

test("parseBeanie treats leading JSON as apply", () => {
    expect(parseBeanie(`{"throttle": {}}`).action).toBe("apply");
});

test("parseBeanie flags unknown subcommands", () => {
    expect(parseBeanie("frobnicate").action).toBe("unknown");
});

test("parseOptionsPayload accepts empty string", () => {
    expect(parseOptionsPayload("")).toEqual({ok: true, options: {}});
});

test("parseOptionsPayload accepts a JSON object", () => {
    const result = parseOptionsPayload(`{"throttle": {"maxParallel": 3}}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
        expect(result.options).toEqual({throttle: {maxParallel: 3}});
    }
});

test("parseOptionsPayload rejects invalid JSON", () => {
    const result = parseOptionsPayload("not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(result.error).toContain("Invalid JSON");
    }
});

test("parseOptionsPayload rejects non-object JSON", () => {
    expect(parseOptionsPayload("[1, 2]").ok).toBe(false);
    expect(parseOptionsPayload("42").ok).toBe(false);
    expect(parseOptionsPayload("null").ok).toBe(false);
});

test("renderHelp mentions the plugin name and subcommands", () => {
    const help = renderHelp();
    expect(help).toContain("@beremaran/opencode-beanie-plugin");
    expect(help).toContain("/beanie status");
    expect(help).toContain("/beanie apply");
    expect(help).toContain("/beanie init");
});

test("renderInitDirective mentions configure_plugin", () => {
    const directive = renderInitDirective();
    expect(directive).toContain("configure_plugin");
    expect(directive).toContain("No options are required");
});

test("renderValidation reports errors and warnings", () => {
    const result = renderValidation({
        errors: [{feature: "orchestrator", ok: false, message: "bad config"}],
        warnings: ["throttle.typo"],
    });
    expect(result).toContain("Errors:");
    expect(result).toContain("bad config");
    expect(result).toContain("! throttle.typo");
});

test("renderValidation reports no problems", () => {
    const result = renderValidation({errors: [], warnings: []});
    expect(result).toContain("No problems found.");
});

test("renderStatus shows target file and options", () => {
    const result = renderStatus({throttle: {maxParallel: 3}}, {errors: [], warnings: []}, "/tmp/worktree");
    expect(result).toContain("Target config file:");
    expect(result).toContain(`"maxParallel": 3`);
    expect(result).toContain("restarting");
});
