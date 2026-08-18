/** @jsxImportSource @opentui/solid */
import type {JSX} from "@opentui/solid";
import type {GoalSnapshotGoal} from "./snapshot";
import type {GoalsTuiState} from "./tui-state";

const detailLimit = 72;

const statusColor = (status: GoalSnapshotGoal["status"]) =>
    status === "blocked" || status === "cancelled" ? "red" :
        status === "paused" || status === "budget_limited" || status === "turn_limited" ? "yellow" : "green";

const detail = (goal: GoalSnapshotGoal): [string, string] | undefined => {
    const value = goal.status === "blocked" ? goal.blocker : goal.progress ?? goal.nextAction;

    if (!value) {return undefined;}
    return [goal.status === "blocked" ? "blocker" : goal.progress ? "progress" : "next", value.slice(0, detailLimit)];
};

const goalText = (state: GoalsTuiState, goalDetail: [string, string] | undefined): JSX.Element => (
    <text truncate>
        <span style={{fg: "cyan"}}>Goal</span>
        {" "}
        <span style={{fg: statusColor(state.goal.status)}}>{state.goal.status}</span>
        {" - "}
        {state.goal.outcome}
        {goalDetail ? " · " : ""}
        {goalDetail ? <span style={{fg: goalDetail[0] === "blocker" ? "red" : "magenta"}}>{goalDetail[0]}{": "}{goalDetail[1]}</span> : ""}
    </text>
);

export const renderGoalsStatus = (state: GoalsTuiState | undefined): JSX.Element => {
    if (!state) {return <box height={0}/>;}
    return (
        <box height={1} paddingLeft={1} paddingRight={1}>
            {goalText(state, detail(state.goal))}
        </box>
    );
};
