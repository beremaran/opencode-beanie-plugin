import {describe, expect, test} from "bun:test";
import {createListSkillsTool, createLoadSkillTool, createSearchSkillsTool} from "./tools";
import type {SkillRegistry} from "./types";

const mockRegistry: SkillRegistry = {
  listSkills: async () => ({
    data: [{
      id: "org/repo/skill-1",
      name: "Skill 1",
      slug: "skill-1",
      source: "org/repo",
      sourceType: "github",
    }],
    pagination: { page: 0, perPage: 20, total: 1, hasMore: false },
  }),
  searchSkills: async () => ({
    data: [{
      id: "org/repo/skill-1",
      name: "Skill 1",
      slug: "skill-1",
      source: "org/repo",
      sourceType: "github",
    }],
  }),
  loadSkill: async (id) => ({
    id,
    name: "Skill 1",
    slug: "skill-1",
    source: "org/repo",
    files: [{ path: "SKILL.md", contents: "# Skill 1" }],
  }),
};

const noopLogger = async () => {};

describe("skillbox tools", () => {
  test("list_skills executes and formats JSON output", async () => {
    const listTool = createListSkillsTool(mockRegistry, noopLogger);
    const result = await listTool.execute({
      page: 0,
      per_page: 20,
      include_description: false,
    }, { sessionID: "test", messageID: "m1" });

    const parsed = JSON.parse(result) as { count: number; skills: { id: string }[] };
    expect(parsed.count).toBe(1);
    expect(parsed.skills[0]?.id).toBe("org/repo/skill-1");
  });

  test("search_skills rejects short query", async () => {
    const searchTool = createSearchSkillsTool(mockRegistry, noopLogger);
    const result = await searchTool.execute({
      query: "a",
      limit: 10,
      include_description: false,
    }, { sessionID: "test", messageID: "m1" });

    expect(JSON.parse(result)).toEqual({ error: "Search query must be at least 2 characters" });
  });

  test("search_skills executes and returns results", async () => {
    const searchTool = createSearchSkillsTool(mockRegistry, noopLogger);
    const result = await searchTool.execute({
      query: "skill",
      limit: 10,
      include_description: false,
    }, { sessionID: "test", messageID: "m1" });

    const parsed = JSON.parse(result) as { count: number; results: { id: string }[] };
    expect(parsed.count).toBe(1);
    expect(parsed.results[0]?.id).toBe("org/repo/skill-1");
  });

  test("load_skill rejects empty id", async () => {
    const loadTool = createLoadSkillTool(mockRegistry, noopLogger);
    const result = await loadTool.execute({
      id: "   ",
      include_supporting_files: false,
    }, { sessionID: "test", messageID: "m1" });

    expect(JSON.parse(result)).toEqual({ error: "Skill id is required" });
  });

  test("load_skill executes and returns payload", async () => {
    const loadTool = createLoadSkillTool(mockRegistry, noopLogger);
    const result = await loadTool.execute({
      id: "org/repo/skill-1",
      include_supporting_files: false,
    }, { sessionID: "test", messageID: "m1" });

    const parsed = JSON.parse(result) as { id: string; name: string };
    expect(parsed.id).toBe("org/repo/skill-1");
    expect(parsed.name).toBe("Skill 1");
  });
});
