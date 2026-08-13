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

const DEFAULT_BASE_URL = 'https://skills.sh'
const DEFAULT_MAX_BYTES = 200_000
const DEFAULT_PAGE_SIZE = 20
const DEFAULT_SEARCH_LIMIT = 10
const LIST_TTL_MS = 60_000
const SEARCH_TTL_MS = 60_000
const DETAIL_TTL_MS = 300_000
const ENRICH_LIMIT = 20
const ID_PARTS_FOR_SOURCE = 3
const HTTP_UNAUTHORIZED = 401
const HTTP_NOT_FOUND = 404
const TRAILING_SLASHES_RE = /\/+$/
interface Pagination {
  page: number
  perPage: number
  total?: number
  hasMore: boolean
}
const md = (path: string) => path.toLowerCase() === 'skill.md'
const marker = (bytes: number) => `\n[...truncated: ${bytes} bytes omitted]\n`
const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength
function pickString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (typeof value === 'string') {
    return value
  }
  return undefined
}
function pickNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  if (typeof value === 'number') {
    return value
  }
  return undefined
}
function pickBoolean(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key]
  if (value === undefined) {
    return fallback
  }
  return Boolean(value)
}
function pickArray(record: Record<string, unknown>, key: string): unknown[] | undefined {
  const value = record[key]
  if (Array.isArray(value)) {
    return value
  }
  return undefined
}
function sourceTypeOf(x: Record<string, unknown>): 'github' | 'well-known' {
  if (x.sourceType === 'well-known') {
    return 'well-known'
  }
  return 'github'
}
function fitInBudget(contents: string, budget: number): string {
  const size = byteLength(contents)
  let text = contents.slice(0, budget)
  while (byteLength(text + marker(size - byteLength(text))) > budget && text.length > 0) {
    text = text.slice(0, -1)
  }
  return text + marker(size - byteLength(text))
}
function cap(files: SkillFile[], max: number): void {
  const total = () => files.reduce((n, f) => n + byteLength(f.contents), 0)
  if (total() <= max) {
    return
  }
  const main = files.find((f) => md(f.path))
  if (main && byteLength(main.contents) > max) {
    for (const file of files.filter((f) => f !== main)) {
      file.contents = ''
    }
    main.contents = fitInBudget(main.contents, max)
    return
  }
  fitSupport(files, main, max)
}
function fitSupport(files: SkillFile[], main: SkillFile | undefined, max: number): void {
  let mainBytes = 0
  if (main) {
    mainBytes = byteLength(main.contents)
  }
  let remaining = max - mainBytes
  for (const file of files.filter((f) => f !== main).sort((a, b) => byteLength(b.contents) - byteLength(a.contents))) {
    const size = byteLength(file.contents)
    if (size <= remaining) {
      remaining -= size
    } else {
      file.contents = fitInBudget(file.contents, remaining)
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
    if (!opts.token) {
      throw new RegistryAuthError('skills.sh registry requires an API token')
    }
    this.token = opts.token
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(TRAILING_SLASHES_RE, '')
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  }
  async listSkills(opts: ListSkillsOptions): Promise<SkillListResult> {
    const view = opts.view ?? 'all-time'
    const page = opts.page ?? 1
    const perPage = opts.perPage ?? DEFAULT_PAGE_SIZE
    const key = `list:${view}:${page}:${perPage}:${opts.includeDescription}`
    const cached = this.listCache.get(key)
    if (cached) {
      return cached as SkillListResult
    }
    const body = await this.request(
      `${this.baseUrl}/api/v1/skills?${new URLSearchParams({ view, page: String(page), perPage: String(perPage) })}`,
    )
    const result = this.map(body, page, perPage)
    if (opts.includeDescription) {
      await this.enrich(result.data)
    }
    this.listCache.set(key, result, LIST_TTL_MS)
    return result
  }
  async searchSkills(opts: SearchSkillsOptions): Promise<SkillListResult> {
    const query = opts.query.trim()
    if (query.length < 2) {
      throw new Error('search query must be at least 2 characters')
    }
    const limit = opts.limit ?? DEFAULT_SEARCH_LIMIT
    const owner = opts.owner?.trim()
    const key = `search:${query}:${limit}:${owner ?? ''}:${opts.includeDescription}`
    const cached = this.searchCache.get(key)
    if (cached) {
      return cached as SkillListResult
    }
    const params = new URLSearchParams({ q: query, limit: String(limit) })
    if (owner) {
      params.set('owner', owner)
    }
    const result = this.mapSearch(await this.request(`${this.baseUrl}/api/v1/skills/search?${params}`), limit)
    if (opts.includeDescription) {
      await this.enrich(result.data)
    }
    this.searchCache.set(key, result, SEARCH_TTL_MS)
    return result
  }
  async loadSkill(id: string): Promise<SkillDetail> {
    const parts = id.split('/')
    const [first, second, ...rest] = parts
    let source = first ?? ''
    let slug = second ?? ''
    if (parts.length >= ID_PARTS_FOR_SOURCE) {
      source = `${first}/${second}`
      slug = rest.join('/')
    }
    const key = `detail:${source}:${slug}`
    const cached = this.detailCache.get(key)
    if (cached) {
      return cached as SkillDetail
    }
    const raw = (await this.request(
      `${this.baseUrl}/api/v1/skills/${encodeURIComponent(source)}/${encodeURIComponent(slug)}`,
    )) as Record<string, unknown>
    let files: SkillFile[] = []
    if (Array.isArray(raw.files)) {
      files = raw.files.flatMap((entry) => {
        const f = entry as Record<string, unknown>
        if (typeof f.path === 'string' && typeof f.contents === 'string') {
          return [{ path: f.path, contents: f.contents }]
        }
        return []
      })
    }
    files.sort((a, b) => Number(!md(a.path)) - Number(!md(b.path)) || a.path.localeCompare(b.path))
    if (!files.some((f) => md(f.path))) {
      throw new SkillNotFoundError(`SKILL.md not found in ${id}`)
    }
    cap(files, this.maxBytes)
    const detail: SkillDetail = {
      id: pickString(raw, 'id') ?? id,
      name: pickString(raw, 'name') ?? slug,
      slug: pickString(raw, 'slug') ?? slug,
      source: pickString(raw, 'source') ?? source,
      files,
    }
    const installs = pickNumber(raw, 'installs')
    if (installs !== undefined) {
      detail.installs = installs
    }
    if (typeof raw.hash === 'string' || raw.hash === null) {
      detail.hash = raw.hash
    }
    this.detailCache.set(key, detail, DETAIL_TTL_MS)
    return detail
  }
  private async request(url: string): Promise<unknown> {
    try {
      // biome-ignore lint/style/useNamingConvention: Authorization is the standard HTTP header name (case-insensitive per RFC 9110)
      return await httpGetJson(url, { headers: { Authorization: `Bearer ${this.token}` } })
    } catch (error) {
      if (error instanceof HttpError && error.status === HTTP_UNAUTHORIZED) {
        // biome-ignore lint/style/useErrorCause: RegistryAuthError takes only a message; cause support would require changing types.ts
        throw new RegistryAuthError(`skills.sh registry authentication failed for ${url}`)
      }
      if (error instanceof HttpError && error.status === HTTP_NOT_FOUND) {
        // biome-ignore lint/style/useErrorCause: SkillNotFoundError takes only a message; cause support would require changing types.ts
        throw new SkillNotFoundError(`skill not found: ${url}`)
      }
      throw error
    }
  }
  private map(body: unknown, page: number, perPage: number): SkillListResult {
    const raw = body as Record<string, unknown>
    const rows = pickArray(raw, 'data') ?? pickArray(raw, 'skills') ?? []
    const data = rows.map((x) => this.item(x as Record<string, unknown>))
    const p = (raw.pagination ?? {}) as Record<string, unknown>
    const pagination: Pagination = {
      page: pickNumber(p, 'page') ?? page,
      perPage: pickNumber(p, 'perPage') ?? perPage,
      hasMore: pickBoolean(p, 'hasMore', data.length >= perPage),
    }
    const total = pickNumber(p, 'total')
    if (total !== undefined) {
      pagination.total = total
    }
    return { data, pagination }
  }
  private mapSearch(body: unknown, limit: number): SkillListResult {
    const raw = body as Record<string, unknown>
    const rows = pickArray(raw, 'data') ?? pickArray(raw, 'results') ?? []
    const data = rows.map((x) => this.item(x as Record<string, unknown>))
    const p = (raw.pagination ?? {}) as Record<string, unknown>
    const pagination: Pagination = {
      page: pickNumber(p, 'page') ?? 1,
      perPage: pickNumber(p, 'perPage') ?? limit,
      hasMore: pickBoolean(p, 'hasMore', data.length >= limit),
    }
    const total = pickNumber(raw, 'count') ?? pickNumber(p, 'total')
    if (total !== undefined) {
      pagination.total = total
    }
    return { data, pagination }
  }
  private item(x: Record<string, unknown>): SkillSummary {
    const source = pickString(x, 'source') ?? ''
    const slug = pickString(x, 'slug') ?? ''
    const summary: SkillSummary = {
      id: pickString(x, 'id') ?? `${source}/${slug}`,
      name: pickString(x, 'name') ?? slug,
      slug,
      source,
      sourceType: sourceTypeOf(x),
    }
    if (typeof x.installs === 'number') {
      summary.installs = x.installs
    }
    if (typeof x.installUrl === 'string') {
      summary.installUrl = x.installUrl
    }
    if (typeof x.url === 'string') {
      summary.url = x.url
    }
    return summary
  }
  private async enrich(items: SkillSummary[]): Promise<void> {
    await Promise.all(
      items.slice(0, ENRICH_LIMIT).map(async (item) => {
        try {
          const detail = await this.loadSkill(`${item.source}/${item.slug}`)
          const file = detail.files.find((f) => md(f.path))
          if (file) {
            item.description = extractDescription(file.contents)
          }
        } catch {
          // best-effort enrichment: a failing detail fetch must not fail the whole listing
        }
      }),
    )
  }
}
