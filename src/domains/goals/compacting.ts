import type {Goal} from "./model";

const json = (value: unknown) => JSON.stringify(value);

export const compactGoal = (goal: Goal | undefined, context: string[]) => {
    if (!goal) {
        return;
    }

    context.push(`Goal recovery (process-memory; may be lost after restart): ${json({
        id: goal.id,
        status: goal.status,
        outcome: goal.outcome,
        constraints: goal.constraints,
        progress: goal.progress,
        blocker: goal.blocker,
        verificationCriteria: goal.verificationCriteria,
        verificationEvidence: goal.verificationEvidence,
        nextAction: goal.nextAction
    })}`.slice(0, 1_500));
};
