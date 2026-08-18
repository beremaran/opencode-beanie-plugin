import {expect, test} from "bun:test";
import type {PluginInput} from "@opencode-ai/plugin";
import {
  DEFAULT_TOOL_GUIDANCE,
  DirectivesDomain,
} from "./index";

function createMockInput(logFn?: (args: unknown) => Promise<unknown>): PluginInput {
  return {
    client: {
      app: {
        log: logFn ? logFn : () => Promise.resolve(),
      },
    } as never,
    project: {id: "test-project"} as never,
    directory: "/test",
    worktree: "/test",
    experimental_workspace: {register: () => {}},
    serverUrl: new URL("http://localhost"),
    $: {} as never,
  };
}

test("DirectivesDomain returns empty hooks when deactivated", async () => {
  let logged = false;
  const input = createMockInput(async () => {
    await Promise.resolve();
    logged = true;
  });

  const hooks = await DirectivesDomain(input, {
    directives: {
      defaults: false,
      system: [],
      tools: {},
    },
  });

  expect(hooks).toEqual({});
  expect(logged).toBe(false);
});

test("DirectivesDomain applies tool definitions and system transforms", async () => {
  let logged = false;
  const input = createMockInput(async () => {
    await Promise.resolve();
    logged = true;
  });

  const hooks = await DirectivesDomain(input, {
    directives: {
      defaults: true,
      system: ["Custom system line"],
      tools: {
        custom_tool: "Custom guidance",
      },
    },
  });

  expect(logged).toBe(true);
  expect(hooks["tool.definition"]).toBeDefined();
  expect(hooks["experimental.chat.system.transform"]).toBeDefined();

  const toolDefOutput1 = {description: "", parameters: {}};
  await hooks["tool.definition"]?.({toolID: "list_skills"}, toolDefOutput1);
  const expectedSkillsGuidance = DEFAULT_TOOL_GUIDANCE.list_skills ?? "";
  expect(toolDefOutput1.description).toBe(
    `[opencode-beanie-plugin] ${expectedSkillsGuidance}`,
  );

  const toolDefOutput2 = {description: "Base description.", parameters: {}};
  await hooks["tool.definition"]?.({toolID: "custom_tool"}, toolDefOutput2);
  expect(toolDefOutput2.description).toBe(
    "Base description.\n\n[opencode-beanie-plugin] Custom guidance",
  );

  const toolDefOutput3 = {description: "Existing.", parameters: {}};
  await hooks["tool.definition"]?.({toolID: "other_tool"}, toolDefOutput3);
  expect(toolDefOutput3.description).toBe("Existing.");

  const systemOutput = {system: ["Initial system prompt"]};
  await hooks["experimental.chat.system.transform"]?.(
    {model: {} as never},
    systemOutput,
  );
  expect(systemOutput.system.length).toBe(3);
  expect(systemOutput.system[0]).toBe("Initial system prompt");
  expect(systemOutput.system[1]).toContain("# Plugin capabilities (opencode-beanie-plugin)");
  expect(systemOutput.system[2]).toBe("Custom system line");
});

test("DirectivesDomain catches logging failure gracefully", async () => {
  const input = createMockInput(async () => {
    await Promise.resolve();
    throw new Error("log failure");
  });

  const hooks = await DirectivesDomain(input, {});
  expect(hooks["tool.definition"]).toBeDefined();
});
