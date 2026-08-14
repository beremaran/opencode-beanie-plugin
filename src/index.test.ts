import { expect, test } from "bun:test";
import type { PluginInput } from "@opencode-ai/plugin";
import BeaniePlugin from "./index";

test("creates an empty plugin hook set", async () => {
  const hooks = await BeaniePlugin({} as PluginInput);

  expect(hooks).toEqual({});
});
