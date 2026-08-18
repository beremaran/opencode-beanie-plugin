import {expect, test} from "bun:test";
import {errorText, resolveApplyPayload} from "./shared";

test("resolveApplyPayload uses current options for undefined payload", () => {
    const result = resolveApplyPayload(undefined, {options: {throttle: {maxParallel: 3}}, hasEntry: true});
    expect(result).toEqual({ok: true, options: {throttle: {maxParallel: 3}}});
});

test("resolveApplyPayload uses current options for empty payload", () => {
    const result = resolveApplyPayload("   ", {options: {goal: {}}, hasEntry: true});
    expect(result).toEqual({ok: true, options: {goal: {}}});
});

test("resolveApplyPayload parses a non-empty payload", () => {
    const result = resolveApplyPayload(`{"throttle": {"maxParallel": 5}}`, {options: {}, hasEntry: false});
    expect(result).toEqual({ok: true, options: {throttle: {maxParallel: 5}}});
});

test("resolveApplyPayload reports invalid JSON", () => {
    const result = resolveApplyPayload("not json", {options: {}, hasEntry: false});
    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(result.error).toContain("Invalid JSON");
    }
});

test("errorText returns Error messages", () => {
    expect(errorText(new Error("boom"))).toBe("boom");
    expect(errorText("plain")).toBe("plain");
});
