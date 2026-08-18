import { describe, expect, test } from "bun:test";
import { ConfigError, substituteEnv } from "./config-helpers";
import { loadConfig, normalizeConfig, normalizeServerConfig } from "./config";

describe("substituteEnv", () => {
  test("substitutes existing environment variables", () => {
    const env = { API_KEY: "secret123", HOST: "localhost" };
    expect(substituteEnv("key=${API_KEY}", env)).toBe("key=secret123");
    expect(substituteEnv("http://${HOST}:8080", env)).toBe("http://localhost:8080");
  });

  test("uses fallback value when environment variable is unset", () => {
    const env = {};
    expect(substituteEnv("${PORT:-3000}", env)).toBe("3000");
    expect(substituteEnv("${TIMEOUT:-60}", env)).toBe("60");
  });

  test("throws ConfigError when variable is missing with no fallback", () => {
    const env = {};
    expect(() => substituteEnv("${MISSING_VAR}", env)).toThrow(ConfigError);
  });

  test("substitutes recursively in objects and arrays", () => {
    const env = { USER: "admin", KEY: "token" };
    const input = { users: ["${USER}"], auth: { key: "${KEY}" } };
    expect(substituteEnv(input, env)).toEqual({ users: ["admin"], auth: { key: "token" } });
  });
});

describe("normalizeServerConfig", () => {
  test("normalizes stdio server config", () => {
    const raw = { command: "node", args: ["server.js"], env: { A: "B" }, disabled: false };
    const result = normalizeServerConfig("mcpServers.local", raw);
    expect(result.type).toBe("stdio");
    if (result.type === "stdio") {
      expect(result.command).toBe("node");
      expect(result.args).toEqual(["server.js"]);
      expect(result.env).toEqual({ A: "B" });
      expect(result.disabled).toBe(false);
    }
  });

  test("normalizes http server config with streamable-http and sse", () => {
    const httpRaw = { url: "https://api.example.com/mcp", headers: { Authorization: "Bearer xyz" } };
    const httpResult = normalizeServerConfig("mcpServers.remote", httpRaw);
    expect(httpResult.type).toBe("http");
    if (httpResult.type === "http") {
      expect(httpResult.url).toBe("https://api.example.com/mcp");
      expect(httpResult.transportType).toBe("streamable-http");
    }

    const sseRaw = { url: "http://localhost:8000/sse", transportType: "sse" };
    const sseResult = normalizeServerConfig("mcpServers.sse", sseRaw);
    expect(sseResult.type).toBe("http");
    if (sseResult.type === "http") {
      expect(sseResult.transportType).toBe("sse");
    }
  });

  test("rejects invalid server configs", () => {
    expect(() => normalizeServerConfig("test", { command: "cmd", url: "http://x" })).toThrow(ConfigError);
    expect(() => normalizeServerConfig("test", {})).toThrow(ConfigError);
    expect(() => normalizeServerConfig("test", { url: "ftp://bad" })).toThrow(ConfigError);
    expect(() => normalizeServerConfig("test", { command: "" })).toThrow(ConfigError);
    expect(() => normalizeServerConfig("test", { command: "cmd", toolFilter: ["bad [pattern"] })).toThrow(ConfigError);
  });
});

describe("normalizeConfig & loadConfig", () => {
  test("returns null when no config is provided", () => {
    const logs: string[] = [];
    const logger = { info: (m: string) => logs.push(m), warn: () => {}, error: () => {} };
    expect(loadConfig({ logger })).toBeNull();
    expect(logs.length).toBeGreaterThan(0);
  });

  test("normalizes scalar defaults", () => {
    const raw = { mcpServers: { local: { command: "echo" } } };
    const cfg = normalizeConfig(raw);
    expect(cfg.searchTopK).toBe(20);
    expect(cfg.processPoolSize).toBe(8);
    expect(cfg.timeoutSeconds).toBe(30);
    expect(cfg.idleTimeoutMs).toBe(300_000);
    expect(cfg.cacheToolMetadata).toBe(true);
  });

  test("rejects out-of-range scalars and unknown keys", () => {
    expect(() => normalizeConfig({ mcpServers: {}, searchTopK: 0 })).toThrow(ConfigError);
    expect(() => normalizeConfig({ mcpServers: {}, processPoolSize: 100 })).toThrow(ConfigError);
    expect(() => normalizeConfig({ mcpServers: {}, timeoutSeconds: -1 })).toThrow(ConfigError);
    expect(() => normalizeConfig({ mcpServers: {}, unknownKey: 123 })).toThrow(ConfigError);
    expect(() => normalizeConfig({ mcpServers: { "bad/name": { command: "x" } } })).toThrow(ConfigError);
  });

  test("loadConfig accepts servers directly", () => {
    const cfg = loadConfig({ servers: { s1: { command: "cmd" } }, env: {} });
    expect(cfg).not.toBeNull();
    expect(cfg?.mcpServers.s1).toBeDefined();
  });
});
