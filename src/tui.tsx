/** @jsxImportSource @opentui/solid */
import {createSignal} from "solid-js";
import type {TuiPluginModule} from "@opencode-ai/plugin/tui";
import type {JSX} from "@opentui/solid";
import {throttleSnapshotPath} from "./domains/throttle/path";
import {readThrottleStatus, type ThrottleStatus} from "./domains/throttle/tui-state";
import {renderThrottleStatus} from "./domains/throttle/tui-view";
import {watchThrottleSnapshot} from "./domains/throttle/tui-watch";

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

const tui = async (api: Parameters<NonNullable<TuiPluginModule["tui"]>>[0]) => {
    const [status, setStatus] = createSignal<ThrottleStatus | undefined>();

    const renderFooter = (): JSX.Element => {
        const rendered: unknown = renderThrottleStatus(status());

        return rendered as JSX.Element;
    };

    const id = await projectID(api);

    if (id) {
        const path = throttleSnapshotPath(api.state.path.worktree, id);

        setStatus(await readThrottleStatus(path));

        const refresh = () => {
            void readThrottleStatus(path).then(setStatus);
        };

        const stopWatching = watchThrottleSnapshot(path, refresh);

        api.lifecycle.onDispose(stopWatching);
    }

    api.slots.register({
        order: 300,
        slots: {
            sidebar_footer: renderFooter,
        },
    });
};

const BeanieTuiPlugin: TuiPluginModule = {id: "opencode-beanie", tui};

export default BeanieTuiPlugin;
