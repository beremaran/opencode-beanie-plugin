import type {PluginOptions} from "@opencode-ai/plugin";
import {MECHANISMS} from "./defaults";
import type {MechanismName, ResolvedDirectivesOptions} from "./types";

const TOOL_PATTERN = /^[a-z0-9_-]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const extractSource = (raw?: PluginOptions): Record<string, unknown> => {
  if (!raw) {
    return {};
  }

  const candidate = (raw as Record<string, unknown>).directives;

  if (isRecord(candidate)) {
    return candidate;
  }

  return raw;
};

const stringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
      .map((entry) => entry.trim());
  }

  return [];
};

const stringMap = (value: unknown): Record<string, string> => {
  const result: Record<string, string> = {};

  if (!isRecord(value)) {
    return result;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.trim() !== "" && TOOL_PATTERN.test(key)) {
      result[key] = entry.trim();
    }
  }

  return result;
};

const isMechanism = (key: string): key is MechanismName =>
  (MECHANISMS as readonly string[]).includes(key);

export function resolveDirectivesOptions(raw?: PluginOptions): ResolvedDirectivesOptions {
  const source = extractSource(raw);

  const mechanisms = stringList(source.mechanisms).filter(isMechanism);

  const defaults = typeof source.defaults === "boolean" ? source.defaults : true;

  return {
    defaults,
    system: stringList(source.system),
    tools: stringMap(source.tools),
    mechanisms,
  };
}
