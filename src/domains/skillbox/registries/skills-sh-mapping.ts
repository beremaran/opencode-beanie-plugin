import type {SkillFile, SkillListResult, SkillSummary} from "../types";
import {isSkillMd} from "../payload";

export function pickString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];

  return typeof val === "string" ? val : undefined;
}

export function pickNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const val = obj[key];

  return typeof val === "number" && Number.isFinite(val) ? val : undefined;
}

export function pickBoolean(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const val = obj[key];

  return typeof val === "boolean" ? val : fallback;
}

export function pickArray(obj: Record<string, unknown>, key: string): unknown[] | undefined {
  const val = obj[key];

  return Array.isArray(val) ? val : undefined;
}

export function mapToSummary(x: Record<string, unknown>): SkillSummary {
  const source = pickString(x, "source") ?? "";

  const slug = pickString(x, "slug") ?? "";

  const installs = pickNumber(x, "installs");

  const installUrl = pickString(x, "installUrl");

  const url = pickString(x, "url");

  return {
    id: pickString(x, "id") ?? `${source}/${slug}`,
    name: pickString(x, "name") ?? slug,
    slug,
    source,
    sourceType: pickString(x, "sourceType") === "well-known" ? "well-known" : "github",
    ...(installs !== undefined && { installs }),
    ...(installUrl && { installUrl }),
    ...(url && { url }),
  };
}

export function mapListResponse(body: unknown, page: number, perPage: number): SkillListResult {
  const raw = (body ?? {}) as Record<string, unknown>;

  const rows = pickArray(raw, "data") ?? pickArray(raw, "skills") ?? [];

  const data = rows.map((x) => mapToSummary(x as Record<string, unknown>));

  const p = (raw.pagination ?? {}) as Record<string, unknown>;

  const total = pickNumber(p, "total");

  return {
    data,
    pagination: {
      page: pickNumber(p, "page") ?? page,
      perPage: pickNumber(p, "perPage") ?? perPage,
      hasMore: pickBoolean(p, "hasMore", data.length >= perPage),
      ...(total !== undefined && { total }),
    },
  };
}

export function mapSearchResponse(body: unknown, limit: number): SkillListResult {
  const raw = (body ?? {}) as Record<string, unknown>;

  const rows = pickArray(raw, "data") ?? pickArray(raw, "results") ?? [];

  const data = rows.map((x) => mapToSummary(x as Record<string, unknown>));

  const p = (raw.pagination ?? {}) as Record<string, unknown>;

  const total = pickNumber(raw, "count") ?? pickNumber(p, "total");

  return {
    data,
    pagination: {
      page: pickNumber(p, "page") ?? 1,
      perPage: pickNumber(p, "perPage") ?? limit,
      hasMore: pickBoolean(p, "hasMore", data.length >= limit),
      ...(total !== undefined && { total }),
    },
  };
}

export function extractFiles(raw: Record<string, unknown>): SkillFile[] {
  const list = pickArray(raw, "files") ?? [];

  const files: SkillFile[] = [];

  for (const entry of list) {
    if (typeof entry === "object" && entry !== null) {
      const f = entry as Record<string, unknown>;

      if (typeof f.path === "string" && typeof f.contents === "string") {
        files.push({ path: f.path, contents: f.contents });
      }
    }
  }

  return files.sort((a, b) => Number(!isSkillMd(a.path)) - Number(!isSkillMd(b.path)) || a.path.localeCompare(b.path));
}
