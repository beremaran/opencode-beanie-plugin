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
    globalThis.fetch = ((url: string) => {
      if (url.includes("/api/v1/skills?")) {
        return Promise.resolve(new Response(JSON.stringify({
          data: [
            { id: "test-org/my-skill", name: "My Skill", slug: "my-skill", source: "test-org" },
          ],
          pagination: { page: 1, perPage: 20, total: 1, hasMore: false },
        }), { status: 200 }));
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }) as unknown as typeof fetch;

    const reg = new SkillsShRegistry({ token: "test-token" });
    const res = await reg.listSkills();

    expect(res.data).toHaveLength(1);
    expect(res.data[0]?.id).toBe("test-org/my-skill");
  });

  test("searchSkills searches by query", async () => {
    globalThis.fetch = ((url: string) => {
      if (url.includes("/api/v1/skills/search?")) {
        return Promise.resolve(new Response(JSON.stringify({
          data: [
            { id: "test-org/my-skill", name: "My Skill", slug: "my-skill", source: "test-org" },
          ],
          count: 1,
        }), { status: 200 }));
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }) as unknown as typeof fetch;

    const reg = new SkillsShRegistry({ token: "test-token" });
    const res = await reg.searchSkills({ query: "skill" });

    expect(res.data).toHaveLength(1);
    expect(res.data[0]?.slug).toBe("my-skill");
  });

  test("loadSkill fetches skill details and parses files", async () => {
    globalThis.fetch = ((url: string) => {
      if (url.includes("/api/v1/skills/test-org/my-skill")) {
        return Promise.resolve(new Response(JSON.stringify({
          id: "test-org/my-skill",
          name: "My Skill",
          slug: "my-skill",
          source: "test-org",
          files: [
            { path: "SKILL.md", contents: "# Skill Content" },
          ],
        }), { status: 200 }));
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }) as unknown as typeof fetch;

    const reg = new SkillsShRegistry({ token: "test-token" });
    const detail = await reg.loadSkill("test-org/my-skill");

    expect(detail.name).toBe("My Skill");
    expect(detail.files).toHaveLength(1);
  });

  test("loadSkill throws SkillNotFoundError on 404", async () => {
    globalThis.fetch = (() => Promise.resolve(new Response("Not Found", { status: 404 }))) as unknown as typeof fetch;

    const reg = new SkillsShRegistry({ token: "test-token" });
    let error: Error | null = null;
    try {
      await reg.loadSkill("test-org/missing");
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeInstanceOf(SkillNotFoundError);
  });

  test("loadSkill throws RegistryAuthError on 401", async () => {
    globalThis.fetch = (() => Promise.resolve(new Response("Unauthorized", { status: 401 }))) as unknown as typeof fetch;

    const reg = new SkillsShRegistry({ token: "invalid-token" });
    let error: Error | null = null;
    try {
      await reg.loadSkill("test-org/skill");
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeInstanceOf(RegistryAuthError);
  });
});
