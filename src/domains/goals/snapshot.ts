import type {Goal} from "./model";

export type GoalSnapshot = Readonly<{
    schema: "opencode-beanie.goals.v1"
    projectID: string
    sessionID: string
    active: Readonly<{
        goal: GoalSnapshotGoal | null
    }>
    inactive: boolean
}>;

export type GoalSnapshotGoal = Readonly<Omit<Goal,
    "constraints" | "verificationCriteria" | "verificationEvidence"
>> & Readonly<{
    constraints: readonly string[]
    verificationCriteria: readonly string[]
    verificationEvidence: readonly string[]
}>;

const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);

const copyGoal = (goal: Goal): GoalSnapshotGoal => freeze({
    ...goal,
    constraints: freeze([...goal.constraints]),
    verificationCriteria: freeze([...goal.verificationCriteria]),
    verificationEvidence: freeze([...goal.verificationEvidence]),
});

export const createSnapshot = (projectID: string, goal: Goal): GoalSnapshot => freeze({
    schema: "opencode-beanie.goals.v1",
    projectID,
    sessionID: goal.sessionID,
    active: freeze({goal: copyGoal(goal)}),
    inactive: false,
});
