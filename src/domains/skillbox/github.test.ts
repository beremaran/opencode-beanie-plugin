import {afterEach, describe, expect, test} from "bun:test";
import {GithubRegistry} from "./registries/github";
import {SkillNotFoundError} from "./types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("GithubRegistry", () => {
  test("listSkills retrieves skills from GitHub trees", async () => {
    globalThis.fetch = ((url: string) => {
      if (url.includes("/git/trees/main")) {
        return Promise.resolve(new Response(JSON.stringify({
          tree: [
            { path: "skills/code-review/SKILL.md", type: "blob" },
            { path: "skills/deploy/SKILL.md", type: "blob" },
          ],
        }), { status: 200 }));
      }
      if (url.includes("code-review/SKILL.md")) {
        return Promise.resolve(new Response("---\nname: Code Review\ndescription: Reviews code\n---\n# Reviewer", { status: 200 }));
      }
      if (url.includes("deploy/SKILL.md")) {
        return Promise.resolve(new Response("---\nname: Deploy\ndescription: Deploys app\n---\n# Deployer", { status: 200 }));
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }) as unknown as typeof fetch;

    const reg = new GithubRegistry({ sources: ["test-org/test-repo"] });
    const res = await reg.listSkills({ includeDescription: true });

    expect(res.data).toHaveLength(2);
    expect(res.data[0]?.name).toBe("Code Review");
    expect(res.data[0]?.description).toBe("Reviews code");
    expect(res.pagination?.total).toBe(2);
  });

  test("searchSkills finds skills and ranks exact matches highest", async () => {
    globalThis.fetch = ((url: string) => {
      if (url.includes("/git/trees/main")) {
        return Promise.resolve(new Response(JSON.stringify({
          tree: [
            { path: "skills/test/SKILL.md", type: "blob" },
            { path: "skills/test-runner/SKILL.md", type: "blob" },
            { path: "skills/other-test/SKILL.md", type: "blob" },
          ],
        }), { status: 200 }));
      }
      if (url.includes("SKILL.md")) {
        return Promise.resolve(new Response("---\ndescription: Runs testing suite\n---\n# Description", { status: 200 }));
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }) as unknown as typeof fetch;

    const reg = new GithubRegistry({ sources: ["test-org/test-repo"] });
    const res = await reg.searchSkills({ query: "test" });

    expect(res.data.length).toBeGreaterThanOrEqual(1);
    expect(res.data[0]?.slug).toBe("test");
  });

  test("searchSkills throws error when query < 2 characters", async () => {
    const reg = new GithubRegistry();
    let error: Error | null = null;
    try {
      await reg.searchSkills({ query: "a" });
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).toContain("search query must be at least 2 characters");
  });

  test("loadSkill fetches and parses SKILL.md and supporting files", async () => {
    globalThis.fetch = ((url: string) => {
      if (url.includes("/git/trees/main")) {
        return Promise.resolve(new Response(JSON.stringify({
          tree: [
            { path: "skills/code-review/SKILL.md", type: "blob" },
            { path: "skills/code-review/rules.json", type: "blob" },
          ],
        }), { status: 200 }));
      }
      if (url.includes("SKILL.md")) {
        return Promise.resolve(new Response("---\nname: Code Review\n---\n# Content", { status: 200 }));
      }
      if (url.includes("rules.json")) {
        return Promise.resolve(new Response("{\"strict\": true}", { status: 200 }));
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }) as unknown as typeof fetch;

    const reg = new GithubRegistry({ sources: ["test-org/test-repo"] });
    const detail = await reg.loadSkill("test-org/test-repo/code-review");

    expect(detail.name).toBe("Code Review");
    expect(detail.files).toHaveLength(2);
    expect(detail.files[0]?.path).toBe("SKILL.md");
  });

  test("loadSkill throws SkillNotFoundError when skill does not exist", async () => {
    globalThis.fetch = (() => Promise.resolve(new Response("Not Found", { status: 404 }))) as unknown as typeof fetch;

    const reg = new GithubRegistry({ sources: ["test-org/test-repo"] });
    let error: Error | null = null;
    try {
      await reg.loadSkill("test-org/test-repo/nonexistent");
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeInstanceOf(SkillNotFoundError);
  });
});
