import type { Transport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

export const MS_PER_SECOND = 1000;
export const MAX_ERROR_LEN = 300;
export const MAX_STDERR_LEN = 1024;
export const TIMEOUT_RE = /tim(eo|e)out/i;
export const WHITESPACE_RE = /\s+/g;

export class UnknownServerError extends Error {}
export class DisabledServerError extends Error {}

export const buildStdioEnv = (env: Record<string, string> = {}): Record<string, string> =>
  Object.fromEntries(
    Object.entries({ ...Bun.env, ...env }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

export function captureStderr(transport: Transport, sink: string[]): void {
  if (!(transport instanceof StdioClientTransport)) {return;}

  const stderr = transport.stderr as { on: (event: "data", listener: (chunk: unknown) => void) => void } | null;
  stderr?.on("data", (chunk: unknown) => {
    if (sink.reduce((acc, item) => acc + item.length, 0) < MAX_STDERR_LEN) {
      sink.push(String(chunk));
    }
  });
}

export function stderrDetail(chunks: string[]): string {
  const text = chunks.join("").replace(WHITESPACE_RE, " ").trim();

  if (!text) {return "";}
  return text.length <= MAX_ERROR_LEN ? ` (stderr: ${text})` : ` (stderr: …${text.slice(-MAX_ERROR_LEN)})`;
}

export function safeError(error: unknown): string {
  const val = error as { message?: string; status?: number; statusText?: string };

  if (typeof val.status === "number") {
    return val.statusText ? `HTTP ${String(val.status)} ${val.statusText}` : `HTTP ${String(val.status)}`;
  }

  const msg = String(val.message ?? error).replace(WHITESPACE_RE, " ").trim().slice(0, MAX_ERROR_LEN);

  return TIMEOUT_RE.test(msg) ? "request timed out" : msg;
}
