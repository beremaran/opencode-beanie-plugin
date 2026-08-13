// biome-ignore lint/style/noExcessiveLinesPerFile: implementing the GitHub registry under preset:all with real fixes (noTernary->if/else, named constants, cognitive-complexity helper splits) requires >300 lines; splitting to additional files is outside scope
import { TtlCache } from '../cache.js'
import { extractDescription, parseSkillFrontmatter } from '../frontmatter.js'
import { HttpError, type HttpGetJsonOptions, httpGetJson } from '../http.js'
import {
  type ListSkillsOptions,
  type SearchSkillsOptions,
  type SkillDetail,
  type SkillFile,
  type SkillListResult,
  SkillNotFoundError,
  type SkillRegistry,
  type SkillSummary,
} from '../types.js'

interface TreeEntry {
  path: string
  type: string
}
interface FrontmatterInfo {
  name?: string
  raw?: string
}
interface SearchMatch {
  rank: number
  source: number
  name: string
  description?: string
  owner: string
  repo: string
  dir: string
}
const DEFAULT_SOURCES = [
  'vercel-labs/skills',
  'anthropics/skills',
  'obra/superpowers',
  'mattpocock/skills',
  'microsoft/azure-skills',
  'supabase/agent-skills',
  'prisma/skills',
]
const DEFAULT_MAX_BYTES = 200_000
const DEFAULT_SEARCH_LIMIT = 10
const LIST_DESCRIPTION_LIMIT = 100
const SEARCH_CANDIDATE_LIMIT = 500
const TREE_TTL_MS = 600_000
const FRONTMATTER_TTL_MS = 300_000
const HTTP_NOT_FOUND = 404
const RANK_FALLBACK = 3
const BRANCHES = ['main', 'master']
const marker = (bytes: number) => `\n[...truncated: ${bytes} bytes omitted]\n`
const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength
function skillMd(path: string): boolean {
  return path.split('/').pop()?.toLowerCase() === 'skill.md'
}
function descriptionOr(info: FrontmatterInfo): string | undefined {
  if (info.raw) {
    return extractDescription(info.raw)
  }
  return undefined
}
function truncate(file: SkillFile, budget: number): void {
  const original = byteLength(file.contents)
  if (original <= budget) {
    return
  }
  let text = file.contents.slice(0, budget)
  let mark = marker(original - byteLength(text))
  while (text.length > 0 && byteLength(text) + byteLength(mark) > budget) {
    text = text.slice(0, -1)
    mark = marker(original - byteLength(text))
  }
  file.contents = text + mark
}
export class GithubRegistry implements SkillRegistry {
  private readonly sources: string[]
  private readonly maxBytes: number
  private readonly token?: string
  private readonly branches = new Map<string, string>()
  private readonly trees = new TtlCache<string, TreeEntry[]>()
  private readonly frontmatter = new TtlCache<string, FrontmatterInfo>()
  constructor(opts: { sources?: string[]; maxBytes?: number; token?: string; timeoutMs?: number }) {
    const given = opts.sources
    let sources = DEFAULT_SOURCES
    if (given && given.length > 0) {
      sources = given
    }
    this.sources = sources.map((s) => s.trim()).filter(Boolean)
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
    this.token = opts.token
  }
  async listSkills(opts: ListSkillsOptions): Promise<SkillListResult> {
    const data: SkillSummary[] = []
    let fetched = 0
    for (const source of this.sources) {
      const parsed = this.split(source)
      if (parsed) {
        // biome-ignore lint/performance/noAwaitInLoops: sources are scanned sequentially so results keep deterministic ordering and API rate stays low
        fetched = await this.listSource(parsed, opts.includeDescription ?? false, fetched, data)
      }
    }
    return { data }
  }
  private async listSource(
    parsed: { owner: string; repo: string },
    includeDescription: boolean,
    fetched: number,
    data: SkillSummary[],
  ): Promise<number> {
    const tree = await this.tree(parsed.owner, parsed.repo)
    if (!tree) {
      return fetched
    }
    let count = fetched
    for (const dir of this.dirs(tree.entries)) {
      let name = this.base(dir)
      let description: string | undefined
      if (includeDescription && count < LIST_DESCRIPTION_LIMIT) {
        count += 1
        // biome-ignore lint/performance/noAwaitInLoops: description fetches are sequential to honor the per-list description cap deterministically
        const info = await this.fm(parsed.owner, parsed.repo, tree.branch, dir)
        name = info.name ?? name
        description = descriptionOr(info)
      }
      data.push(this.summary(`${parsed.owner}/${parsed.repo}`, dir, name, description))
    }
    return count
  }
  async searchSkills(opts: SearchSkillsOptions): Promise<SkillListResult> {
    const q = opts.query.trim()
    if (q.length < 2) {
      throw new Error('search query must be at least 2 characters')
    }
    const lq = q.toLowerCase()
    const matches: SearchMatch[] = []
    const ctx = { lq, includeDescription: opts.includeDescription ?? false, matches }
    let candidates = 0
    for (const [si, source] of this.sources.entries()) {
      if (candidates >= SEARCH_CANDIDATE_LIMIT) {
        break
      }
      const parsed = this.split(source)
      if (parsed) {
        // biome-ignore lint/performance/noAwaitInLoops: sources are scanned sequentially so ranking stays deterministic and the candidate cap holds
        candidates = await this.collectCandidates(parsed, si, ctx, candidates)
      }
    }
    matches.sort((a, b) => a.rank - b.rank || a.source - b.source || a.name.localeCompare(b.name))
    const limit = opts.limit ?? DEFAULT_SEARCH_LIMIT
    return {
      data: matches.slice(0, limit).map((m) => this.summary(`${m.owner}/${m.repo}`, m.dir, m.name, m.description)),
    }
  }
  async loadSkill(id: string): Promise<SkillDetail> {
    const parts = id.split('/')
    if (parts.length < 2) {
      throw new SkillNotFoundError(`Skill not found: ${id}`)
    }
    const [owner, repo, ...rest] = parts
    const slug = rest.join('/')
    const tree = await this.tree(owner, repo)
    const dir = tree && this.resolve(tree.entries, slug)
    if (!(tree && dir)) {
      throw new SkillNotFoundError(`Skill not found: ${id}`)
    }
    const under = tree.entries.filter((e) => e.path.startsWith(`${dir}/`))
    if (!under.some((e) => skillMd(e.path))) {
      throw new SkillNotFoundError(`Skill not found: ${id}`)
    }
    const files: SkillFile[] = await Promise.all(
      under.map(async (entry) => ({
        path: entry.path.slice(dir.length + 1),
        contents: await this.text(`https://raw.githubusercontent.com/${owner}/${repo}/${tree.branch}/${entry.path}`),
      })),
    )
    files.sort((a, b) => Number(!skillMd(a.path)) - Number(!skillMd(b.path)) || a.path.localeCompare(b.path))
    this.cap(files)
    const md = files.find((f) => skillMd(f.path))
    let name = slug
    if (md) {
      name = parseSkillFrontmatter(md.contents).name ?? slug
    }
    return { id, name, slug, source: `${owner}/${repo}`, files }
  }
  private async text(url: string): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new HttpError(`GET ${url} failed: ${response.status}`, response.status)
    }
    return response.text()
  }
  private async tree(owner: string, repo: string): Promise<{ entries: TreeEntry[]; branch: string } | null> {
    const key = `${owner}/${repo}`
    const known = this.branches.get(key)
    if (known) {
      const entries = this.trees.get(`tree:${key}:${known}`)
      if (entries) {
        return { entries, branch: known }
      }
      return null
    }
    for (const branch of BRANCHES) {
      try {
        let options: HttpGetJsonOptions | undefined
        if (this.token) {
          // biome-ignore lint/style/useNamingConvention: Authorization is the standard HTTP header name (case-insensitive per RFC 9110)
          options = { headers: { Authorization: `Bearer ${this.token}` } }
        }
        // biome-ignore lint/performance/noAwaitInLoops: branch resolution is sequential because 'main' must be preferred over 'master'
        const body = await httpGetJson<{ tree?: TreeEntry[] }>(
          `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
          options,
        )
        this.branches.set(key, branch)
        const entries = body.tree ?? []
        this.trees.set(`tree:${key}:${branch}`, entries, TREE_TTL_MS)
        return { entries, branch }
      } catch (error) {
        if (!(error instanceof HttpError && error.status === HTTP_NOT_FOUND)) {
          throw error
        }
      }
    }
    return null
  }
  private async fm(owner: string, repo: string, branch: string, dir: string): Promise<FrontmatterInfo> {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodeURIComponent(dir)}/SKILL.md`
    const cached = this.frontmatter.get(url)
    if (cached) {
      return cached
    }
    try {
      const raw = await this.text(url)
      const info: FrontmatterInfo = { ...parseSkillFrontmatter(raw), raw }
      this.frontmatter.set(url, info, FRONTMATTER_TTL_MS)
      return info
    } catch {
      return {}
    }
  }
  private async collectCandidates(
    parsed: { owner: string; repo: string },
    si: number,
    ctx: { lq: string; includeDescription: boolean; matches: SearchMatch[] },
    candidates: number,
  ): Promise<number> {
    const tree = await this.tree(parsed.owner, parsed.repo)
    if (!tree) {
      return candidates
    }
    let count = candidates
    for (const dir of this.dirs(tree.entries)) {
      if (count >= SEARCH_CANDIDATE_LIMIT) {
        break
      }
      count += 1
      // biome-ignore lint/performance/noAwaitInLoops: description fetches are sequential so the candidate cap is applied deterministically
      const info = await this.fm(parsed.owner, parsed.repo, tree.branch, dir)
      const name = info.name ?? this.base(dir)
      const description = descriptionOr(info) ?? ''
      const n = name.toLowerCase()
      if (n.includes(ctx.lq) || description.toLowerCase().includes(ctx.lq)) {
        const match: SearchMatch = { rank: this.rank(n, ctx.lq), source: si, name, ...parsed, dir }
        if (ctx.includeDescription) {
          match.description = description
        }
        ctx.matches.push(match)
      }
    }
    return count
  }
  private rank(name: string, lq: string): number {
    if (name === lq) {
      return 0
    }
    if (name.startsWith(lq)) {
      return 1
    }
    if (name.includes(lq)) {
      return 2
    }
    return RANK_FALLBACK
  }
  private dirs(entries: TreeEntry[]): string[] {
    return [
      ...new Set(
        entries
          .filter((e) => typeof e.path === 'string' && skillMd(e.path))
          .map((e) => e.path.split('/').slice(0, -1).join('/'))
          .filter(Boolean),
      ),
    ].sort()
  }
  private resolve(entries: TreeEntry[], slug: string): string | null {
    const dirs = this.dirs(entries)
    return dirs.find((d) => d === slug) ?? dirs.find((d) => this.base(d) === slug) ?? null
  }
  private base(dir: string): string {
    return dir.split('/').at(-1) ?? dir
  }
  private split(source: string): { owner: string; repo: string } | null {
    const [owner, repo] = source.split('/')
    if (owner && repo) {
      return { owner, repo }
    }
    return null
  }
  private summary(source: string, dir: string, name: string, description?: string): SkillSummary {
    const result: SkillSummary = {
      id: `${source}/${this.base(dir)}`,
      name,
      slug: this.base(dir),
      source,
      sourceType: 'github',
      installUrl: `https://github.com/${source}`,
    }
    if (description !== undefined) {
      result.description = description
    }
    return result
  }
  private cap(files: SkillFile[]): void {
    const total = () => files.reduce((n, f) => n + byteLength(f.contents), 0)
    if (total() <= this.maxBytes) {
      return
    }
    const md = files.find((f) => skillMd(f.path))
    if (md && byteLength(md.contents) > this.maxBytes) {
      for (const file of files.filter((f) => f !== md)) {
        file.contents = ''
      }
      truncate(md, this.maxBytes)
      return
    }
    const support = files.filter((f) => f !== md).sort((a, b) => byteLength(b.contents) - byteLength(a.contents))
    let mdBytes = 0
    if (md) {
      mdBytes = byteLength(md.contents)
    }
    let remaining = this.maxBytes - mdBytes
    for (const file of support) {
      const size = byteLength(file.contents)
      if (size <= remaining) {
        remaining -= size
      } else {
        truncate(file, Math.max(0, remaining))
        remaining = 0
      }
    }
  }
}
