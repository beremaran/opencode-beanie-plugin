import {
  type ListSkillsOptions,
  type SearchSkillsOptions,
  type SkillDetail,
  type SkillListResult,
  type SkillRegistry,
  type SkillSummary,
  RegistryAuthError,
  SkillNotFoundError,
} from "../types";
import {TtlCache} from "../cache";
import {extractDescription} from "../frontmatter";
import {httpGetJson, HttpError} from "../http";
import {isSkillMd} from "../payload";
import {capSkillFiles} from "./github-files";
import {
  extractFiles,
  mapListResponse,
  mapSearchResponse,
  pickNumber,
  pickString,
} from "./skills-sh-mapping";

const DEFAULT_BASE_URL = "https://skills.sh";

const DEFAULT_MAX_BYTES = 50_000;

const DEFAULT_PAGE_SIZE = 20;

const DEFAULT_SEARCH_LIMIT = 10;

const LIST_TTL_MS = 10 * 60 * 1000;

const SEARCH_TTL_MS = 5 * 60 * 1000;

const DETAIL_TTL_MS = 60 * 60 * 1000;

const ENRICH_LIMIT = 10;

const HTTP_UNAUTHORIZED = 401;

const HTTP_NOT_FOUND = 404;

function parseId(id: string): { source: string; slug: string } {
  const parts = id.split("/");

  const [first, second, ...rest] = parts;

  if (parts.length >= 3) {
    return { source: `${first ?? ""}/${second ?? ""}`, slug: rest.join("/") };
  }

  return { source: first ?? "", slug: second ?? "" };
}

function buildDetail(raw: Record<string, unknown>, id: string, source: string, slug: string, maxBytes: number): SkillDetail {
  const files = extractFiles(raw);

  if (!files.some((f) => isSkillMd(f.path))) {
    throw new SkillNotFoundError(`SKILL.md not found in ${id}`);
  }
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

export class SkillsShRegistry implements SkillRegistry {
  private readonly token: string;

  private readonly baseUrl: string;

  private readonly maxBytes: number;

  private readonly listCache = new TtlCache<string, SkillListResult>();

  private readonly searchCache = new TtlCache<string, SkillListResult>();

  private readonly detailCache = new TtlCache<string, SkillDetail>();

  constructor(opts: { token?: string; baseUrl?: string; maxBytes?: number }) {
    if (!opts.token) {
      throw new RegistryAuthError("skills.sh registry requires an API token");
    }
    this.token = opts.token;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  async listSkills(opts: ListSkillsOptions = {}): Promise<SkillListResult> {
    const view = opts.view ?? "all-time";

    const page = opts.page ?? 1;

    const perPage = opts.perPage ?? DEFAULT_PAGE_SIZE;

    const key = `list:${view}:${String(page)}:${String(perPage)}:${String(opts.includeDescription)}`;

    const cached = this.listCache.get(key);

    if (cached) {
      return cached;
    }

    const params = new URLSearchParams({ view, page: String(page), perPage: String(perPage) });

    const body = await this.request(`${this.baseUrl}/api/v1/skills?${params.toString()}`);

    const result = mapListResponse(body, page, perPage);

    if (opts.includeDescription) {
      await this.enrich(result.data);
    }
    this.listCache.set(key, result, LIST_TTL_MS);

    return result;
  }

  async searchSkills(opts: SearchSkillsOptions): Promise<SkillListResult> {
    const query = opts.query.trim();

    if (query.length < 2) {
      throw new Error("search query must be at least 2 characters");
    }

    const limit = opts.limit ?? DEFAULT_SEARCH_LIMIT;

    const key = `search:${query}:${String(limit)}:${opts.owner ?? ""}:${String(opts.includeDescription)}`;

    const cached = this.searchCache.get(key);

    if (cached) {
      return cached;
    }

    const result = await this.executeSearch(query, limit, opts.owner);

    if (opts.includeDescription) {
      await this.enrich(result.data);
    }
    this.searchCache.set(key, result, SEARCH_TTL_MS);

    return result;
  }

  async loadSkill(id: string): Promise<SkillDetail> {
    const { source, slug } = parseId(id);

    const key = `detail:${source}:${slug}`;

    const cached = this.detailCache.get(key);

    if (cached) {
      return cached;
    }

    const url = `${this.baseUrl}/api/v1/skills/${encodeURIComponent(source)}/${encodeURIComponent(slug)}`;

    const raw = (await this.request(url)) as Record<string, unknown>;

    const detail = buildDetail(raw, id, source, slug, this.maxBytes);

    this.detailCache.set(key, detail, DETAIL_TTL_MS);

    return detail;
  }

  private async executeSearch(query: string, limit: number, owner?: string) {
    const params = new URLSearchParams({ q: query, limit: String(limit) });

    if (owner) {
      params.set("owner", owner);
    }

    const body = await this.request(`${this.baseUrl}/api/v1/skills/search?${params.toString()}`);

    return mapSearchResponse(body, limit);
  }

  private async request(url: string): Promise<unknown> {
    try {
      return await httpGetJson(url, { headers: { Authorization: `Bearer ${this.token}` } });
    } catch (error) {
      if (error instanceof HttpError && error.status === HTTP_UNAUTHORIZED) {
        throw new RegistryAuthError(`skills.sh registry authentication failed for ${url}`);
      }
      if (error instanceof HttpError && error.status === HTTP_NOT_FOUND) {
        throw new SkillNotFoundError(`skill not found: ${url}`);
      }
      throw error;
    }
  }

  private async enrich(items: SkillSummary[]): Promise<void> {
    await Promise.all(
      items.slice(0, ENRICH_LIMIT).map(async (item) => {
        try {
          const detail = await this.loadSkill(`${item.source}/${item.slug}`);

          const file = detail.files.find((f) => isSkillMd(f.path));

          if (file) {
            item.description = extractDescription(file.contents);
          }
        } catch {
          // best-effort enrichment
        }
      }),
    );
  }
}
