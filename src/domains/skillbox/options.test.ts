import {describe, expect, test} from "bun:test";
import {resolveSkillboxOptions} from "./options";

describe("options", () => {
  test("resolves nested options object", () => {
    const opts = resolveSkillboxOptions({
      skillbox: {
        registry: "skills-sh",
        skillsShToken: "token123",
        githubToken: "gh_tok",
        githubSources: ["foo/bar", "baz/qux"],
        maxBytes: 12345,
        debug: true,
      },
    }, {});

    expect(opts.registry).toBe("skills-sh");
    expect(opts.skillsShToken).toBe("token123");
    expect(opts.githubToken).toBe("gh_tok");
    expect(opts.githubSources).toEqual(["foo/bar", "baz/qux"]);
    expect(opts.maxBytes).toBe(12345);
    expect(opts.debug).toBe(true);
  });

  test("falls back to top-level options", () => {
    const opts = resolveSkillboxOptions({
      registry: "github",
      githubSources: "a/b, c/d",
      maxBytes: "4000",
      debug: "true",
    }, {});

    expect(opts.registry).toBe("github");
    expect(opts.githubSources).toEqual(["a/b", "c/d"]);
    expect(opts.maxBytes).toBe(4000);
    expect(opts.debug).toBe(true);
  });

  test("falls back to environment variables", () => {
    const env = {
      SKILL_REGISTRY: "auto",
      SKILLS_SH_TOKEN: "env-tok",
      SKILL_GITHUB_SOURCES: "org/repo1, org/repo2",
      GITHUB_TOKEN: "gh-env-tok",
      SKILL_MAX_BYTES: "50000",
      SKILL_DEBUG: "1",
    };
    const opts = resolveSkillboxOptions(undefined, env);

    expect(opts.registry).toBe("auto");
    expect(opts.skillsShToken).toBe("env-tok");
    expect(opts.githubSources).toEqual(["org/repo1", "org/repo2"]);
    expect(opts.githubToken).toBe("gh-env-tok");
    expect(opts.maxBytes).toBe(50000);
    expect(opts.debug).toBe(true);
  });

  test("ignores invalid values gracefully", () => {
    const opts = resolveSkillboxOptions({
      registry: "invalid-mode",
      maxBytes: -10,
      githubSources: "",
    }, {});

    expect(opts.registry).toBeUndefined();
    expect(opts.maxBytes).toBeUndefined();
    expect(opts.githubSources).toBeUndefined();
  });
});
