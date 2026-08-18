import {expect, test} from "bun:test";
import {findPluginArrayOpen, findPluginEntrySpan, findPluginNameSpan, isPluginEntryName, upsertPluginEntry} from "./opencode-upsert";

test("isPluginEntryName matches the plugin name, segment, and paths", () => {
    expect(isPluginEntryName("@beremaran/opencode-beanie-plugin")).toBe(true);
    expect(isPluginEntryName("opencode-beanie-plugin")).toBe(true);
    expect(isPluginEntryName("node_modules/@beremaran/opencode-beanie-plugin")).toBe(true);
    expect(isPluginEntryName("opencode-beanie-plugin-extra")).toBe(false);
    expect(isPluginEntryName(42)).toBe(false);
    expect(isPluginEntryName(undefined)).toBe(false);
});

test("findPluginNameSpan locates the quoted plugin name", () => {
    const text = `  "plugin": ["@beremaran/opencode-beanie-plugin"]`;
    const span = findPluginNameSpan(text);
    expect(span).toEqual([13, 48]);
    if (span) {
        expect(text.slice(span[0], span[1])).toBe('"@beremaran/opencode-beanie-plugin"');
    }
});

test("findPluginNameSpan returns null when absent", () => {
    expect(findPluginNameSpan(`  "plugin": ["other/plugin"]`)).toBeNull();
    expect(findPluginNameSpan("")).toBeNull();
});

test("findPluginEntrySpan covers the name and options tuple", () => {
    const text = `  "plugin": ["@beremaran/opencode-beanie-plugin", {"throttle": {"maxParallel": 3}}]`;
    const span = findPluginEntrySpan(text);
    expect(span).toEqual([12, 83]);
    if (span) {
        expect(text.slice(span[0], span[1])).toBe(`["@beremaran/opencode-beanie-plugin", {"throttle": {"maxParallel": 3}}]`);
    }
});

test("findPluginEntrySpan returns just the name when no options", () => {
    const text = `  "plugin": ["@beremaran/opencode-beanie-plugin"]`;
    const span = findPluginEntrySpan(text);
    expect(span).toEqual([13, 48]);
});

test("findPluginArrayOpen locates the plugin array bracket", () => {
    const text = `  "plugin": ["@beremaran/opencode-beanie-plugin"]`;
    expect(findPluginArrayOpen(text)).toBe(12);
    expect(findPluginArrayOpen(`  "plugin": {}`)).toBeNull();
});

test("upsertPluginEntry inserts into an existing plugin array", () => {
    const text = `  "plugin": ["@beremaran/opencode-beanie-plugin"]`;
    const result = upsertPluginEntry(text, {throttle: {maxParallel: 3}});
    expect(result).toContain(`["@beremaran/opencode-beanie-plugin",{"throttle":{"maxParallel":3}}]`);
});

test("upsertPluginEntry replaces an existing plugin entry", () => {
    const text = `  "plugin": ["@beremaran/opencode-beanie-plugin", {"throttle": {"maxParallel": 1}}]`;
    const result = upsertPluginEntry(text, {throttle: {maxParallel: 5}});
    expect(result).toContain(`{"throttle":{"maxParallel":5}}`);
    expect(result).not.toContain(`{"throttle":{"maxParallel":1}}`);
});

test("upsertPluginEntry adds a plugin array when none exists", () => {
    const text = `{"mcp": {}}`;
    const result = upsertPluginEntry(text, {goal: {}});
    expect(result).toContain(`"plugin": [["@beremaran/opencode-beanie-plugin",{"goal":{}}]]`);
});

test("upsertPluginEntry preserves existing plugin entries", () => {
    const text = `  "plugin": ["other/plugin", "@beremaran/opencode-beanie-plugin"]`;
    const result = upsertPluginEntry(text, {throttle: {maxParallel: 2}});
    expect(result).toContain("other/plugin");
    expect(result).toContain(`["@beremaran/opencode-beanie-plugin",{"throttle":{"maxParallel":2}}]`);
});
