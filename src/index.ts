import type { Hooks, Plugin } from "@opencode-ai/plugin";
import { CommitCommandDomain } from "./domains/commit-command";
import { GoalsDomain } from "./domains/goals";
import { PapercutsDomain } from "./domains/papercuts";
import { ThrottleDomain } from "./domains/throttle";

const domains = [
  CommitCommandDomain,
  GoalsDomain,
  PapercutsDomain,
  ThrottleDomain,
];

type CommandHook = NonNullable<Hooks["command.execute.before"]>;

function collectHooks<T>(
  hooks: Hooks[],
  select: (hook: Hooks) => T | undefined,
) {
  return hooks.flatMap((hook) => {
    const selected = select(hook);

    return selected ? [selected] : [];
  });
}

export function composeCommandHooks(hooks: Hooks[]) {
  const commandHooks = collectHooks(
    hooks,
    (hook) => hook["command.execute.before"],
  );

  if (commandHooks.length === 0) {
    return;
  }

  return async (...args: Parameters<CommandHook>) => {
    for (const commandHook of commandHooks) {
      await commandHook(...args);
    }
  };
}

function composeEventHooks(hooks: Hooks[]) {
  const eventHooks = collectHooks(hooks, (hook) => hook.event);

  if (eventHooks.length === 0) {
    return;
  }

  return async (input: Parameters<NonNullable<Hooks["event"]>>[0]) => {
    for (const eventHook of eventHooks) {
      await eventHook(input);
    }
  };
}

function composeDisposeHooks(hooks: Hooks[]) {
  const disposeHooks = collectHooks(hooks, (hook) => hook.dispose);

  if (disposeHooks.length === 0) {
    return;
  }

  return async () => {
    for (const disposeHook of disposeHooks) {
      await disposeHook();
    }
  };
}

function composeConfigHooks(hooks: Hooks[]) {
  const configHooks = collectHooks(hooks, (hook) => hook.config);

  if (configHooks.length === 0) {
    return;
  }

  return async (config: Parameters<NonNullable<Hooks["config"]>>[0]) => {
    for (const configHook of configHooks) {
      await configHook(config);
    }
  };
}

function assignCommandHook(mergedHooks: Hooks, hooks: Hooks[]) {
  const command = composeCommandHooks(hooks);

  if (command) {
    mergedHooks["command.execute.before"] = command;
  }
}

function assignEventHook(mergedHooks: Hooks, hooks: Hooks[]) {
  const event = composeEventHooks(hooks);

  if (event) {
    mergedHooks.event = event;
  }
}

function assignDisposeHook(mergedHooks: Hooks, hooks: Hooks[]) {
  const dispose = composeDisposeHooks(hooks);

  if (dispose) {
    mergedHooks.dispose = dispose;
  }
}

function assignConfigHook(mergedHooks: Hooks, hooks: Hooks[]) {
  const config = composeConfigHooks(hooks);

  if (config) {
    mergedHooks.config = config;
  }
}

function mergeHooks(hooks: Hooks[]) {
  const mergedHooks: Hooks = {};

  for (const hook of hooks) {
    Object.assign(mergedHooks, hook);
  }

  assignCommandHook(mergedHooks, hooks);
  assignEventHook(mergedHooks, hooks);
  assignDisposeHook(mergedHooks, hooks);
  assignConfigHook(mergedHooks, hooks);

  return mergedHooks;
}

async function loadDomainHooks(
  input: Parameters<Plugin>[0],
  options: Parameters<Plugin>[1],
) {
  return Promise.all(domains.map((domain) => domain(input, options)));
}

export const BeaniePlugin: Plugin = async (input, options) => {
  const hooks = await loadDomainHooks(input, options);

  return mergeHooks(hooks);
};

export default BeaniePlugin;
