import type {DecompositionChild} from "./decomposition";

const keys = ["title", "objective", "constraints", "verification"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const clean = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function validateFields(raw: Record<string, unknown>, index: number, maxEntries: number, errors: string[]) {
  for (const key of Object.keys(raw)) {if (!keys.includes(key)) {errors.push(`children[${String(index)}].${key} is not allowed`);}}

  const fields = keys.map((key) => raw[key]);

  if (!clean(fields[0]) || !clean(fields[1])) {errors.push(`children[${String(index)}] title and objective must be non-empty strings`);}

  const arrays = fields.slice(2).map((field) => Array.isArray(field) && field.length <= maxEntries && field.every(clean));

  if (!arrays[0] || !arrays[1]) {errors.push(`children[${String(index)}] constraints and verification must be string arrays`);}
  return {fields, arrays};
}

function contentValues(fields: unknown[]) {
  const listValues = fields.slice(2).flatMap((field): string[] => Array.isArray(field) ? field.filter((item): item is string => clean(item)) : []);

  return fields.slice(0, 2).concat(listValues).map((field) => typeof field === "string" ? field : "");
}

export function parseChild(raw: unknown, index: number, max: number, maxEntries: number, errors: string[]): DecompositionChild | undefined {
  if (!isRecord(raw)) {errors.push(`children[${String(index)}] must be an object`); return undefined;}

  const {fields, arrays} = validateFields(raw, index, maxEntries, errors);

  if (contentValues(fields).some((field) => field.length > max)) {errors.push(`children[${String(index)}] contains excessive content`);}
  if (!clean(fields[0]) || !clean(fields[1]) || !arrays[0] || !arrays[1]) {return undefined;}
  return {title: fields[0], objective: fields[1], constraints: fields[2] as string[], verification: fields[3] as string[]};
}
