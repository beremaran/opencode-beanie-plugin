import { describe, expect, test } from "bun:test";
import { normalizeConfig } from "./config";
import type { ConnectionManager } from "./connection";
import type { Logger } from "./logger";
import { UpstreamRegistry } from "./registry-upstream";
import { ToolRegistry } from "./registry-tools";
import { createTools } from "./tools";
import type { UpstreamTool } from "./types";

const mockTool: UpstreamTool = {
  name: "echo_tool",
  title: "Echo Tool",
  description: "Echoes whatever input is provided",
  inputSchema: { type: "object", properties: { msg: { type: "string" } } },
};

function createTestSetup() {
  const config = normalizeConfig({
    mcpServers: { local: { command: "node" } },
  });
  const upstream = new UpstreamRegistry(config);
  const registry = new ToolRegistry(upstream);
  upstream.setCache("local", [mockTool]);

  const mockConnection = {
    listToolsFor: () => Promise.resolve([mockTool]),
    callTool: (_server: string, tool: string, args: Record<string, unknown>) =>
      Promise.resolve({
        content: [{ type: "text", text: `called ${tool} with ${JSON.stringify(args)}` }],
      }),
  } as unknown as ConnectionManager;

  const logger: Logger = { info: () => {}, warn: () => {}, error: () => {} };
  const tools = createTools(registry, mockConnection, config, logger);
  return { registry, tools, upstream };
}

describe("Toolbox Tools", () => {
  test("list_tools returns formatted server and tools list", async () => {
    const { tools } = createTestSetup();
    const output = (await tools.list_tools.execute({ refresh: false }, {} as never)) as string;
    expect(output).toContain("[mcp-aggregator] 1 servers, 1 tools");
    expect(output).toContain("local");
    expect(output).toContain("local__echo_tool");
  });

  test("get_tool_schema returns full JSON schema", async () => {
    const { tools } = createTestSetup();
    const res = (await tools.get_tool_schema.execute({ tool: "local__echo_tool" }, {} as never)) as string;
    const parsed = JSON.parse(res) as { server?: string; tool?: string; inputSchema?: unknown };
    expect(parsed.server).toBe("local");
    expect(parsed.tool).toBe("echo_tool");
    expect(parsed.inputSchema).toBeDefined();
  });

  test("get_tool_schema returns error for unknown tool", async () => {
    const { tools } = createTestSetup();
    const res = (await tools.get_tool_schema.execute({ server: "local", tool: "unknown" }, {} as never)) as string;
    const parsed = JSON.parse(res) as { error?: string };
    expect(parsed.error).toContain("unknown tool");
  });

  test("invoke_tool executes tool and returns JSON result", async () => {
    const { tools } = createTestSetup();
    const res = (await tools.invoke_tool.execute(
      { tool: "local__echo_tool", arguments: { msg: "hello" } },
      { abort: undefined } as never,
    )) as string;
    const parsed = JSON.parse(res) as { content: { text: string }[] };
    expect(parsed.content[0]?.text).toContain("called echo_tool with");
  });

  test("invoke_tool reports error on unknown server or bad tool name", async () => {
    const { tools } = createTestSetup();
    const res = (await tools.invoke_tool.execute(
      { tool: "badserver__tool", arguments: {} },
      { abort: undefined } as never,
    )) as string;
    expect(res).toContain("unknown server: badserver");
  });
});
