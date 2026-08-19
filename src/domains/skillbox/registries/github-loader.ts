import type {SkillFile, SkillSummary} from "../types";
import {SkillNotFoundError} from "../types";
import {extractDescription} from "../frontmatter";
import {isSkillMd} from "../payload";
import {dirBase, type TreeEntry} from "./github-tree";
import {fetchFrontmatter, type FrontmatterInfo} from "./github-search";
import {fetchSkillFiles} from "./github-files";
import type {TtlCache} from "../cache";

export function toSummary(source: string, dir: string, name: string, description?: string): SkillSummary {
  const result: SkillSummary = {
    id: `${source}/${dirBase(dir)}`,
    name,
    slug: dirBase(dir),
    source,
    sourceType: "github",
    installUrl: `https://github.com/${source}`,
  };

  if (description !== undefined) {
    result.description = description;
  }
  return result;
}

export async function loadDirFiles(
  owner: string,
  repo: string,
  tree: { entries: TreeEntry[]; branch: string },
  dir: string,
  id: string,
): Promise<SkillFile[]> {
  const under = tree.entries.filter((e) => typeof e.path === "string" && e.path.startsWith(`${dir}/`));

  if (!under.some((e) => isSkillMd(e.path ?? ""))) {
    throw new SkillNotFoundError(`Skill not found: ${id}`);
  }
  return fetchSkillFiles(owner, repo, tree.branch, dir, under);
}

export async function buildGithubSummary(
  owner: string,
  repo: string,
  branch: string,
  dir: string,
  incDesc: boolean,
  fmCache: TtlCache<string, FrontmatterInfo>,
): Promise<SkillSummary> {
  const info = await fetchFrontmatter(owner, repo, branch, dir, fmCache);

  const name = info.name ?? dirBase(dir);

  const desc = incDesc ? (info.description ?? (info.raw ? extractDescription(info.raw) : undefined)) : undefined;

  return toSummary(`${owner}/${repo}`, dir, name, desc);
}
