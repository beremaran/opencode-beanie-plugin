import type { PluginInput } from "@opencode-ai/plugin";

const SECRET_KEY_RE = /(token|secret|password|key|authorization|bearer|api[-_]?key)/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (SECRET_KEY_RE.test(key)) {
          return [key, "[REDACTED]"];
        }
        return [key, redact(item)];
      }),
    );
  }
  return value;
}

export interface Logger {
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

export function createLogger(client: PluginInput["client"]): Logger {
  const write = (level: "info" | "warn" | "error", message: string, data?: unknown) => {
    const body: {
      service: string;
      level: "info" | "warn" | "error";
      message: string;
      extra?: Record<string, unknown>;
    } = { service: "opencode-beanie-plugin", level, message };

    if (data !== undefined) {
      body.extra = redact(data) as Record<string, unknown>;
    }
    void client.app.log({ body }).catch(() => undefined);
  };

  return {
    info: (message, data) => { write("info", message, data); },
    warn: (message, data) => { write("warn", message, data); },
    error: (message, data) => { write("error", message, data); },
  };
}
