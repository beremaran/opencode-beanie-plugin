/** @jsxImportSource @opentui/solid */
import type {JSX} from "@opentui/solid";
import type {GoalSnapshotGoal} from "../domains/goals/snapshot";
import {Empty, HealthRows, Panel, statusColor, type PanelColors} from "./panels";
import {createSnapshotStore} from "./snapshot-store";
import type {TuiApi, TuiDashboardSnapshot, TuiIdentity} from "./types";

const value = (item: string | number | undefined, empty = "—") => item ?? empty;

const sessionIdFrom = (api: TuiApi, params?: Record<string, unknown>): string | undefined => {
    const param = params?.sessionID ?? params?.sessionId;

    if (typeof param === "string" && param.length > 0) {return param;}

    const current = api.route.current;

    const currentParam = "params" in current ? current.params?.sessionID : undefined;

    return typeof currentParam === "string" && currentParam.length > 0 ? currentParam : undefined;
};

const ActivityPanel = (props: {snapshot: TuiDashboardSnapshot; colors: PanelColors}): JSX.Element => (
    <Panel title="ACTIVITY" colors={props.colors}>
        <text fg={props.colors.text}>
            Status:{" "}
            <span style={{fg: statusColor(props.colors, props.snapshot.session.status ?? "")}}>
                {value(props.snapshot.session.status, "unknown")}
            </span>
        </text>
        <text fg={props.colors.textMuted}>{value(props.snapshot.session.slug, "Untitled session")}</text>
        <text fg={props.colors.textMuted}>
            Pending: {props.snapshot.pending.permissionCount} permissions · {props.snapshot.pending.questionCount} prompts
        </text>
    </Panel>
);

const WorkPanel = (props: {snapshot: TuiDashboardSnapshot; colors: PanelColors}): JSX.Element => (
    <Panel title="WORK" colors={props.colors}>
        <text fg={props.colors.text}>
            Todos: {props.snapshot.todos.counts.inProgress} active · {props.snapshot.todos.counts.pending} pending
        </text>
        <text fg={props.colors.textMuted}>
            Done {props.snapshot.todos.counts.completed} · {props.snapshot.todos.counts.cancelled} cancelled
        </text>
        <text fg={props.colors.text}>
            Diff: <span style={{fg: props.colors.success}}>+{props.snapshot.diff.additions}</span>{" "}
            <span style={{fg: props.colors.error}}>-{props.snapshot.diff.deletions}</span> · {props.snapshot.diff.count} files
        </text>
        {props.snapshot.todos.items.length === 0 && <Empty>No todos recorded</Empty>}
    </Panel>
);

const goalDetail = (goal: GoalSnapshotGoal): string | undefined =>
    goal.status === "blocked" ? goal.blocker : goal.progress ?? goal.nextAction;

export const GoalsPanel = (props: {goal: GoalSnapshotGoal | undefined; colors: PanelColors}): JSX.Element => {
    const goal = props.goal;

    const detail = goal ? goalDetail(goal) : undefined;

    return (
        <Panel title="GOALS" colors={props.colors}>
            <text fg={props.colors.text}>
                <span style={{fg: statusColor(props.colors, goal?.status ?? "")}}>{goal?.status ?? "none"}</span>{" "}
                {goal ? goal.outcome : "No goal is set for this session."}
            </text>
            {detail ? <text fg={props.colors.textMuted}>{detail.slice(0, 72)}</text> : <Empty>No progress reported</Empty>}
        </Panel>
    );
};

const ThrottlePanel = (props: {snapshot: TuiDashboardSnapshot; colors: PanelColors}): JSX.Element => (
    <Panel title="THROTTLE" colors={props.colors}>
        <text fg={props.colors.text}>
            Active: {props.snapshot.throttle?.active ?? 0}/{props.snapshot.throttle?.capacity ?? 0} ·
            Queued: {props.snapshot.throttle?.queued ?? 0}
        </text>
        <text fg={props.colors.textMuted}>
            Foreground: {props.snapshot.throttle?.foreground ?? 0} · Background: {props.snapshot.throttle?.background ?? 0}
        </text>
    </Panel>
);

