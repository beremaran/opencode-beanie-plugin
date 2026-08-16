/** @jsxImportSource @opentui/solid */
import {createSignal} from "solid-js";
import {throttleSnapshotPath} from "../domains/throttle/path";
import {readThrottleStatus, type ThrottleStatus} from "../domains/throttle/tui-state";
import {renderThrottleStatus} from "../domains/throttle/tui-view";
import {watchThrottleSnapshot} from "../domains/throttle/tui-watch";
import type {SidebarFooter, TuiApi, TuiIdentity} from "./types";

const createFooter = (status: () => ThrottleStatus | undefined): SidebarFooter => () => renderThrottleStatus(status()) as never;

const setup = async (api: TuiApi, identity: TuiIdentity, setStatus: (status: ThrottleStatus | undefined) => void) => {
    const path = throttleSnapshotPath(identity.worktree, identity.projectID);

    setStatus(await readThrottleStatus(path));
    const refresh = () => void readThrottleStatus(path).then(setStatus);

    return watchThrottleSnapshot(path, refresh);
};

export const registerThrottleFooter = async (api: TuiApi, identity?: TuiIdentity) => {
    const [status, setStatus] = createSignal<ThrottleStatus | undefined>();

    const dispose = identity ? await setup(api, identity, setStatus) : undefined;

    api.slots.register({
        order: 300,
        ...(dispose ? {dispose} : {}),
        slots: {sidebar_footer: createFooter(status)},
    });
};
