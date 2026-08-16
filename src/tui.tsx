import type {TuiPluginModule} from "@opencode-ai/plugin/tui";
import {resolveTuiIdentity} from "./tui/identity";
import {registerGoalsFooter} from "./tui/register-goals-footer";
import {registerThrottleFooter} from "./tui/register-throttle-footer";
import type {TuiApi} from "./tui/types";

const tui = async (api: TuiApi) => {
    const identity = await resolveTuiIdentity(api);
    await registerThrottleFooter(api, identity);
    registerGoalsFooter(api, identity);
};

const BeanieTuiPlugin: TuiPluginModule = {id: "opencode-beanie", tui};

export default BeanieTuiPlugin;
