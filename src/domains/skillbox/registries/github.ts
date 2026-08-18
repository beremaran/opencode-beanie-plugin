import {
  type ListSkillsOptions,
  type SearchSkillsOptions,
  type SkillDetail,
  type SkillFile,
  type SkillListResult,
  type SkillRegistry,
  type SkillSummary,
  SkillNotFoundError,
} from "../types";
import {TtlCache} from "../cache";
import {extractDescription, parseSkillFrontmatter} from "../frontmatter";
import {isSkillMd} from "../payload";
import {DEFAULT_GITHUB_SOURCES} from "./factory";
import {
  dirBase,
  extractDirs,
  fetchTree,
  resolveDir,
  splitSource,
  type TreeEntry,
} from "./github-tree";
import {
  collectMatches,
  fetchFrontmatter,
  type FrontmatterInfo,
  type SearchMatch,
  SEARCH_CANDIDATE_LIMIT,
} from "./github-search";
import {capSkillFiles, fetchSkillFiles} from "./github-files";

const DEFAULT_MAX_BYTES = 50_000;
const DEFAULT_PER_PAGE = 20;
const DEFAULT_SEARCH_LIMIT = 10;

function toSummary(source: string, dir: string, name: string, description?: string): SkillSummary {
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

async function loadDirFiles(
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

export class GithubRegistry implements SkillRegistry {
  private readonly sources: string[];

  private readonly maxBytes: number;

  private readonly token?: string;

  private readonly trees = new TtlCache<string, TreeEntry[]>();

  private readonly frontmatter = new TtlCache<string, FrontmatterInfo>();

  private readonly branches = new Map<string, string>();

  constructor(opts: { sources?: string[]; maxBytes?: number; token?: string } = {}) {
    this.sources = opts.sources ?? [...DEFAULT_GITHUB_SOURCES];
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    this.token = opts.token;
  }

  async listSkills(opts: ListSkillsOptions = {}): Promise<SkillListResult> {
    const page = opts.page ?? 0;
    const perPage = opts.perPage ?? DEFAULT_PER_PAGE;
    const allSummaries: SkillSummary[] = [];

    for (const source of this.sources) {
      await this.collectSourceSummaries(source, opts.includeDescription ?? false, allSummaries);
    }
    const start = page * perPage;
    const data = allSummaries.slice(start, start + perPage);

    return {
      data,
      pagination: {
        page,
        perPage,
        total: allSummaries.length,
        hasMore: start + perPage < allSummaries.length,
      },
    };
  }

  async searchSkills(opts: SearchSkillsOptions): Promise<SkillListResult> {
    const q = opts.query.trim();

    if (q.length < 2) {
      throw new Error("search query must be at least 2 characters");
    }
    const matches = await this.findMatches(q.toLowerCase(), opts.owner, opts.includeDescription ?? false);
    const limit = opts.limit ?? DEFAULT_SEARCH_LIMIT;

    return {
      data: matches.slice(0, limit).map((m) => toSummary(`${m.owner}/${m.repo}`, m.dir, m.name, m.description)),
    };
  }

  async loadSkill(id: string): Promise<SkillDetail> {
    const parts = id.split("/");

    if (parts.length < 2) {
      throw new SkillNotFoundError(`Skill not found: ${id}`);
    }
    const [owner, repo, ...rest] = parts;
    const slug = rest.join("/");
    const tree = await fetchTree(owner ?? "", repo ?? "", this.token, this.trees, this.branches);
    const dir = tree ? resolveDir(tree.entries, slug) : null;

    if (!tree || !dir) {
      throw new SkillNotFoundError(`Skill not found: ${id}`);
    }
    const files = await loadDirFiles(owner ?? "", repo ?? "", tree, dir, id);

    capSkillFiles(files, this.maxBytes);
    const md = files.find((f) => isSkillMd(f.path));
    const name = md ? parseSkillFrontmatter(md.contents).name ?? slug : slug;

    return { id, name, slug, source: `${owner ?? ""}/${repo ?? ""}`, files };
  }

  private async buildSummary(owner: string, repo: string, branch: string, dir: string, incDesc: boolean) {
    const info = await fetchFrontmatter(owner, repo, branch, dir, this.frontmatter);
    const name = info.name ?? dirBase(dir);
    const desc = incDesc ? (info.description ?? (info.raw ? extractDescription(info.raw) : undefined)) : undefined;

    return toSummary(`${owner}/${repo}`, dir, name, desc);
  }

  private async collectSourceSummaries(source: string, incDesc: boolean, out: SkillSummary[]) {
    const parsed = splitSource(source);

    if (!parsed) {
      return;
    }
    const tree = await fetchTree(parsed.owner, parsed.repo, this.token, this.trees, this.branches);

    if (!tree) {
      return;
    }
    for (const dir of extractDirs(tree.entries)) {
      out.push(await this.buildSummary(parsed.owner, parsed.repo, tree.branch, dir, incDesc));
    }
  }

  private async findMatches(lq: string, ownerFilter: string | undefined, incDesc: boolean): Promise<SearchMatch[]> {
    const matches: SearchMatch[] = [];
    let candidates = 0;

    for (const [idx, source] of this.sources.entries()) {
      if (candidates >= SEARCH_CANDIDATE_LIMIT) {
        break;
      }
      const parsed = splitSource(source);

      if (parsed && (!ownerFilter || parsed.owner.toLowerCase() === ownerFilter.toLowerCase())) {
        const tree = await fetchTree(parsed.owner, parsed.repo, this.token, this.trees, this.branches);

        if (tree) {
          candidates = await collectMatches({ parsed, si: idx, lq, incDesc, fmCache: this.frontmatter }, tree, matches, candidates);
        }
      }
    }
    matches.sort((a, b) => a.rank - b.rank || a.source - b.source || a.name.localeCompare(b.name));

    return matches;
  }
}
