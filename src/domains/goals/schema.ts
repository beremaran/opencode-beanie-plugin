import {tool} from "@opencode-ai/plugin";
import type {GoalStatus} from "./model";

const MAX_TEXT = 2_000;

const MAX_ITEMS = 20;

const MAX_ITEM = 500;

export const statuses = ["active", "paused", "blocked", "completed", "cancelled"] as const;
export const bounded = () => tool.schema.string().trim().max(MAX_TEXT);
export const nonEmpty = () => bounded().min(1);
export const boundedList = () => tool.schema.array(tool.schema.string().trim().min(1).max(MAX_ITEM)).max(MAX_ITEMS);
export const maxItems = MAX_ITEMS;
export type Status = GoalStatus;
