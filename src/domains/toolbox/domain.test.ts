import { describe, expect, test } from "bun:test";
import type { PluginInput } from "@opencode-ai/plugin";
import { ToolboxDomain } from "./index";
import { redact } from "./logger";

function createMockInput(): PluginInput {
  return {
    client: {
      app: {
        log: async () => {},
      },
    },
  } as unknown as PluginInput;
}

describe("ToolboxDomain", () => {
  test("returns empty hooks when no config is provided", async () => {
    const input = createMockInput();
    const hooks = await ToolboxDomain(input, undefined);
    expect(hooks.tool).toEqual({});
    expect(hooks.dispose).toBeUndefined();
  });

  test("initializes tools and dispose when servers are configured", async () => {
    const input = createMockInput();
    const hooks = await ToolboxDomain(input, {
      toolbox: {
        servers: {
          testServer: { command: "node", args: ["-e", "process.exit(0)"] },
        },
      },
    });

    expect(hooks.tool?.list_tools).toBeDefined();
    expect(hooks.tool?.get_tool_schema).toBeDefined();
    expect(hooks.tool?.invoke_tool).toBeDefined();
    expect(hooks.dispose).toBeDefined();

    if (hooks.dispose) {
      await hooks.dispose();
      expect(hooks.dispose).toBeDefined();
    }
  });

  test("redact scrubs sensitive values from log payloads", () => {
    const payload = {
      apiKey: "secret-key",
      token: "secret-token",
      password: "secret-password",
      normal: "visible",
      nested: { bearer: "secret-bearer", safe: 123 },
    };
    const scrubbed = redact(payload) as Record<string, unknown>;
    expect(scrubbed.apiKey).toBe("[REDACTED]");
    expect(scrubbed.token).toBe("[REDACTED]");
    expect(scrubbed.password).toBe("[REDACTED]");
    expect(scrubbed.normal).toBe("visible");
    expect((scrubbed.nested as Record<string, unknown>).bearer).toBe("[REDACTED]");
    expect((scrubbed.nested as Record<string, unknown>).safe).toBe(123);
  });
});
