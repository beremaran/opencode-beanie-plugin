import {describe, expect, test} from "bun:test";
import type {PluginInput} from "@opencode-ai/plugin";
import {SkillboxDomain} from "./index";

describe("SkillboxDomain", () => {
  test("registers list_skills, search_skills, and load_skill tools", async () => {
    const input = {
      client: {
        app: {
          log: async () => {},
        },
      },
      worktree: "/workspace",
      project: { id: "p1" },
    } as unknown as PluginInput;

    const hooks = await SkillboxDomain(input, {
      skillbox: { registry: "github" },
    });

    expect(hooks.tool).toBeDefined();
    expect(hooks.tool?.list_skills).toBeDefined();
    expect(hooks.tool?.search_skills).toBeDefined();
    expect(hooks.tool?.load_skill).toBeDefined();
  });
});
