import { describe, expect, test } from "bun:test";
import { normalizeConfig } from "./config";
import { UpstreamRegistry } from "./registry-upstream";
import { qualifiedName, splitQualified, ToolRegistry } from "./registry-tools";
import type { UpstreamTool } from "./types";

const mockTools: UpstreamTool[] = [
  { name: "read_file", description: "Reads file content", inputSchema: { type: "object" } },
  { name: "write_file", description: "Writes file content", inputSchema: { type: "object" } },
];

function createTestRegistry() {
  const config = normalizeConfig({
    mcpServers: {
      s1: { command: "node", tags: ["filesystem"] },
      s2: { url: "https://api.example.com", disabled: true },
    },
  });
  const upstream = new UpstreamRegistry(config);
  return { upstream, registry: new ToolRegistry(upstream) };
}

describe("UpstreamRegistry", () => {
  test("initializes server entries correctly", () => {
    const { upstream } = createTestRegistry();
    expect(upstream.has("s1")).toBe(true);
    expect(upstream.has("s2")).toBe(true);
    expect(upstream.get("s1")?.connState).toBe("idle");
    expect(upstream.get("s2")?.connState).toBe("disabled");
    expect(upstream.enabledNames()).toEqual(["s1"]);
  });

  test("manages session and errors with exponential backoff", () => {
    const { upstream } = createTestRegistry();
    upstream.setSession("s1", { dummy: true });
    expect(upstream.get("s1")?.session).toEqual({ dummy: true });

    upstream.markError("s1", "connection refused");
    const entry = upstream.get("s1");
    expect(entry?.connState).toBe("error");
    expect(entry?.lastError).toBe("connection refused");
    expect(entry?.failCount).toBe(1);
    expect(entry?.nextRetryAt).toBeGreaterThan(Date.now());
    expect(entry?.session).toBeNull();

    upstream.clearError("s1");
    expect(entry?.connState).toBe("connected");
    expect(entry?.failCount).toBe(0);
    expect(entry?.lastError).toBeNull();
  });

  test("manages metadata cache and stale flags", () => {
    const { upstream } = createTestRegistry();
    upstream.setCache("s1", mockTools);
    expect(upstream.get("s1")?.metadataCache).toEqual(mockTools);
    expect(upstream.get("s1")?.metadataStale).toBe(false);

    upstream.markCacheStale("s1");
    expect(upstream.get("s1")?.metadataStale).toBe(true);

    upstream.evict("s1");
    expect(upstream.get("s1")?.metadataCache).toBeNull();
  });
});

describe("ToolRegistry", () => {
  test("qualified names and splitQualified", () => {
    expect(qualifiedName("srv", "tool")).toBe("srv__tool");
    expect(splitQualified("srv__tool")).toEqual({ server: "srv", tool: "tool" });
    expect(splitQualified("invalid")).toBeNull();
  });

  test("searches tools with filtering and limits", () => {
    const { upstream, registry } = createTestRegistry();
    upstream.setCache("s1", mockTools);

    const all = registry.search({ refresh: false });
    expect(all.tools.length).toBe(2);
    expect(all.total).toBe(2);

    const queryResult = registry.search({ query: "read", refresh: false });
    expect(queryResult.tools.length).toBe(1);
    expect(queryResult.tools[0]?.tool).toBe("read_file");

    const tagResult = registry.search({ query: "filesystem", refresh: false });
    expect(tagResult.tools.length).toBe(2);
  });

  test("needsRefresh detects uninitialized or stale servers", () => {
    const { upstream, registry } = createTestRegistry();
    expect(registry.needsRefresh("s1")).toBe(true);

    upstream.setCache("s1", mockTools);
    upstream.setState("s1", "connected");
    expect(registry.needsRefresh("s1")).toBe(false);

    upstream.markCacheStale("s1");
    expect(registry.needsRefresh("s1")).toBe(true);
  });
});
