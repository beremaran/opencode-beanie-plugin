import type { PluginInput } from "@opencode-ai/plugin"

const secretKey = /(token|secret|password|key|authorization|bearer|api[-_]?key)/i
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, secretKey.test(key) ? "[REDACTED]" : redact(item)]))
  return value
}

export type Logger = { info(message: string, data?: unknown): void; warn(message: string, data?: unknown): void; error(message: string, data?: unknown): void }
export function createLogger(client: PluginInput["client"]): Logger {
  const write = (level: "info" | "warn" | "error", message: string, data?: unknown) => {
    void client.app.log({ body: { service: "opencode-beanie-plugin", level, message, ...(data === undefined ? {} : { extra: redact(data) as Record<string, unknown> }) } }).catch(() => undefined)
  }
  return { info: (message, data) => write("info", message, data), warn: (message, data) => write("warn", message, data), error: (message, data) => write("error", message, data) }
}
