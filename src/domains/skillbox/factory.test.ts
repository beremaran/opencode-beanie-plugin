import {describe, expect, test} from "bun:test";
import {createRegistry, describeRegistry} from "./registries/factory";
import {GithubRegistry} from "./registries/github";
import {SkillsShRegistry} from "./registries/skills-sh";
import {RegistryAuthError} from "./types";

describe("registry factory", () => {
  test("creates GithubRegistry by default in auto mode without token", () => {
    const registry = createRegistry({});
    expect(registry).toBeInstanceOf(GithubRegistry);

    const desc = describeRegistry({});
    expect(desc.registry).toBe("github");
  });

  test("creates SkillsShRegistry in auto mode when token is provided", () => {
    const registry = createRegistry({ skillsShToken: "secret-tok" });
    expect(registry).toBeInstanceOf(SkillsShRegistry);

    const desc = describeRegistry({ skillsShToken: "secret-tok" });
    expect(desc.registry).toBe("skills-sh");
  });

  test("creates GithubRegistry when explicitly requested", () => {
    const registry = createRegistry({ registry: "github" });
    expect(registry).toBeInstanceOf(GithubRegistry);

    const desc = describeRegistry({ registry: "github" });
    expect(desc.registry).toBe("github");
  });

  test("throws RegistryAuthError when skills-sh is requested without token", () => {
    expect(() => createRegistry({ registry: "skills-sh" })).toThrow(RegistryAuthError);
    expect(() => describeRegistry({ registry: "skills-sh" })).toThrow(RegistryAuthError);
  });
});
