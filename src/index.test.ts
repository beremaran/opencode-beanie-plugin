import { expect, test } from "bun:test";
import type { PluginInput } from "@opencode-ai/plugin";
import BeaniePlugin from "./index";

test("aggregates registered goal hooks", async () => {
  const hooks = await BeaniePlugin({} as PluginInput);

  expect(hooks.tool?.goal_set).toBeDefined();
  expect(hooks.tool?.goal_status).toBeDefined();
  expect(hooks.tool?.goal_update).toBeDefined();
});
