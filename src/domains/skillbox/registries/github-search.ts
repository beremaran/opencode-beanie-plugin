import {TtlCache} from "../cache";
import {extractDescription, parseSkillFrontmatter} from "../frontmatter";
import {httpGetText} from "../http";
import {dirBase, extractDirs, type TreeEntry} from "./github-tree";

export interface FrontmatterInfo {
  name?: string;
  description?: string;
  raw?: string;
}

export interface SearchMatch {
  rank: number;
  source: number;
  name: string;
  owner: string;
  repo: string;
  dir: string;
  description?: string;
}

export interface CollectContext {
  parsed: { owner: string; repo: string };
  si: number;
  lq: string;
  incDesc: boolean;
  fmCache: TtlCache<string, FrontmatterInfo>;
}

const FRONTMATTER_TTL_MS = 60 * 60 * 1000;
export const SEARCH_CANDIDATE_LIMIT = 100;

export function rankMatch(name: string, query: string): number {
  if (name === query) {
    return 0;
  }
  if (name.startsWith(query)) {
    return 1;
  }

  return name.includes(query) ? 2 : 3;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function loadFm(url: string): Promise<FrontmatterInfo> {
  const raw = await httpGetText(url);

  return { ...parseSkillFrontmatter(raw), raw };
}

export async function fetchFrontmatter(
  owner: string,
  repo: string,
  branch: string,
  dir: string,
  cache: TtlCache<string, FrontmatterInfo>,
): Promise<FrontmatterInfo> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodePath(dir)}/SKILL.md`;
  const cached = cache.get(url);

  if (cached) {
    return cached;
  }
  try {
    const info = await loadFm(url);

    cache.set(url, info, FRONTMATTER_TTL_MS);

    return info;
  } catch {
    return {};
  }
}

function checkMatch(
  info: FrontmatterInfo,
  dir: string,
  lq: string,
  base: { rank: number; source: number; owner: string; repo: string; dir: string },
  incDesc: boolean,
): SearchMatch | null {
  const name = info.name ?? dirBase(dir);
  const desc = info.description ?? (info.raw ? extractDescription(info.raw) : "");
  const n = name.toLowerCase();

  if (n.includes(lq) || desc.toLowerCase().includes(lq)) {
    return { ...base, name, rank: rankMatch(n, lq), description: incDesc ? desc : undefined };
  }

  return null;
}

async function processDir(
  dir: string,
  ctx: CollectContext,
  branch: string,
): Promise<SearchMatch | null> {
  const info = await fetchFrontmatter(ctx.parsed.owner, ctx.parsed.repo, branch, dir, ctx.fmCache);

  return checkMatch(info, dir, ctx.lq, { rank: 3, source: ctx.si, ...ctx.parsed, dir }, ctx.incDesc);
}

export async function collectMatches(
  ctx: CollectContext,
  tree: { entries: TreeEntry[]; branch: string },
  matches: SearchMatch[],
  startCount: number,
): Promise<number> {
  let count = startCount;

  for (const dir of extractDirs(tree.entries)) {
    if (count >= SEARCH_CANDIDATE_LIMIT) {
      return count;
    }
    count += 1;
    const match = await processDir(dir, ctx, tree.branch);

    if (match) {
      matches.push(match);
    }
  }

  return count;
}