const EnvironmentPanel = (props: {snapshot: TuiDashboardSnapshot; colors: PanelColors}): JSX.Element => (
    <Panel title="ENVIRONMENT" colors={props.colors}>
        <text fg={props.colors.text}>
            Providers: {props.snapshot.providers.count} · Model: {value(props.snapshot.providers.defaultModel, "not configured")}
        </text>
        <text fg={props.colors.textMuted}>
            VCS: {value(props.snapshot.vcs.branch, "no branch")} · Path: {value(props.snapshot.path, "unknown")}
        </text>
    </Panel>
);

const HealthPanels = (props: {snapshot: TuiDashboardSnapshot; colors: PanelColors}): JSX.Element => (
    <box flexDirection="row" flexWrap="wrap" gap={1}>
        <Panel title="HEALTH / MCP" colors={props.colors}>
            <text fg={props.colors.textMuted}>{props.snapshot.mcp.healthy}/{props.snapshot.mcp.count} connected</text>
            <HealthRows summary={props.snapshot.mcp} colors={props.colors} />
        </Panel>
        <Panel title="HEALTH / LSP" colors={props.colors}>
            <text fg={props.colors.textMuted}>{props.snapshot.lsp.healthy}/{props.snapshot.lsp.count} connected</text>
            <HealthRows summary={props.snapshot.lsp} colors={props.colors} />
        </Panel>
    </box>
);

const EmptySessionBox = (props: {colors: PanelColors}): JSX.Element => (
    <box border={true} borderColor={props.colors.borderSubtle} padding={1} flexGrow={1}>
        <text fg={props.colors.text}>Waiting for session data.</text>
    </box>
);

const SessionPanels = (props: {snapshot: () => TuiDashboardSnapshot | undefined; colors: PanelColors}): JSX.Element => {
    const snap = props.snapshot();

    if (!snap) {return <EmptySessionBox colors={props.colors} />;}

    return (
        <box flexDirection="column" flexGrow={1} gap={1}>
            <box flexDirection="row" flexWrap="wrap" gap={1}>
                <ActivityPanel snapshot={snap} colors={props.colors} />
                <WorkPanel snapshot={snap} colors={props.colors} />
            </box>
            <box flexDirection="row" flexWrap="wrap" gap={1}>
                <GoalsPanel goal={snap.goals?.goal} colors={props.colors} />
                <ThrottlePanel snapshot={snap} colors={props.colors} />
            </box>
            <HealthPanels snapshot={snap} colors={props.colors} />
            <EnvironmentPanel snapshot={snap} colors={props.colors} />
        </box>
    );
};

const DashboardContent = (props: {
    snapshot: (() => TuiDashboardSnapshot | undefined) | undefined
    colors: PanelColors
}): JSX.Element =>
    props.snapshot ? (
        <SessionPanels snapshot={props.snapshot} colors={props.colors} />
    ) : (
        <box border={true} borderColor={props.colors.borderSubtle} padding={1} flexGrow={1}>
            <text fg={props.colors.text}>Select a session to inspect its dashboard.</text>
            <Empty>Session-scoped activity, work, health, and environment appear here.</Empty>
        </box>
    );

export const Dashboard = (props: {api: TuiApi; identity?: TuiIdentity; sessionId?: string}): JSX.Element => {
    const colors = props.api.theme.current;

    const store = createSnapshotStore(props.api, props.identity);

    const snapshot = props.sessionId ? store.snapshot(props.sessionId) : undefined;

    return (
        <box flexDirection="column" backgroundColor={colors.background} flexGrow={1} padding={1} gap={1}>
            <box flexDirection="row" justifyContent="space-between" flexWrap="wrap">
                <text fg={colors.text}>
                    Beanie <span style={{fg: colors.accent}}>/ dashboard</span>
                </text>
                <text fg={colors.textMuted}>{props.sessionId ? `session ${props.sessionId}` : "No active session"}</text>
            </box>
            <DashboardContent snapshot={snapshot} colors={colors} />
        </box>
    );
};

export const registerDashboardRoute = (api: TuiApi, identity?: TuiIdentity) => {
    const unregister = api.route.register([
        {
            name: "beanie.dashboard",
            render: ({params}): JSX.Element => <Dashboard api={api} identity={identity} sessionId={sessionIdFrom(api, params)} />,
        },
    ]);

    api.lifecycle.onDispose(unregister);
};
