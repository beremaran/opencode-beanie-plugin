import {TtlCache} from "../cache";
import {httpGetJson, HttpError} from "../http";
import {isSkillMd} from "../payload";

export interface TreeEntry {
  path?: string;
  type?: string;
}

const BRANCHES: readonly string[] = ["main", "master"];
const TREE_TTL_MS = 60 * 60 * 1000;
const HTTP_NOT_FOUND = 404;

export function dirBase(dir: string): string {
  return dir.split("/").at(-1) ?? dir;
}

export function extractDirs(entries: TreeEntry[]): string[] {
  const dirs = entries
    .filter((e) => typeof e.path === "string" && isSkillMd(e.path))
    .map((e) => (e.path ?? "").split("/").slice(0, -1).join("/"))
    .filter(Boolean);

  return [...new Set(dirs)].sort();
}

export function splitSource(source: string): { owner: string; repo: string } | null {
  const [owner, repo] = source.split("/");

  return owner && repo ? { owner, repo } : null;
}

export function resolveDir(entries: TreeEntry[], slug: string): string | null {
  const dirs = extractDirs(entries);

  return dirs.find((d) => d === slug) ?? dirs.find((d) => dirBase(d) === slug) ?? null;
}

async function fetchBranchTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
): Promise<TreeEntry[] | null> {
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const body = await httpGetJson<{ tree?: TreeEntry[] }>(url, { headers });

    return body.tree ?? [];
  } catch (err) {
    if (err instanceof HttpError && err.status === HTTP_NOT_FOUND) {
      return null;
    }
    throw err;
  }
}

function getCachedTree(
  key: string,
  branches: Map<string, string>,
  trees: TtlCache<string, TreeEntry[]>,
): { entries: TreeEntry[]; branch: string } | null {
  const known = branches.get(key);

  if (!known) {
    return null;
  }
  const cached = trees.get(`tree:${key}:${known}`);

  return cached ? { entries: cached, branch: known } : null;
}

async function resolveBranchTree(
  owner: string,
  repo: string,
  token?: string,
): Promise<{ entries: TreeEntry[]; branch: string } | null> {
  for (const branch of BRANCHES) {
    const entries = await fetchBranchTree(owner, repo, branch, token);

    if (entries !== null) {
      return { entries, branch };
    }
  }

  return null;
}

export async function fetchTree(
  owner: string,
  repo: string,
  token: string | undefined,
  trees: TtlCache<string, TreeEntry[]>,
  branches: Map<string, string>,
): Promise<{ entries: TreeEntry[]; branch: string } | null> {
  const key = `${owner}/${repo}`;
  const existing = getCachedTree(key, branches, trees);

  if (existing) {
    return existing;
  }
  const result = await resolveBranchTree(owner, repo, token);

  if (result) {
    branches.set(key, result.branch);
    trees.set(`tree:${key}:${result.branch}`, result.entries, TREE_TTL_MS);
  }

  return result;
}
