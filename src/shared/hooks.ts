import type {Hooks} from "@opencode-ai/plugin";

type CommandHook = NonNullable<Hooks["command.execute.before"]>;
type ToolBeforeHook = NonNullable<Hooks["tool.execute.before"]>;
type ToolAfterHook = NonNullable<Hooks["tool.execute.after"]>;
type CompactingHook = NonNullable<Hooks["experimental.session.compacting"]>;

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

function assignComposedHooks(merged: Hooks, hooks: Hooks[]) {
  const tools = mergeTools(hooks), command = composeCommandHooks(hooks), before = composeToolBeforeHooks(hooks), after = composeToolAfterHooks(hooks), compacting = composeCompactingHooks(hooks), event = composeEventHooks(hooks), dispose = composeDisposeHooks(hooks), config = composeConfigHooks(hooks);

  if (tools) {merged.tool = tools;}
  if (command) {merged["command.execute.before"] = command;}
  if (before) {merged["tool.execute.before"] = before;}
  if (after) {merged["tool.execute.after"] = after;}
  if (compacting) {merged["experimental.session.compacting"] = compacting;}
  if (event) {merged.event = event;}
  if (dispose) {merged.dispose = dispose;}
  if (config) {merged.config = config;}
}
