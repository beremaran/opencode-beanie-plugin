import {afterEach, describe, expect, test} from "bun:test";
import {SkillsShRegistry} from "./registries/skills-sh";
import {RegistryAuthError, SkillNotFoundError} from "./types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("SkillsShRegistry", () => {
  test("throws error if constructed without token", () => {
    expect(() => new SkillsShRegistry({})).toThrow(RegistryAuthError);
  });

  test("listSkills fetches from skills.sh API", async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/v1/skills?")) {
        return new Response(JSON.stringify({
          data: [
            { id: "test-org/my-skill", name: "My Skill", slug: "my-skill", source: "test-org" },
          ],
          pagination: { page: 1, perPage: 20, total: 1, hasMore: false },
        }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const reg = new SkillsShRegistry({ token: "test-token" });
    const res = await reg.listSkills();

    expect(res.data).toHaveLength(1);
    expect(res.data[0]?.id).toBe("test-org/my-skill");
  });

  test("searchSkills searches by query", async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/v1/skills/search?")) {
        return new Response(JSON.stringify({
          data: [
            { id: "test-org/my-skill", name: "My Skill", slug: "my-skill", source: "test-org" },
          ],
          count: 1,
        }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const reg = new SkillsShRegistry({ token: "test-token" });
    const res = await reg.searchSkills({ query: "skill" });

    expect(res.data).toHaveLength(1);
    expect(res.data[0]?.slug).toBe("my-skill");
  });

  test("loadSkill fetches skill details and parses files", async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/v1/skills/test-org/my-skill")) {
        return new Response(JSON.stringify({
          id: "test-org/my-skill",
          name: "My Skill",
          slug: "my-skill",
          source: "test-org",
          files: [
            { path: "SKILL.md", contents: "# Skill Content" },
          ],
        }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const reg = new SkillsShRegistry({ token: "test-token" });
    const detail = await reg.loadSkill("test-org/my-skill");

    expect(detail.name).toBe("My Skill");
    expect(detail.files).toHaveLength(1);
  });

  test("loadSkill throws SkillNotFoundError on 404", async () => {
    globalThis.fetch = (async () => new Response("Not Found", { status: 404 })) as typeof fetch;

    const reg = new SkillsShRegistry({ token: "test-token" });
    await expect(reg.loadSkill("test-org/missing")).rejects.toThrow(SkillNotFoundError);
  });

  test("loadSkill throws RegistryAuthError on 401", async () => {
    globalThis.fetch = (async () => new Response("Unauthorized", { status: 401 })) as typeof fetch;

    const reg = new SkillsShRegistry({ token: "invalid-token" });
    await expect(reg.loadSkill("test-org/skill")).rejects.toThrow(RegistryAuthError);
  });
});
