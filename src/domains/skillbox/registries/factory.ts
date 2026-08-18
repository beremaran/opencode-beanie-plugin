import {
  type SkillRegistry,
  type SkillboxOptions,
  RegistryAuthError,
} from "../types";
import {GithubRegistry} from "./github";
import {SkillsShRegistry} from "./skills-sh";

export const DEFAULT_GITHUB_SOURCES: readonly string[] = [
  "vercel-labs/skills",
  "anthropics/skills",
  "obra/superpowers",
  "mattpocock/skills",
  "microsoft/azure-skills",
  "supabase/agent-skills",
  "prisma/skills",
];

export function createRegistry(config: SkillboxOptions): SkillRegistry {
  const mode = config.registry ?? "auto";

  if (mode === "skills-sh" || (mode === "auto" && config.skillsShToken)) {
    if (!config.skillsShToken) {
      throw new RegistryAuthError("skills-sh registry requires skillsShToken");
    }

    return new SkillsShRegistry({
      token: config.skillsShToken,
      maxBytes: config.maxBytes,
    });
  }

  return new GithubRegistry({
    sources: config.githubSources ?? [...DEFAULT_GITHUB_SOURCES],
    maxBytes: config.maxBytes,
    token: config.githubToken,
  });
}

function describeExplicit(mode: "skills-sh" | "github", token?: string, sources?: string[]) {
  if (mode === "skills-sh") {
    if (!token) {
      throw new RegistryAuthError("skills-sh registry requires skillsShToken");
    }

    return { registry: "skills-sh" as const, reason: "skills.sh registry requested explicitly" };
  }

  return {
    registry: "github" as const,
    reason: "github registry requested explicitly",
    sources: sources ?? DEFAULT_GITHUB_SOURCES,
  };
}

export function describeRegistry(config: SkillboxOptions): {
  registry: "skills-sh" | "github";
  reason: string;
  sources?: readonly string[];
} {
  const mode = config.registry ?? "auto";

  if (mode !== "auto") {
    return describeExplicit(mode, config.skillsShToken, config.githubSources);
  }
  if (config.skillsShToken) {
    return { registry: "skills-sh", reason: "skillsShToken provided; using skills.sh registry" };
  }

  return {
    registry: "github",
    reason: "no skillsShToken provided; using public GitHub registries",
    sources: config.githubSources ?? DEFAULT_GITHUB_SOURCES,
  };
}
