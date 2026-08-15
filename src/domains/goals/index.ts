import type { Domain } from "../../shared/domain";
import { tool } from "@opencode-ai/plugin";

export type GoalStatus = "active" | "paused" | "blocked" | "completed" | "cancelled"

export type Goal = {
  id: string
  sessionID: string
  version: number
  createdAt: string
  updatedAt: string
  completedAt?: string
  status: GoalStatus
  outcome: string
  constraints: string[]
  verificationCriteria: string[]
  verificationEvidence: string[]
  progress?: string
  nextAction?: string
  blocker?: string
}

const MAX_TEXT = 2_000;

const MAX_ITEMS = 20;

const MAX_ITEM = 500;

const bounded = () => tool.schema.string().trim().max(MAX_TEXT);

const nonEmpty = () => bounded().min(1);

const boundedList = () => tool.schema.array(tool.schema.string().trim().min(1).max(MAX_ITEM)).max(MAX_ITEMS);

const statuses = ["active", "paused", "blocked", "completed", "cancelled"] as const;

const json = (value: unknown) => JSON.stringify(value);

const error = (message: string) => json({ error: { code: "invalid_goal_update", message } });

const now = () => new Date().toISOString();

function canTransition(from: GoalStatus, to: GoalStatus) {
  if (from === "completed" || from === "cancelled") {
    return false;
  }

  if (from === "active") {
    return ["active", "paused", "blocked", "completed", "cancelled"].includes(to);
  }

  if (from === "paused") {
    return ["paused", "active", "cancelled"].includes(to);
  }

  return ["blocked", "active", "cancelled"].includes(to);
}

function updateGoal(goal: Goal, args: UpdateArgs) {
  if (goal.status === "completed" || goal.status === "cancelled") {
    return error("Terminal goals cannot be updated; use goal_set to replace them.");
  }

  const status = args.status ?? goal.status;

  if (!canTransition(goal.status, status)) {
    return error(`Cannot transition ${goal.status} to ${status}.`);
  }

  const blocker = args.blocker?.trim() || goal.blocker;

  if (status === "blocked" && !blocker) {
    return error("A blocker is required when setting a goal to blocked.");
  }

  const verificationEvidence = args.verificationEvidence?.length
    ? [...goal.verificationEvidence, ...args.verificationEvidence]
    : goal.verificationEvidence;

  if (verificationEvidence.length > MAX_ITEMS) {
    return error(`verificationEvidence cannot contain more than ${String(MAX_ITEMS)} items.`);
  }
  if (status === "completed" && verificationEvidence.length === 0) {
    return error("Non-empty verificationEvidence is required when completing a goal.");
  }

  const timestamp = now();
  goal.status = status;
  goal.updatedAt = timestamp;
  goal.progress = args.progress ?? goal.progress;
  goal.nextAction = args.nextAction ?? goal.nextAction;
  goal.blocker = status === "blocked" ? blocker : undefined;
  goal.verificationEvidence = verificationEvidence;
  goal.completedAt = status === "completed" ? timestamp : undefined;
  return json({ goal });
}

type UpdateArgs = {
  status?: GoalStatus
  progress?: string
  nextAction?: string
  blocker?: string
  verificationEvidence?: string[]
}

export const GoalsDomain: Domain = () => {
  // Deliberately process-lifetime only: this store is not durable across plugin restarts.
  const goals = new Map<string, Goal>();

  const goalSet = tool({
    description: "Create or replace this session's process-memory goal. State is lost when the plugin restarts.",
    args: {
      outcome: nonEmpty().describe("Required desired outcome."),
      constraints: boundedList().optional().describe("Optional constraints."),
      verification: boundedList().optional().describe("Optional verification criteria."),
    },
    execute(args, context) {
      const timestamp = now();

      const goal: Goal = {
        id: crypto.randomUUID(), sessionID: context.sessionID, version: 1,
        createdAt: timestamp, updatedAt: timestamp, status: "active",
        outcome: args.outcome, constraints: args.constraints ?? [],
        verificationCriteria: args.verification ?? [], verificationEvidence: [],
      };
      goals.set(context.sessionID, goal);
      return Promise.resolve(json({ goal }));
    },
  });

  const goalStatus = tool({
    description: "Return the complete current process-memory goal for this session, or null.",
    args: {},
    execute(_args, context) { return Promise.resolve(json({ goal: goals.get(context.sessionID) ?? null })); },
  });

  const goalUpdate = tool({
    description: "Update the current goal's bounded progress, next action, blocker, evidence, or lifecycle status.",
    args: {
      progress: bounded().optional(), nextAction: bounded().optional(), blocker: bounded().optional(),
      verificationEvidence: boundedList().optional(), status: tool.schema.enum(statuses).optional(),
    },
    execute(args, context) {
      const goal = goals.get(context.sessionID);

      if (!goal) {
        return Promise.resolve(error("No goal exists for this session; use goal_set first."));
      }

      return Promise.resolve(updateGoal(goal, args));
    },
  });

  return Promise.resolve({
    tool: { goal_set: goalSet, goal_status: goalStatus, goal_update: goalUpdate },
    config: (config) => {
      // Preserve a user-defined command.goal; this domain only fills the missing command.
      if (!config.command?.goal) {
        config.command = {
          ...config.command,
          goal: {
            description: "Review and maintain the session goal using goal_status, goal_set, and goal_update.",
            template: "Use the goal tools to inspect or update the current goal. Do not claim completion without verification evidence.",
          },
        };
      }

      return Promise.resolve();
    },
    "experimental.session.compacting": (input, output) => {
      const goal = goals.get(input.sessionID);

      if (!goal) {
        return Promise.resolve();
      }

      output.context.push(`Goal recovery (process-memory; may be lost after restart): ${json({ id: goal.id, status: goal.status, outcome: goal.outcome, constraints: goal.constraints, progress: goal.progress, blocker: goal.blocker, verificationCriteria: goal.verificationCriteria, verificationEvidence: goal.verificationEvidence, nextAction: goal.nextAction })}`.slice(0, 1_500));
      return Promise.resolve();
    },
    event: ({ event }) => {
      if (event.type === "session.deleted") {
        goals.delete(event.properties.info.id);
      }
      return Promise.resolve();
    },
    dispose: () => { goals.clear(); return Promise.resolve(); },
  });
};
