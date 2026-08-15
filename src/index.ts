import type { Hooks, Plugin } from "@opencode-ai/plugin";
import { GoalsDomain } from "./domains/goals";
import { PapercutsDomain } from "./domains/papercuts";

const domains = [GoalsDomain, PapercutsDomain];

export const BeaniePlugin: Plugin = async (input, options) => {
  const hooks = await Promise.all(
    domains.map((domain) => domain(input, options)),
  );

  const mergedHooks: Hooks = {};

  for (const hook of hooks) {
    Object.assign(mergedHooks, hook);
  }

  const configHooks = hooks.flatMap((hook) =>
    hook.config ? [hook.config] : [],
  );

  if (configHooks.length > 0) {
    mergedHooks.config = async (config) => {
      for (const configHook of configHooks) {
        await configHook(config);
      }
    };
  }

  return mergedHooks;
};

export default BeaniePlugin;
