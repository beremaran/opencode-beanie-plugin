/** @jsxImportSource @opentui/solid */
import {createSignal} from "solid-js";
import type {TuiPluginModule, TuiSlotContext} from "@opencode-ai/plugin/tui";
import type {JSX} from "@opentui/solid";
import {goalsSnapshotPath} from "./domains/goals/path";
import {readGoalsState, type GoalsIdentity, type GoalsTuiState} from "./domains/goals/tui-state";
import {renderGoalsStatus} from "./domains/goals/tui-view";
import {watchGoalsSnapshot} from "./domains/goals/tui-watch";

type TuiApi = Parameters<NonNullable<TuiPluginModule["tui"]>>[0];
type SidebarFooterProps = {session_id: string};

const watchSession = (
    api: TuiApi, id: string, sessionID: string, isCurrent: () => boolean,
    setState: (state: GoalsTuiState | undefined) => void,
) => {
    const path = goalsSnapshotPath(api.state.path.worktree, id, sessionID);

    const identity: GoalsIdentity = {projectID: id, sessionID};

    const refresh = () => void readGoalsState(path, identity).then((next) => {
        if (isCurrent()) {
            setState(next);
        }
    });

    refresh();

    return watchGoalsSnapshot(path, refresh);
};

type GoalsController = {select: (sessionID: string) => void; dispose: () => void};
type SessionState = {session?: string; stopWatching?: () => void; generation: number};

const createGoalsController = (api: TuiApi, id: string, setState: (state: GoalsTuiState | undefined) => void): GoalsController =>
    createSessionController(api, id, setState);

const selectSession = (state: SessionState, api: TuiApi, id: string, setState: (state: GoalsTuiState | undefined) => void, sessionID: string) => {
    if (sessionID === state.session) {
        return;
    }

    state.session = sessionID;

    const selectedGeneration = ++state.generation;

    state.stopWatching?.();

    setState(undefined);

    state.stopWatching = watchSession(api, id, sessionID, () => {
        return state.generation === selectedGeneration;
    }, setState);
};

const disposeSession = (state: SessionState) => {
    state.generation++;

    state.stopWatching?.();
};

const createSessionController = (api: TuiApi, id: string, setState: (state: GoalsTuiState | undefined) => void): GoalsController => {
    const state: SessionState = {generation: 0};

    return {
        select: (sessionID) => {
            selectSession(state, api, id, setState, sessionID);
        },
        dispose: () => {
            disposeSession(state);
        },
    };
};

export const createGoalsFooter = (api: TuiApi, id: string) => {
    const [state, setState] = createSignal<GoalsTuiState | undefined>();

    const controller = createGoalsController(api, id, setState);

    api.lifecycle.onDispose(controller.dispose);
    return (_context: TuiSlotContext, props: SidebarFooterProps): JSX.Element => {
        controller.select(props.session_id);
        return renderGoalsStatus(state());
    };
};

export const emptyGoalsFooter: (_context: TuiSlotContext, _props: SidebarFooterProps) => JSX.Element = () =>
    renderGoalsStatus(undefined) as never;
