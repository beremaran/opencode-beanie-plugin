import type {Hooks, Plugin} from "@opencode-ai/plugin";
import {GoalsDomain} from "./domains/goals";
import {PapercutsDomain} from "./domains/papercuts";
import {ThrottleDomain} from "./domains/throttle";

const domains = [GoalsDomain, PapercutsDomain, ThrottleDomain];

export const BeaniePlugin: Plugin = async (input, options) => {
    const hooks = await Promise.all(
        domains.map((domain) => domain(input, options)),
    );

    const mergedHooks: Hooks = {};

    for (const hook of hooks) {
        Object.assign(mergedHooks, hook);
    }

    const eventHooks = hooks.flatMap((hook) => hook.event ? [hook.event] : []);

    if (eventHooks.length > 0) {
        mergedHooks.event = async (input) => {
            for (const eventHook of eventHooks) {
                await eventHook(input);
            }
        };
    }

    const disposeHooks = hooks.flatMap((hook) => hook.dispose ? [hook.dispose] : []);

    if (disposeHooks.length > 0) {
        mergedHooks.dispose = async () => {
            for (const disposeHook of disposeHooks) {
                await disposeHook();
            }
        };
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
