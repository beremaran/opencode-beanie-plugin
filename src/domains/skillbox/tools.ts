import {tool} from "@opencode-ai/plugin";
import type {SkillListResult, SkillRegistry} from "./types";
import {formatLoadPayload, formatSummary, formatToolError} from "./payload";

export type Logger = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  extra?: Record<string, unknown>,
) => Promise<void>;

const listArgs = {
  view: tool.schema.enum(["all-time", "trending", "hot"]).optional(),
  page: tool.schema.number().int().min(0).optional().default(0),
  per_page: tool.schema.number().int().min(1).max(100).optional().default(20),
  include_description: tool.schema.boolean().optional().default(false),
};

const searchArgs = {
  query: tool.schema.string().min(2),
  limit: tool.schema.number().int().min(1).max(50).optional().default(10),
  owner: tool.schema.string().optional(),
  include_description: tool.schema.boolean().optional().default(false),
};

const loadArgs = {
  id: tool.schema.string().min(1),
  include_supporting_files: tool.schema.boolean().optional().default(false),
  max_bytes: tool.schema.number().int().min(500).max(100_000).optional(),
};

function renderListResult(res: SkillListResult, page: number, perPage: number, incDesc: boolean): string {
  return JSON.stringify(
    {
      count: res.data.length,
      skills: res.data.map((item) => formatSummary(item, incDesc)),
      pagination: res.pagination ?? { page, perPage, hasMore: false },
    },
    null,
    2,
  );
}

async function executeList(registry: SkillRegistry, log: Logger, args: {
  view?: "all-time" | "trending" | "hot";
  page: number;
  per_page: number;
  include_description: boolean;
}): Promise<string> {
  try {
    const res = await registry.listSkills({
      view: args.view,
      page: args.page,
      perPage: args.per_page,
      includeDescription: args.include_description,
    });

    return renderListResult(res, args.page, args.per_page, args.include_description);
  } catch (err) {
    await log("error", "list_skills failed", { error: String(err) });

    return formatToolError(err);
  }
}

async function executeSearch(registry: SkillRegistry, log: Logger, args: {
  query: string;
  limit: number;
  owner?: string;
  include_description: boolean;
}): Promise<string> {
  const query = args.query.trim();

  if (query.length < 2) {
    return JSON.stringify({ error: "Search query must be at least 2 characters" }, null, 2);
  }
  try {
    const res = await registry.searchSkills({ query, limit: args.limit, owner: args.owner, includeDescription: args.include_description });

    return JSON.stringify({ count: res.data.length, query, results: res.data.map((item) => formatSummary(item, args.include_description)) }, null, 2);
  } catch (err) {
    await log("error", "search_skills failed", { error: String(err) });

    return formatToolError(err);
  }
}

async function executeLoad(registry: SkillRegistry, log: Logger, args: {
  id: string;
  include_supporting_files: boolean;
  max_bytes?: number;
}): Promise<string> {
  const id = args.id.trim();

  if (!id) {
    return JSON.stringify({ error: "Skill id is required" }, null, 2);
  }
  try {
    const detail = await registry.loadSkill(id);

    return formatLoadPayload(detail, args.include_supporting_files, args.max_bytes);
  } catch (err) {
    await log("error", "load_skill failed", { id, error: String(err) });

    return formatToolError(err, id);
  }
}

export function createListSkillsTool(registry: SkillRegistry, log: Logger) {
  return tool({
    description: "List available agent skills from the registry. Returns compact JSON metadata; descriptions are omitted by default.",
    args: listArgs,
    execute: (args) => executeList(registry, log, args),
  });
}

export function createSearchSkillsTool(registry: SkillRegistry, log: Logger) {
  return tool({
    description: "Search agent skills by keyword. Returns compact JSON results and optional descriptions truncated to 300 characters.",
    args: searchArgs,
    execute: (args) => executeSearch(registry, log, args),
  });
}

export function createLoadSkillTool(registry: SkillRegistry, log: Logger) {
  return tool({
    description: "Load the full content of one skill by id, with optional supporting files and byte limits.",
    args: loadArgs,
    execute: (args) => executeLoad(registry, log, args),
  });
}
