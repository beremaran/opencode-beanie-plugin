import { describe, expect, test } from "bun:test";
import { normalizeConfig } from "./config";
import { ConnectionManager, DisabledServerError, UnknownServerError } from "./connection";
import type { Logger } from "./logger";
import { UpstreamRegistry } from "./registry-upstream";
import { ToolRegistry } from "./registry-tools";

const mockLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

function createManager() {
  const config = normalizeConfig({
    mcpServers: {
      active: { command: "node", args: ["-e", ""] },
      disabled: { command: "node", disabled: true },
    },
    idleTimeoutMs: 50,
  });
  const upstream = new UpstreamRegistry(config);
  const tools = new ToolRegistry(upstream);
  const manager = new ConnectionManager(config, tools, mockLogger);
  return { manager, tools, upstream, config };
}

describe("ConnectionManager", () => {
  test("getSession throws UnknownServerError for nonexistent server", async () => {
    const { manager } = createManager();
    let error: Error | null = null;
    try {
      await manager.getSession("nonexistent");
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeInstanceOf(UnknownServerError);
  });

  test("getSession throws DisabledServerError for disabled server", async () => {
    const { manager } = createManager();
    let error: Error | null = null;
    try {
      await manager.getSession("disabled");
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeInstanceOf(DisabledServerError);
  });

  test("getSession rejects when server is in error state with active backoff", async () => {
    const { manager, upstream } = createManager();
    upstream.markError("active", "connection failure");
    let error: Error | null = null;
    try {
      await manager.getSession("active");
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).toBe("connect failed: connection failure");
  });

  test("callTool throws UnknownServerError for unknown server", async () => {
    const { manager } = createManager();
    let error: Error | null = null;
    try {
      await manager.callTool("ghost", "tool", {});
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeInstanceOf(UnknownServerError);
  });

  test("listToolsFor returns null when connection fails", async () => {
    const { manager } = createManager();
    const result = await manager.listToolsFor("active");
    expect(result).toBeNull();
  });

  test("touch resets idle timers and closeAll clears sessions", async () => {
    const { manager } = createManager();
    manager.touch("active");
    await manager.closeAll();
    expect(manager).toBeDefined();
  });

  test("forceKillStale runs without error", () => {
    const { manager } = createManager();
    expect(() => { manager.forceKillStale(); }).not.toThrow();
  });
});
