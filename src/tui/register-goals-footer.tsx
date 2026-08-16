/** @jsxImportSource @opentui/solid */
import {createSignal} from "solid-js";
import type {TuiSlotContext} from "@opencode-ai/plugin/tui";
import type {JSX} from "@opentui/solid";
import {goalsSnapshotPath} from "../domains/goals/path";
import {readGoalsState, type GoalsIdentity, type GoalsReadOutcome, type GoalsTuiState} from "../domains/goals/tui-state";
import {renderGoalsStatus} from "../domains/goals/tui-view";
import {watchGoalsSnapshot} from "../domains/goals/tui-watch";
import type {TuiApi, TuiIdentity} from "./types";

type SidebarFooterProps = {session_id: string};
type ReadGoalsState = (path: string, identity: GoalsIdentity) => Promise<GoalsReadOutcome>;
type WatchGoalsSnapshot = (path: string, onChange: () => void) => () => void;
type GoalsController = {select: (sessionID: string) => void; dispose: () => void};
type SessionState = {session?: string; stopWatching?: () => void; generation: number; readSequence: number};

const applyReadOutcome = (outcome: GoalsReadOutcome, isCurrent: () => boolean, sequence: number,
    latestRead: () => number, setState: (state: GoalsTuiState | undefined) => void) => {
    if (!isCurrent() || sequence !== latestRead()) {return;}
    if (outcome.kind === "missing") {setState(undefined);}
    if (outcome.kind === "valid") {setState(outcome.state);}
};

const createRefresh = (path: string, identity: GoalsIdentity, isCurrent: () => boolean,
    setState: (state: GoalsTuiState | undefined) => void, nextRead: () => number,
    latestRead: () => number, read: ReadGoalsState) => () => {
    const sequence = nextRead();
    void read(path, identity).then((outcome) => {
        applyReadOutcome(outcome, isCurrent, sequence, latestRead, setState);
    });
};

const watchSession = (api: TuiApi, id: string, sessionID: string, isCurrent: () => boolean,
    setState: (state: GoalsTuiState | undefined) => void, nextRead: () => number,
    latestRead: () => number, read: ReadGoalsState, watch: WatchGoalsSnapshot) => {
    const path = goalsSnapshotPath(api.state.path.worktree, id, sessionID);

    const identity: GoalsIdentity = {projectID: id, sessionID};

    const refresh = createRefresh(path, identity, isCurrent, setState, nextRead, latestRead, read);

    refresh();

    return watch(path, refresh);
};

const disposeSession = (state: SessionState) => {
    state.generation++;
    state.readSequence++;
    state.stopWatching?.();
};

const selectSession = (state: SessionState, api: TuiApi, id: string, sessionID: string,
    setState: (state: GoalsTuiState | undefined) => void, read: ReadGoalsState, watch: WatchGoalsSnapshot) => {
    if (sessionID === state.session) {return;}
    state.session = sessionID;
    const generation = ++state.generation;
    state.stopWatching?.();
    setState(undefined);
    state.stopWatching = watchSession(api, id, sessionID, () => state.generation === generation,
        setState, () => ++state.readSequence, () => state.readSequence, read, watch);
};

export const createGoalsController = (api: TuiApi, id: string, setState: (state: GoalsTuiState | undefined) => void,
    read: ReadGoalsState = readGoalsState, watch: WatchGoalsSnapshot = watchGoalsSnapshot): GoalsController => {
    const state: SessionState = {generation: 0, readSequence: 0};

    return {
        select: (sessionID) => {selectSession(state, api, id, sessionID, setState, read, watch);},
        dispose: () => {disposeSession(state);},
    };
};

const emptyFooter = (context: TuiSlotContext, props: SidebarFooterProps): JSX.Element => {
    void context;
    void props;

    return renderGoalsStatus(undefined);
};

export const registerGoalsFooter = (api: TuiApi, identity?: TuiIdentity) => {
    if (!identity) {
        api.slots.register({order: 301, slots: {sidebar_footer: emptyFooter}});

        return;
    }

    const [state, setState] = createSignal<GoalsTuiState | undefined>();

    const controller = createGoalsController(api, identity.projectID, setState);

    const footer = (_context: TuiSlotContext, props: SidebarFooterProps): JSX.Element => {
        controller.select(props.session_id);
        return renderGoalsStatus(state());
    };

    api.slots.register({order: 301, dispose: controller.dispose, slots: {sidebar_footer: footer}});
};
