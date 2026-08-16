/** @jsxImportSource @opentui/solid */
import {createSignal} from "solid-js";
import type {TuiPluginModule, TuiSlotContext} from "@opencode-ai/plugin/tui";
import type {JSX} from "@opentui/solid";
import {throttleSnapshotPath} from "./domains/throttle/path";
import {readThrottleStatus, type ThrottleStatus} from "./domains/throttle/tui-state";
import {renderThrottleStatus} from "./domains/throttle/tui-view";
import {watchThrottleSnapshot} from "./domains/throttle/tui-watch";
import {createGoalsFooter, emptyGoalsFooter} from "./tui-goals";

type SidebarFooter = (context: TuiSlotContext, props: {session_id: string}) => JSX.Element;
type TuiApi = Parameters<NonNullable<TuiPluginModule["tui"]>>[0];

const projectID = async (api: Parameters<NonNullable<TuiPluginModule["tui"]>>[0]) => {
    try {
        const response = await api.client.v2.location.get({
            location: {directory: api.state.path.worktree},
        });

        return response.data?.project.id;
    } catch {
        return undefined;
    }
};

const createThrottleFooter = (status: () => ThrottleStatus | undefined): SidebarFooter => () => {
    return renderThrottleStatus(status()) as never;
};

const setupThrottle = async (api: TuiApi, id: string, setStatus: (status: ThrottleStatus | undefined) => void) => {
    const path = throttleSnapshotPath(api.state.path.worktree, id);

    setStatus(await readThrottleStatus(path));

    const refresh = () => {
        void readThrottleStatus(path).then(setStatus);
    };

    api.lifecycle.onDispose(watchThrottleSnapshot(path, refresh));
};

const registerFooters = (api: TuiApi, throttleFooter: SidebarFooter, goalsFooter: SidebarFooter) => {
    api.slots.register({
        order: 300,
        slots: {
            sidebar_footer: throttleFooter,
        },
    });
    api.slots.register({
        order: 301,
        slots: {
            sidebar_footer: goalsFooter,
        },
    });
};

const tui = async (api: TuiApi) => {
    const [status, setStatus] = createSignal<ThrottleStatus | undefined>();

    const id = await projectID(api);

    if (id) {
        await setupThrottle(api, id, setStatus);
    }

    registerFooters(api, createThrottleFooter(status), id ? createGoalsFooter(api, id) : emptyGoalsFooter);
};

const BeanieTuiPlugin: TuiPluginModule = {id: "opencode-beanie", tui};

export default BeanieTuiPlugin;
