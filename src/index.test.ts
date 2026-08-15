import { expect, test } from "bun:test";
import type { Config, PluginInput } from "@opencode-ai/plugin";
import BeaniePlugin from "./index";

test("aggregates registered domain hooks", async () => {
  const hooks = await BeaniePlugin({} as PluginInput);

  expect(hooks.tool?.goal_set).toBeDefined();
  expect(hooks.tool?.goal_status).toBeDefined();
  expect(hooks.tool?.goal_update).toBeDefined();
});

test("runs both domain config hooks", async () => {
  const hooks = await BeaniePlugin({} as PluginInput);
  const config = {} as Config;

  await hooks.config?.(config);

  expect(config.command?.goal?.template).toContain("goal tools");
  expect(config.agent?.title?.disable).toBe(true);
});
