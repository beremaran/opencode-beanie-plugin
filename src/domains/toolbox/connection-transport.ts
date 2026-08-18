import * as MCP from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { buildStdioEnv, safeError } from "./connection-helpers";
import type { ServerConfig } from "./types";

type Transport = MCP.Transport;

const SseTransport = (MCP as Record<string, unknown>).SSEClientTransport as new (
  url: URL,
  options?: unknown,
) => Transport;

export function createTransport(cfg: ServerConfig): Transport {
  if (cfg.type === "stdio") {
    return new StdioClientTransport({
      command: cfg.command,
      args: cfg.args,
      env: buildStdioEnv(cfg.env),
      cwd: cfg.cwd,
      stderr: "pipe",
    });
  }

  const url = new URL(cfg.url);

  const options = { requestInit: { headers: { ...cfg.headers } } };

  if (cfg.transportType === "sse" && typeof SseTransport === "function") {
    return new SseTransport(url, options);
  }
  return new MCP.StreamableHTTPClientTransport(url, options);
}

export function wireTransportEvents(
  transport: Transport,
  onClose: () => void,
  onError: (msg: string) => void,
): void {
  transport.onclose = () => {
    onClose();
  };
  transport.onerror = (error: unknown) => {
    onError(safeError(error));
  };
}
