export class ConfigError extends Error {
  override name = "ConfigError";
}

const ENV_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

export const fail = (where: string, message: string): never => {
  throw new ConfigError(`config error: ${where}: ${message}`);
};

export const plain = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const string = (where: string, value: unknown): void => {
  if (typeof value !== "string") {
    fail(where, `expected a string, got ${value === null ? "null" : typeof value}`);
  }
};

export const strings = (where: string, value: unknown): string[] => {
  if (!Array.isArray(value)) {
    fail(where, "expected an array of strings");
  }
  for (const [index, item] of (value as unknown[]).entries()) {
    string(`${where}[${String(index)}]`, item);
  }
  return value as string[];
};

export const bool = (where: string, value: unknown): void => {
  if (typeof value !== "boolean") {
    fail(where, `expected a boolean, got ${value === null ? "null" : typeof value}`);
  }
};

export const int = (where: string, value: unknown, min: number, max: number): void => {
  const n = value as number;

  if (!Number.isInteger(n) || n < min || n > max) {
    fail(where, `expected an integer in range ${String(min)}..${String(max)}`);
  }
};

export const num = (where: string, value: unknown, min: number, max: number): void => {
  if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) {
    fail(where, `expected a number in range ${String(min)}..${String(max)}`);
  }
};

export const stringMap = (where: string, value: unknown): Record<string, string> => {
  if (!plain(value)) {
    fail(where, "expected an object of strings");
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    string(`${where}.${key}`, item);
  }
  return value as Record<string, string>;
};

export function substituteEnv(value: unknown, env: Record<string, string | undefined>): unknown {
  if (typeof value === "string") {
    return value.replace(ENV_RE, (match, name: string, fallback?: string) => {
      const found = env[name];

      if (found !== undefined) {
        return found;
      }
      if (fallback !== undefined) {
        return fallback;
      }
      throw new ConfigError(`config error: missing environment variable ${name} referenced by "${match}"`);
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteEnv(item, env));
  }
  if (plain(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substituteEnv(item, env)]));
  }
  return value;
}
