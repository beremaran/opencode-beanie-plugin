import { TtlCache } from '../cache.js'
import { extractDescription } from '../frontmatter.js'
import { HttpError, httpGetJson } from '../http.js'
import {
  type ListSkillsOptions,
  RegistryAuthError,
  type SearchSkillsOptions,
  type SkillDetail,
  type SkillFile,
  type SkillListResult,
  SkillNotFoundError,
  type SkillRegistry,
  type SkillSummary,
} from '../types.js'

const md = (path: string) => path.toLowerCase() === 'skill.md'
const marker = (bytes: number) => `\n[...truncated: ${bytes} bytes omitted]\n`
const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength
function cap(files: SkillFile[], max: number): void {
  const total = () => files.reduce((n, f) => n + byteLength(f.contents), 0)
  if (total() <= max) return
  const main = files.find((f) => md(f.path))
  if (main && byteLength(main.contents) > max) {
    files
      .filter((f) => f !== main)
      .forEach((f) => {
        f.contents = ''
      })
    let text = main.contents.slice(0, max)
    while (byteLength(text + marker(byteLength(main.contents) - byteLength(text))) > max && text.length)
      text = text.slice(0, -1)
    main.contents = text + marker(byteLength(main.contents) - byteLength(text))
    return
  }
  let remaining = max - (main ? byteLength(main.contents) : 0)
  for (const file of files.filter((f) => f !== main).sort((a, b) => byteLength(b.contents) - byteLength(a.contents))) {
    const size = byteLength(file.contents)
    if (size <= remaining) remaining -= size
    else {
      let text = file.contents.slice(0, Math.max(0, remaining))
      while (byteLength(text + marker(size - byteLength(text))) > remaining && text.length) text = text.slice(0, -1)
      file.contents = text + marker(size - byteLength(text))
      remaining = 0
    }
  }
}
export class SkillsShRegistry implements SkillRegistry {
  private readonly token: string
  private readonly baseUrl: string
  private readonly maxBytes: number
  private readonly listCache = new TtlCache<string, unknown>()
  private readonly searchCache = new TtlCache<string, unknown>()
  private readonly detailCache = new TtlCache<string, unknown>()
  constructor(opts: { token?: string; baseUrl?: string; maxBytes?: number }) {
    if (!opts.token) throw new RegistryAuthError('skills.sh registry requires an API token')
    this.token = opts.token
    this.baseUrl = (opts.baseUrl ?? 'https://skills.sh').replace(/\/+$/, '')
    this.maxBytes = opts.maxBytes ?? 200000
  }
  async listSkills(opts: ListSkillsOptions): Promise<SkillListResult> {
    const view = opts.view ?? 'all-time',
      page = opts.page ?? 1,
      perPage = opts.perPage ?? 20,
      key = `list:${view}:${page}:${perPage}:${opts.includeDescription ? 'desc' : 'plain'}`,
      cached = this.listCache.get(key)
    if (cached) return cached as SkillListResult
    const body = await this.request(
        `${this.baseUrl}/api/v1/skills?${new URLSearchParams({ view, page: String(page), perPage: String(perPage) })}`,
      ),
      result = this.map(body, page, perPage)
    if (opts.includeDescription) await this.enrich(result.data)
    this.listCache.set(key, result, 60000)
    return result
  }
  async searchSkills(opts: SearchSkillsOptions): Promise<SkillListResult> {
    const query = opts.query.trim()
    if (query.length < 2) throw new Error('search query must be at least 2 characters')
    const limit = opts.limit ?? 10,
      owner = opts.owner?.trim(),
      key = `search:${query}:${limit}:${owner ?? ''}:${opts.includeDescription ? 'desc' : 'plain'}`,
      cached = this.searchCache.get(key)
    if (cached) return cached as SkillListResult
    const params = new URLSearchParams({ q: query, limit: String(limit) })
    if (owner) params.set('owner', owner)
    const result = this.mapSearch(await this.request(`${this.baseUrl}/api/v1/skills/search?${params}`), limit)
    if (opts.includeDescription) await this.enrich(result.data)
    this.searchCache.set(key, result, 60000)
    return result
  }
  async loadSkill(id: string): Promise<SkillDetail> {
    const parts = id.split('/'),
      source = parts.length >= 3 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? ''),
      slug = parts.length >= 3 ? parts.slice(2).join('/') : parts.slice(1).join('/'),
      key = `detail:${source}:${slug}`,
      cached = this.detailCache.get(key)
    if (cached) return cached as SkillDetail
    const raw = (await this.request(
        `${this.baseUrl}/api/v1/skills/${encodeURIComponent(source)}/${encodeURIComponent(slug)}`,
      )) as Record<string, unknown>,
      files: SkillFile[] = Array.isArray(raw.files)
        ? raw.files.flatMap((entry) => {
            const f = entry as Record<string, unknown>
            return typeof f.path === 'string' && typeof f.contents === 'string'
              ? [{ path: f.path, contents: f.contents }]
              : []
          })
        : []
    files.sort((a, b) => Number(!md(a.path)) - Number(!md(b.path)) || a.path.localeCompare(b.path))
    if (!files.some((f) => md(f.path))) throw new SkillNotFoundError(`SKILL.md not found in ${id}`)
    cap(files, this.maxBytes)
    const detail = {
      id: typeof raw.id === 'string' ? raw.id : id,
      name: typeof raw.name === 'string' ? raw.name : slug,
      slug: typeof raw.slug === 'string' ? raw.slug : slug,
      source: typeof raw.source === 'string' ? raw.source : source,
      ...(typeof raw.installs === 'number' ? { installs: raw.installs } : {}),
      ...(typeof raw.hash === 'string' || raw.hash === null ? { hash: raw.hash } : {}),
      files,
    }
    this.detailCache.set(key, detail, 300000)
    return detail
  }
  private async request(url: string): Promise<unknown> {
    try {
      return await httpGetJson(url, { headers: { Authorization: `Bearer ${this.token}` } })
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        throw new RegistryAuthError(`skills.sh registry authentication failed for ${url}`)
      }
      if (error instanceof HttpError && error.status === 404) throw new SkillNotFoundError(`skill not found: ${url}`)
      throw error
    }
  }
  private map(body: unknown, page: number, perPage: number): SkillListResult {
    const raw = body as Record<string, unknown>,
      data = (Array.isArray(raw.data) ? raw.data : Array.isArray(raw.skills) ? raw.skills : []).map((x) =>
        this.item(x as Record<string, unknown>),
      ),
      p = (raw.pagination ?? {}) as Record<string, unknown>
    return {
      data,
      pagination: {
        page: typeof p.page === 'number' ? p.page : page,
        perPage: typeof p.perPage === 'number' ? p.perPage : perPage,
        ...(typeof p.total === 'number' ? { total: p.total } : {}),
        hasMore: p.hasMore !== undefined ? Boolean(p.hasMore) : data.length >= perPage,
      },
    }
  }
  private mapSearch(body: unknown, limit: number): SkillListResult {
    const raw = body as Record<string, unknown>,
      data = (Array.isArray(raw.data) ? raw.data : Array.isArray(raw.results) ? raw.results : []).map((x) =>
        this.item(x as Record<string, unknown>),
      ),
      p = (raw.pagination ?? {}) as Record<string, unknown>,
      total = typeof raw.count === 'number' ? raw.count : typeof p.total === 'number' ? p.total : undefined
    return {
      data,
      pagination: {
        page: typeof p.page === 'number' ? p.page : 1,
        perPage: typeof p.perPage === 'number' ? p.perPage : limit,
        ...(total !== undefined ? { total } : {}),
        hasMore: p.hasMore !== undefined ? Boolean(p.hasMore) : data.length >= limit,
      },
    }
  }
  private item(x: Record<string, unknown>): SkillSummary {
    const source = typeof x.source === 'string' ? x.source : '',
      slug = typeof x.slug === 'string' ? x.slug : ''
    return {
      id: typeof x.id === 'string' ? x.id : `${source}/${slug}`,
      name: typeof x.name === 'string' ? x.name : slug,
      slug,
      source,
      sourceType: x.sourceType === 'well-known' ? 'well-known' : 'github',
      ...(typeof x.installs === 'number' ? { installs: x.installs } : {}),
      ...(typeof x.installUrl === 'string' ? { installUrl: x.installUrl } : {}),
      ...(typeof x.url === 'string' ? { url: x.url } : {}),
    }
  }
  private async enrich(items: SkillSummary[]): Promise<void> {
    await Promise.all(
      items.slice(0, 20).map(async (item) => {
        try {
          const detail = await this.loadSkill(`${item.source}/${item.slug}`),
            file = detail.files.find((f) => md(f.path))
          if (file) item.description = extractDescription(file.contents)
        } catch {}
      }),
    )
  }
}
