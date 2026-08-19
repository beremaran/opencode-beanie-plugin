import type {TuiPluginModule} from "@opencode-ai/plugin/tui";
import {registerAttentionPolicy} from "./tui/attention";
import {registerDashboardRoute} from "./tui/dashboard";
import {registerGoalControls} from "./tui/goal-controls";
import {resolveTuiIdentity} from "./tui/identity";
import {registerDashboardNavigation} from "./tui/navigation";
import {registerGoalsFooter} from "./tui/register-goals-footer";
import {registerThrottleFooter} from "./tui/register-throttle-footer";
import type {TuiApi} from "./tui/types";

const tui = async (api: TuiApi) => {
    const identity = await resolveTuiIdentity(api);
    await registerThrottleFooter(api, identity);
    registerGoalsFooter(api, identity);
    registerAttentionPolicy(api);
    registerDashboardRoute(api, identity);
    registerDashboardNavigation(api);
    registerGoalControls(api);
};

const BeanieTuiPlugin: TuiPluginModule = {id: "opencode-beanie", tui};

export default BeanieTuiPlugin;
