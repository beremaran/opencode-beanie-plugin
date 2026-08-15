import { expect, test } from "bun:test";
import type { Config, Hooks, PluginInput } from "@opencode-ai/plugin";
import { PapercutsDomain } from "./index";

const input = {} as PluginInput;

function configHook(hooks: Hooks) {
  if (!hooks.config) {
    throw new Error("Papercuts config hook was not registered");
  }

  return hooks.config;
}

test("disables OpenCode title generation", async () => {
  const hooks = await PapercutsDomain(input);
  const config = {} as Config;

  await configHook(hooks)(config);

  expect(config.agent?.title?.disable).toBe(true);
});

test("preserves unrelated agent and title settings", async () => {
  const hooks = await PapercutsDomain(input);
  const agent = { reviewer: { description: "Keep me" }, title: { template: "Keep me", disable: false } };
  const config = { agent } as unknown as Config;

  await configHook(hooks)(config);

  expect(config.agent?.reviewer?.description).toBe("Keep me");
  expect(config.agent?.title).toMatchObject({ template: "Keep me", disable: true });
});
