import type {PluginOptions} from "@opencode-ai/plugin";
import type {SkillboxOptions} from "./types";

function extractRaw(raw: PluginOptions | undefined): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const candidate = (raw as Record<string, unknown>).skillbox;

  if (typeof candidate === "object" && candidate !== null) {
    return candidate as Record<string, unknown>;
  }

  return raw as Record<string, unknown>;
}

function parseSources(val: unknown): string[] | undefined {
  if (typeof val === "string") {
    const list = val.split(",").map((s) => s.trim()).filter(Boolean);

    return list.length > 0 ? list : undefined;
  }
  if (Array.isArray(val)) {
    const list = val.filter((s): s is string => typeof s === "string" && s.trim().length > 0);

    return list.length > 0 ? list : undefined;
  }

  return undefined;
}

function parseMaxBytes(val: unknown): number | undefined {
  const n = Number(val);

  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function parseDebug(val: unknown): boolean | undefined {
  if (val === true || val === "1" || val === "true") {
    return true;
  }
  if (val === false || val === "0" || val === "false") {
    return false;
  }

  return undefined;
}

function parseTokens(get: (k: string, ek: string) => unknown) {
  const token = get("skillsShToken", "SKILLS_SH_TOKEN");
  const ghToken = get("githubToken", "GITHUB_TOKEN");

  return {
    skillsShToken: typeof token === "string" && token.trim() ? token.trim() : undefined,
    githubToken: typeof ghToken === "string" && ghToken.trim() ? ghToken.trim() : undefined,
  };
}

export function resolveSkillboxOptions(
  raw?: PluginOptions,
  env: Record<string, string | undefined> = Bun.env,
): SkillboxOptions {
  const source = extractRaw(raw);
  const get = (key: string, envKey: string) => source[key] ?? env[envKey];
  const reg = get("registry", "SKILL_REGISTRY");
  const { skillsShToken, githubToken } = parseTokens(get);

  return {
    ...(reg === "auto" || reg === "skills-sh" || reg === "github" ? { registry: reg } : {}),
    ...(skillsShToken && { skillsShToken }),
    ...(githubToken && { githubToken }),
    githubSources: parseSources(get("githubSources", "SKILL_GITHUB_SOURCES")),
    maxBytes: parseMaxBytes(get("maxBytes", "SKILL_MAX_BYTES")),
    debug: parseDebug(get("debug", "SKILL_DEBUG")),
  };
}
