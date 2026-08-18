import {expect, test} from "bun:test";
import {
  DEFAULT_MECHANISM_NOTES,
  DEFAULT_TOOL_GUIDANCE,
  MECHANISMS,
  mechanismNotes,
  resolveDirectivesOptions,
  systemDirective,
  toolGuidance,
} from "./index";

test("resolveDirectivesOptions handles undefined and defaults", () => {
  const resolved = resolveDirectivesOptions(undefined);

  expect(resolved.defaults).toBe(true);
  expect(resolved.system).toEqual([]);
  expect(resolved.tools).toEqual({});
  expect(resolved.mechanisms).toEqual([]);
});

test("resolveDirectivesOptions handles nested directives namespace", () => {
  const resolved = resolveDirectivesOptions({
    directives: {
      defaults: false,
      system: ["Line 1", "  Line 2  ", ""],
      tools: {
        custom_tool: "Custom guidance",
        "invalid tool name!": "bad",
      },
      mechanisms: ["goal", "invalid_mech", "toolbox"],
    },
  });

  expect(resolved.defaults).toBe(false);
  expect(resolved.system).toEqual(["Line 1", "Line 2"]);
  expect(resolved.tools).toEqual({custom_tool: "Custom guidance"});
  expect(resolved.mechanisms).toEqual(["goal", "toolbox"]);
});

test("resolveDirectivesOptions handles root-level options", () => {
  const resolved = resolveDirectivesOptions({
    defaults: false,
    system: ["Root system"],
    tools: {my_tool: "Do something"},
    mechanisms: ["orchestrator"],
  });

  expect(resolved.defaults).toBe(false);
  expect(resolved.system).toEqual(["Root system"]);
  expect(resolved.tools).toEqual({my_tool: "Do something"});
  expect(resolved.mechanisms).toEqual(["orchestrator"]);
});

test("mechanismNotes returns all mechanisms when none specified", () => {
  const notes = mechanismNotes({
    defaults: true,
    system: [],
    tools: {},
    mechanisms: [],
  });

  expect(notes.length).toBe(MECHANISMS.length);
  for (const m of MECHANISMS) {
    expect(notes).toContain(DEFAULT_MECHANISM_NOTES[m]);
  }
});

test("mechanismNotes returns only configured subset", () => {
  const notes = mechanismNotes({
    defaults: true,
    system: [],
    tools: {},
    mechanisms: ["skillbox", "toolbox"],
  });

  expect(notes).toEqual([
    DEFAULT_MECHANISM_NOTES.skillbox,
    DEFAULT_MECHANISM_NOTES.toolbox,
  ]);
});

test("toolGuidance provides default and custom guidance", () => {
  const resolved = resolveDirectivesOptions({
    directives: {
      defaults: true,
      tools: {
        goal_set: "Additional custom guidance.",
        new_tool: "Guidance for new tool.",
      },
    },
  });

  const goalSetGuidance = toolGuidance(resolved, "goal_set");
  const expectedDefault = DEFAULT_TOOL_GUIDANCE.goal_set ?? "";

  expect(goalSetGuidance).toBe(
    `${expectedDefault} Additional custom guidance.`,
  );

  const newToolGuidance = toolGuidance(resolved, "new_tool");

  expect(newToolGuidance).toBe("Guidance for new tool.");

  const unconfiguredGuidance = toolGuidance(resolved, "unknown_tool");

  expect(unconfiguredGuidance).toBeUndefined();
});

test("toolGuidance respects defaults: false", () => {
  const resolved = resolveDirectivesOptions({
    directives: {
      defaults: false,
      tools: {
        custom_tool: "Only this custom one.",
      },
    },
  });

  expect(toolGuidance(resolved, "goal_set")).toBeUndefined();
  expect(toolGuidance(resolved, "custom_tool")).toBe("Only this custom one.");
});

test("systemDirective includes mechanisms and tool usage instructions", () => {
  const resolved = resolveDirectivesOptions({});
  const directive = systemDirective(resolved);

  expect(directive).toContain("# Plugin capabilities (opencode-beanie-plugin)");
  expect(directive).toContain("## Mechanisms");
  expect(directive).toContain("## Tool usage");
  expect(directive).toContain("- Persistent goals:");
  expect(directive).toContain("- Orchestration:");
  expect(directive).toContain("- Concurrency:");
  expect(directive).toContain("- Skill discovery:");
  expect(directive).toContain("- Tool aggregation:");
});
