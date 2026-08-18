import { bool, fail, num, plain, string, stringMap, strings } from "./config-helpers";
import type { HttpServerConfig, ServerCommonConfig, ServerConfig, StdioServerConfig } from "./types";

export const GLOB_RE = /^[A-Za-z0-9._*-]+$/;
export const HTTP_URL_RE = /^https?:\/\//i;
export const SERVER_NAME_RE = /^[A-Za-z0-9._-]{1,128}$/;

function buildCommon(at: string, value: Record<string, unknown>): ServerCommonConfig {
  const toolFilter = value.toolFilter ? strings(`${at}.toolFilter`, value.toolFilter) : [];

  for (const pattern of toolFilter) {
    if (!(pattern && GLOB_RE.test(pattern))) {
      fail(`${at}.toolFilter`, "invalid glob pattern");
    }
  }

  const tags = value.tags ? strings(`${at}.tags`, value.tags) : [];

  const timeout = value.timeout as number | undefined;

  if (timeout !== undefined) {
    num(`${at}.timeout`, timeout, Number.EPSILON, Number.MAX_SAFE_INTEGER);
  }
  if (value.disabled !== undefined) {
    bool(`${at}.disabled`, value.disabled);
  }
  return { disabled: value.disabled === true, timeout, toolFilter, tags };
}

function buildStdioServer(at: string, value: Record<string, unknown>, common: ServerCommonConfig): StdioServerConfig {
  const command = value.command as string;
  string(`${at}.command`, command);
  if (!command) {
    fail(`${at}.command`, "must not be empty");
  }

  const args = value.args ? strings(`${at}.args`, value.args) : [];

  const env = value.env ? stringMap(`${at}.env`, value.env) : {};

  const config: StdioServerConfig = { ...common, type: "stdio", command, args, env };

  if (value.cwd !== undefined) {
    string(`${at}.cwd`, value.cwd);
    config.cwd = value.cwd as string;
  }
  return config;
}

function buildHttpServer(at: string, value: Record<string, unknown>, common: ServerCommonConfig): HttpServerConfig {
  const url = value.url as string;
  string(`${at}.url`, url);
  if (!HTTP_URL_RE.test(url)) {
    fail(`${at}.url`, "must start with http:// or https://");
  }

  const rawTransport = value.transportType ?? "streamable-http";

  if (rawTransport !== "streamable-http" && rawTransport !== "sse") {
    fail(`${at}.transportType`, "must be streamable-http or sse");
  }

  const headers = value.headers ? stringMap(`${at}.headers`, value.headers) : {};

  return { ...common, type: "http", url, headers, transportType: rawTransport as "streamable-http" | "sse" };
}

export function normalizeServerConfig(at: string, value: unknown): ServerConfig {
  if (!plain(value)) {
    fail(at, "expected an object");
  }

  const input = value as Record<string, unknown>;

  const hasCommand = "command" in input;

  const hasUrl = "url" in input;

  if (hasCommand === hasUrl) {
    fail(at, "server must have exactly one of command or url");
  }

  const common = buildCommon(at, input);

  return hasCommand ? buildStdioServer(at, input, common) : buildHttpServer(at, input, common);
}

export function normalizeServers(input: Record<string, unknown>): Record<string, ServerConfig> {
  const { mcpServers } = input;

  if (!plain(mcpServers)) {
    fail("mcpServers", "required key missing or expected an object");
  }

  const map = mcpServers as Record<string, unknown>;

  const servers: Record<string, ServerConfig> = {};

  for (const [name, value] of Object.entries(map)) {
    const at = `mcpServers.${name}`;

    if (!SERVER_NAME_RE.test(name)) {
      fail(at, "invalid server name");
    }
    servers[name] = normalizeServerConfig(at, value);
  }
  return servers;
}
