import type {Hooks} from "@opencode-ai/plugin";

type CommandHook = NonNullable<Hooks["command.execute.before"]>;
type ToolBeforeHook = NonNullable<Hooks["tool.execute.before"]>;
type ToolAfterHook = NonNullable<Hooks["tool.execute.after"]>;
type CompactingHook = NonNullable<Hooks["experimental.session.compacting"]>;
type ToolDefinitionHook = NonNullable<Hooks["tool.definition"]>;
type SystemTransformHook = NonNullable<Hooks["experimental.chat.system.transform"]>;

function collect<T>(hooks: Hooks[], select: (hook: Hooks) => T | undefined) {
    return hooks.flatMap((hook) => {
        const selected = select(hook);

        return selected ? [selected] : [];
    });
}

export function composeCommandHooks(hooks: Hooks[]) {
    const selected = collect(hooks, (hook) => hook["command.execute.before"]);

    if (selected.length === 0) {return;}

    return async (...args: Parameters<CommandHook>) => {
        for (const hook of selected) {await hook(...args);}
    };
}

export function composeToolBeforeHooks(hooks: Hooks[]) {
    const selected = collect(hooks, (hook) => hook["tool.execute.before"]);

    if (selected.length === 0) {return;}

    return async (...args: Parameters<ToolBeforeHook>) => {
        for (const hook of selected) {await hook(...args);}
    };
}

export function composeToolAfterHooks(hooks: Hooks[]) {
    const selected = collect(hooks, (hook) => hook["tool.execute.after"]);

    if (selected.length === 0) {return;}

    return async (...args: Parameters<ToolAfterHook>) => {
        for (const hook of selected) {await hook(...args);}
    };
}

export function composeCompactingHooks(hooks: Hooks[]) {
    const selected = collect(hooks, (hook) => hook["experimental.session.compacting"]);

    if (selected.length === 0) {return;}

    return async (...args: Parameters<CompactingHook>) => {
        for (const hook of selected) {await hook(...args);}
    };
}

export function composeToolDefinitionHooks(hooks: Hooks[]) {
    const selected = collect(hooks, (hook) => hook["tool.definition"]);

    if (selected.length === 0) {return;}

    return async (...args: Parameters<ToolDefinitionHook>) => {
        for (const hook of selected) {await hook(...args);}
    };
}

export function composeSystemTransformHooks(hooks: Hooks[]) {
    const selected = collect(hooks, (hook) => hook["experimental.chat.system.transform"]);

    if (selected.length === 0) {return;}

    return async (...args: Parameters<SystemTransformHook>) => {
        for (const hook of selected) {await hook(...args);}
    };
}

function composeEventHooks(hooks: Hooks[]) {
    const selected = collect(hooks, (hook) => hook.event);

    if (selected.length === 0) {return;}

    return async (input: Parameters<NonNullable<Hooks["event"]>>[0]) => {
        for (const hook of selected) {await hook(input);}
    };
}

function composeDisposeHooks(hooks: Hooks[]) {
    const selected = collect(hooks, (hook) => hook.dispose);

    if (selected.length === 0) {return;}

    return async () => {
        for (const hook of selected) {await hook();}
    };
}

function composeConfigHooks(hooks: Hooks[]) {
    const selected = collect(hooks, (hook) => hook.config);

    if (selected.length === 0) {return;}

    return async (config: Parameters<NonNullable<Hooks["config"]>>[0]) => {
        for (const hook of selected) {await hook(config);}
    };
}

function mergeTools(hooks: Hooks[]) {
    const tools: NonNullable<Hooks["tool"]> = {};

    for (const hook of hooks) {
        for (const [name, definition] of Object.entries(hook.tool ?? {})) {
            if (name in tools) {throw new Error(`Duplicate tool name: ${name}`);}

            tools[name] = definition;
        }
    }

    return Object.keys(tools).length > 0 ? tools : undefined;
}

export function mergeHooks(hooks: Hooks[]) {
  const merged: Hooks = {};

  for (const hook of hooks) {Object.assign(merged, hook);}
  assignComposedHooks(merged, hooks);
  return merged;
}

function assignToolAndChatHooks(merged: Hooks, hooks: Hooks[]) {
  const tools = mergeTools(hooks);

  const before = composeToolBeforeHooks(hooks);

  const after = composeToolAfterHooks(hooks);

  const toolDef = composeToolDefinitionHooks(hooks);

  const systemTransform = composeSystemTransformHooks(hooks);

  if (tools) {merged.tool = tools;}
  if (before) {merged["tool.execute.before"] = before;}
  if (after) {merged["tool.execute.after"] = after;}
  if (toolDef) {merged["tool.definition"] = toolDef;}
  if (systemTransform) {merged["experimental.chat.system.transform"] = systemTransform;}
}

function assignComposedHooks(merged: Hooks, hooks: Hooks[]) {
  assignToolAndChatHooks(merged, hooks);
  const command = composeCommandHooks(hooks);

  const compacting = composeCompactingHooks(hooks);

  const event = composeEventHooks(hooks);

  const dispose = composeDisposeHooks(hooks);

  const config = composeConfigHooks(hooks);

  if (command) {merged["command.execute.before"] = command;}
  if (compacting) {merged["experimental.session.compacting"] = compacting;}
  if (event) {merged.event = event;}
  if (dispose) {merged.dispose = dispose;}
  if (config) {merged.config = config;}
}
