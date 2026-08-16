import {createScheduler as createSchedulerImpl} from "./scheduler-factory";
import type {Scheduler, SchedulerOptions} from "./scheduler-types";

export function createOrchestratorScheduler(options: SchedulerOptions): Scheduler {
  return createSchedulerImpl(options);
}

export const createScheduler = createOrchestratorScheduler;
