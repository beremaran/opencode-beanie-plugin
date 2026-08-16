import type {FanOutMode} from "./model";
import {parseChild} from "./decomposition-child";

export type DecompositionChild = {readonly title: string; readonly objective: string; readonly constraints: readonly string[]; readonly verification: readonly string[]};
export type Decomposition = {readonly children: readonly DecompositionChild[]};
export type DecompositionLimits = {readonly fanOut: number; readonly fanOutMode: FanOutMode; readonly maxChars?: number; readonly maxFieldChars?: number; readonly maxArrayEntries?: number; readonly maxAggregateChars?: number};
export type ParseResult = {ok: true; value: Decomposition} | {ok: false; errors: readonly string[]};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

function validateLimits(limits: DecompositionLimits): string[] {
  const errors: string[] = [];

  if (!positiveInteger(limits.fanOut)) {errors.push("fanOut must be a positive integer");}

  const mode: unknown = (limits as {readonly fanOutMode: unknown}).fanOutMode;

  if (mode !== "exact" && mode !== "atMost") {errors.push("fanOutMode must be exact or atMost");}

  for (const [name, value] of [["maxChars", limits.maxChars], ["maxFieldChars", limits.maxFieldChars], ["maxArrayEntries", limits.maxArrayEntries], ["maxAggregateChars", limits.maxAggregateChars]] as const) {
    if (value !== undefined && !positiveInteger(value)) {
      errors.push(`${name} must be a positive integer`);
    }
  }

  return errors;
}

function checkFanOut(count: number, limits: DecompositionLimits, errors: string[]): void {
  const mode = limits.fanOutMode as string;

  if (count === 0 || (mode === "exact" && count !== limits.fanOut) || (mode === "atMost" && count > limits.fanOut)) {
    errors.push("child count violates fan-out");
  }
}

function hasRootExtras(raw: Record<string, unknown>, errors: string[]): void {
  for (const key of Object.keys(raw)) {
    if (key !== "children") {errors.push(`root.${key} is not allowed`);}
  }
}

export function parseCoordinatorDecomposition(text: string, limits: DecompositionLimits): ParseResult {
  const response = parseResponse(text, limits);

  if (!("raw" in response)) {return response;}

  const {raw, errors} = response;

  hasRootExtras(raw, errors);
  return finishParse(raw, limits, errors);
}

function finishParse(raw: Record<string, unknown> & {children: unknown[]}, limits: DecompositionLimits, errors: string[]): ParseResult {
  const max = limits.maxFieldChars ?? 4000;

  const maxEntries = limits.maxArrayEntries ?? 64;

  const maxAggregate = limits.maxAggregateChars ?? 12000;

  if (raw.children.length > maxEntries) {errors.push("children contains excessive entries");}

  const children = parseChildren(raw.children, max, maxEntries, maxAggregate, errors);
  checkFanOut(raw.children.length, limits, errors);
  return errors.length ? {ok: false, errors} : {ok: true, value: {children}};
}

function parseResponse(text: string, limits: DecompositionLimits): {raw: Record<string, unknown> & {children: unknown[]}; errors: string[]} | ParseResult {
  const errors = validateLimits(limits);

  if (limits.maxChars !== undefined && text.length > limits.maxChars) {errors.push("response contains excessive content");}

  let raw: unknown;

  try {raw = JSON.parse(text);} catch {return {ok: false, errors: ["response is not valid JSON"]};}
  if (!isRecord(raw) || !Array.isArray(raw.children)) {return {ok: false, errors: [...errors, "response must be an object with a children array"]};}
  return {raw: raw as Record<string, unknown> & {children: unknown[]}, errors};
}

function parseChildren(raw: unknown[], max: number, maxEntries: number, maxAggregate: number, errors: string[]) {
  const children = raw.slice(0, maxEntries).map((child, index) => parseChild(child, index, max, maxEntries, errors)).filter((child): child is DecompositionChild => child !== undefined);

  const aggregate = children.reduce((total, child) => total + child.title.length + child.objective.length + child.constraints.reduce((sum, value) => sum + value.length, 0) + child.verification.reduce((sum, value) => sum + value.length, 0), 0);

  if (aggregate > maxAggregate) {errors.push("children contain excessive aggregate content");}

  const identities = children.map((child) => `${child.title.trim().toLowerCase()}\u0000${child.objective.trim().toLowerCase()}`);

  if (new Set(identities).size !== identities.length) {errors.push("children must not contain duplicates");}
  return children;
}
