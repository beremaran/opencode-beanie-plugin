import type {SkillDetail, SkillSummary} from "../types";
import {SkillNotFoundError} from "../types";
import {extractDescription} from "../frontmatter";
import {isSkillMd} from "../payload";
import {capSkillFiles} from "./github-files";
import {extractFiles, pickNumber, pickString} from "./skills-sh-mapping";

export function parseSkillShId(id: string): { source: string; slug: string } {
  const parts = id.split("/");

  const [first, second, ...rest] = parts;

  if (parts.length >= 3) {
    return { source: `${first ?? ""}/${second ?? ""}`, slug: rest.join("/") };
  }
  return { source: first ?? "", slug: second ?? "" };
}

export function buildSkillShDetail(
  raw: Record<string, unknown>,
  id: string,
  source: string,
  slug: string,
  maxBytes: number,
): SkillDetail {
  const files = extractFiles(raw);

  if (!files.some((f) => isSkillMd(f.path))) {throw new SkillNotFoundError(`SKILL.md not found in ${id}`);}
  capSkillFiles(files, maxBytes);

  return {
    id: pickString(raw, "id") ?? id,
    name: pickString(raw, "name") ?? slug,
    slug: pickString(raw, "slug") ?? slug,
    source: pickString(raw, "source") ?? source,
    installs: pickNumber(raw, "installs"),
    hash: typeof raw.hash === "string" ? raw.hash : null,
    files,
  };
}

export async function enrichSkillItem(
  item: SkillSummary,
  loadDetail: (id: string) => Promise<SkillDetail>,
): Promise<void> {
  try {
    const detail = await loadDetail(`${item.source}/${item.slug}`);

    const file = detail.files.find((f) => isSkillMd(f.path));

    if (file) {
      item.description = extractDescription(file.contents);
    }
  } catch {
    // best-effort enrichment
  }
}
