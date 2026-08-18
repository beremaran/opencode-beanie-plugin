import {
  type SkillDetail,
  type SkillFile,
  type SkillSummary,
  SkillNotFoundError,
  RegistryAuthError,
} from "./types";
import {HttpError} from "./http";

export interface FileWithSize extends SkillFile {
  sizeBytes: number;
}

export const isSkillMd = (path: string) => /(^|\/)skill\.md$/i.test(path);

export function byteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

export function truncateBytes(str: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return "";
  }

  const encoder = new TextEncoder();

  const encoded = encoder.encode(str);

  if (encoded.length <= maxBytes) {
    return str;
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });

  return decoder.decode(encoded.slice(0, maxBytes));
}

export function formatSummary(item: SkillSummary, includeDescription = false): Record<string, unknown> {
  const desc = includeDescription && item.description !== undefined ? { description: item.description } : {};

  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    source: item.source,
    sourceType: item.sourceType,
    ...(item.installs !== undefined && { installs: item.installs }),
    ...(item.installUrl && { installUrl: item.installUrl }),
    ...(item.url && { url: item.url }),
    ...desc,
  };
}

function budgetFiles(files: FileWithSize[], maxBytes: number): { files: FileWithSize[]; truncated: boolean } {
  let remaining = maxBytes;

  let truncated = false;

  const result: FileWithSize[] = [];

  for (const file of files) {
    if (file.sizeBytes <= remaining) {
      result.push(file);
      remaining -= file.sizeBytes;
    } else if (remaining > 0) {
      const contents = truncateBytes(file.contents, remaining);

      result.push({ path: file.path, contents, sizeBytes: byteLength(contents) });
      remaining = 0;
      truncated = true;
    } else {
      truncated = true;
    }
  }

  return { files: result, truncated };
}

function prepareFiles(detail: SkillDetail, includeSupportingFiles: boolean): FileWithSize[] {
  let files = detail.files.map((f) => ({ ...f, sizeBytes: byteLength(f.contents) }));

  if (!includeSupportingFiles) {
    files = files.filter((f) => isSkillMd(f.path));
  }

  return files.sort((a, b) => Number(!isSkillMd(a.path)) - Number(!isSkillMd(b.path)) || a.path.localeCompare(b.path));
}

export function formatLoadPayload(
  detail: SkillDetail,
  includeSupportingFiles = false,
  maxBytes?: number,
): string {
  const files = prepareFiles(detail, includeSupportingFiles);

  const budgeted = maxBytes !== undefined ? budgetFiles(files, maxBytes) : { files, truncated: false };

  const payload: Record<string, unknown> = {
    id: detail.id,
    name: detail.name,
    source: detail.source,
    files: budgeted.files,
    ...(detail.installs !== undefined && { installs: detail.installs }),
    ...(budgeted.truncated && { truncated: true }),
  };

  return JSON.stringify(payload, null, 2);
}

export function formatToolError(error: unknown, id?: string): string {
  if (error instanceof SkillNotFoundError) {
    return JSON.stringify({ error: id ? `Skill not found: ${id}` : error.message }, null, 2);
  }
  if (error instanceof RegistryAuthError) {
    return JSON.stringify({ error: `Registry authentication error: ${error.message}` }, null, 2);
  }
  if (error instanceof HttpError) {
    return JSON.stringify({ error: `HTTP ${String(error.status)}: ${error.message}` }, null, 2);
  }

  const message = error instanceof Error ? error.message : String(error);

  return JSON.stringify({ error: message }, null, 2);
}
