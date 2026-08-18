import { describe, expect, test } from "bun:test";
import type { Client } from "@modelcontextprotocol/client";
import { callToolOnServer, listToolsForServer } from "./connection-invoker";
import { UpstreamRegistry } from "./registry-upstream";
import { ToolRegistry } from "./registry-tools";
import { normalizeConfig } from "./config";

describe("connection-invoker", () => {
  const config = normalizeConfig({
    mcpServers: { s1: { command: "node", toolFilter: ["*"] } },
  });
  const upstream = new UpstreamRegistry(config);
  const registry = new ToolRegistry(upstream);

  test("listToolsForServer filters valid tools and caches them", async () => {
    const entry = upstream.get("s1");
    expect(entry).toBeDefined();
    if (!entry) {return;}
    const mockClient = {
      listTools: () =>
        Promise.resolve({
          tools: [
            { name: "valid_tool", description: "a valid tool" },
            { name: "invalid tool with spaces", description: "bad name" },
          ],
        }),
    } as unknown as Client;

    const teardowns: { name: string; err: string }[] = [];
    const result = await listToolsForServer(
      mockClient,
      entry,
      "s1",
      registry,
      5000,
      (name, err) => { teardowns.push({ name, err }); },
    );

    expect(result).toHaveLength(1);
    expect(result?.[0]?.name).toBe("valid_tool");
    expect(entry.skippedTools).toContain("invalid tool with spaces");
    expect(teardowns).toHaveLength(0);
  });

  test("listToolsForServer handles errors and marks metadataStale", async () => {
    const entry = upstream.get("s1");
    expect(entry).toBeDefined();
    if (!entry) {return;}
    entry.metadataCache = [{ name: "old_tool", inputSchema: { type: "object" } }];
    const mockClient = {
      listTools: () => Promise.reject(new Error("network failure")),
    } as unknown as Client;

    const teardowns: { name: string; err: string }[] = [];
    const result = await listToolsForServer(
      mockClient,
      entry,
      "s1",
      registry,
      5000,
      (name, err) => { teardowns.push({ name, err }); },
    );

    expect(result).toBeNull();
    expect(teardowns).toHaveLength(1);
    expect(teardowns[0]?.err).toBe("network failure");
    expect(entry.metadataStale).toBe(true);
  });

  test("callToolOnServer forwards arguments and options to client", async () => {
    const mockClient = {
      callTool: (req: { name: string; arguments: Record<string, unknown> }, opts: { timeout: number }) =>
        Promise.resolve({ content: [{ type: "text", text: `ok ${req.name}` }], timeout: opts.timeout }),
    } as unknown as Client;

    const result = await callToolOnServer(mockClient, "echo", { foo: "bar" }, 3000);
    expect((result as unknown as { timeout: number }).timeout).toBe(3000);
  });
});
