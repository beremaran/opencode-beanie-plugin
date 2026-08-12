import { TtlCache } from '../cache.js'
import { extractDescription, parseSkillFrontmatter } from '../frontmatter.js'
import { HttpError, httpGetJson } from '../http.js'
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

type TreeEntry = { path: string; type: string }
type FrontmatterInfo = { name?: string; raw?: string }
const DEFAULT_SOURCES = [
  'vercel-labs/skills',
  'anthropics/skills',
  'obra/superpowers',
  'mattpocock/skills',
  'microsoft/azure-skills',
  'supabase/agent-skills',
  'prisma/skills',
]
const marker = (bytes: number) => `\n[...truncated: ${bytes} bytes omitted]\n`
const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength
function skillMd(path: string): boolean {
  return path.split('/').pop()?.toLowerCase() === 'skill.md'
}
function truncate(file: SkillFile, budget: number): void {
  const original = byteLength(file.contents)
  if (original <= budget) return
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
    this.sources = (opts.sources?.length ? opts.sources : DEFAULT_SOURCES).map((s) => s.trim()).filter(Boolean)
    this.maxBytes = opts.maxBytes ?? 200000
    this.token = opts.token
  }
  async listSkills(opts: ListSkillsOptions): Promise<SkillListResult> {
    const data: SkillSummary[] = []
    let fetched = 0
    for (const source of this.sources) {
      const parsed = this.split(source)
      if (!parsed) continue
      const entries = await this.tree(parsed.owner, parsed.repo)
      if (!entries) continue
      for (const dir of this.dirs(entries)) {
        let name = this.base(dir)
        let description: string | undefined
        if (opts.includeDescription && fetched < 100) {
          fetched++
          const info = await this.fm(
            parsed.owner,
            parsed.repo,
            this.branches.get(`${parsed.owner}/${parsed.repo}`)!,
            dir,
          )
          name = info.name ?? name
          description = info.raw ? extractDescription(info.raw) : undefined
        }
        data.push(this.summary(parsed.owner, parsed.repo, dir, name, description))
      }
    }
    return { data }
  }
  async searchSkills(opts: SearchSkillsOptions): Promise<SkillListResult> {
    const q = opts.query.trim()
    if (q.length < 2) throw new Error('search query must be at least 2 characters')
    const matches: Array<{
      rank: number
      source: number
      name: string
      description?: string
      owner: string
      repo: string
      dir: string
    }> = []
    let candidates = 0
    for (let si = 0; si < this.sources.length && candidates < 500; si++) {
      const parsed = this.split(this.sources[si])
      if (!parsed) continue
      const entries = await this.tree(parsed.owner, parsed.repo)
      if (!entries) continue
      for (const dir of this.dirs(entries)) {
        if (candidates++ >= 500) break
        const info = await this.fm(parsed.owner, parsed.repo, this.branches.get(`${parsed.owner}/${parsed.repo}`)!, dir)
        const name = info.name ?? this.base(dir)
        const description = info.raw ? extractDescription(info.raw) : ''
        const n = name.toLowerCase(),
          lq = q.toLowerCase()
        if (!n.includes(lq) && !description.toLowerCase().includes(lq)) continue
        matches.push({
          rank: n === lq ? 0 : n.startsWith(lq) ? 1 : n.includes(lq) ? 2 : 3,
          source: si,
          name,
          description: opts.includeDescription ? description : undefined,
          ...parsed,
          dir,
        })
      }
    }
    matches.sort((a, b) => a.rank - b.rank || a.source - b.source || a.name.localeCompare(b.name))
    return {
      data: matches.slice(0, opts.limit ?? 10).map((m) => this.summary(m.owner, m.repo, m.dir, m.name, m.description)),
    }
  }
  async loadSkill(id: string): Promise<SkillDetail> {
    const parts = id.split('/')
    if (parts.length < 2) throw new SkillNotFoundError(`Skill not found: ${id}`)
    const owner = parts[0],
      repo = parts[1],
      slug = parts.slice(2).join('/'),
      entries = await this.tree(owner, repo)
    if (!entries) throw new SkillNotFoundError(`Skill not found: ${id}`)
    const dir = this.resolve(entries, slug)
    if (!dir) throw new SkillNotFoundError(`Skill not found: ${id}`)
    const branch = this.branches.get(`${owner}/${repo}`)!,
      under = entries.filter((e) => e.path.startsWith(`${dir}/`))
    if (!under.some((e) => skillMd(e.path))) throw new SkillNotFoundError(`Skill not found: ${id}`)
    const files: SkillFile[] = []
    for (const entry of under)
      files.push({
        path: entry.path.slice(dir.length + 1),
        contents: await this.text(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${entry.path}`),
      })
    files.sort((a, b) => Number(!skillMd(a.path)) - Number(!skillMd(b.path)) || a.path.localeCompare(b.path))
    this.cap(files)
    const md = files.find((f) => skillMd(f.path))
    return {
      id,
      name: md ? (parseSkillFrontmatter(md.contents).name ?? slug) : slug,
      slug,
      source: `${owner}/${repo}`,
      files,
    }
  }
  private async text(url: string): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) throw new HttpError(`GET ${url} failed: ${response.status}`, response.status)
    return response.text()
  }
  private async tree(owner: string, repo: string): Promise<TreeEntry[] | null> {
    const key = `${owner}/${repo}`,
      known = this.branches.get(key)
    if (known) return this.trees.get(`tree:${key}:${known}`) ?? null
    for (const branch of ['main', 'master'])
      try {
        const body = await httpGetJson<{ tree?: TreeEntry[] }>(
          `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
          this.token ? { headers: { Authorization: `Bearer ${this.token}` } } : undefined,
        )
        this.branches.set(key, branch)
        const entries = body.tree ?? []
        this.trees.set(`tree:${key}:${branch}`, entries, 600000)
        return entries
      } catch (error) {
        if (!(error instanceof HttpError && error.status === 404)) throw error
      }
    return null
  }
  private async fm(owner: string, repo: string, branch: string, dir: string): Promise<FrontmatterInfo> {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodeURIComponent(dir)}/SKILL.md`,
      cached = this.frontmatter.get(url)
    if (cached) return cached
    try {
      const raw = await this.text(url),
        info = { ...parseSkillFrontmatter(raw), raw }
      this.frontmatter.set(url, info, 300000)
      return info
    } catch {
      return {}
    }
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
    return this.dirs(entries).find((d) => d === slug) ?? this.dirs(entries).find((d) => this.base(d) === slug) ?? null
  }
  private base(dir: string): string {
    return dir.split('/').at(-1) ?? dir
  }
  private split(source: string): { owner: string; repo: string } | null {
    const [owner, repo] = source.split('/')
    return owner && repo ? { owner, repo } : null
  }
  private summary(owner: string, repo: string, dir: string, name: string, description?: string): SkillSummary {
    return {
      id: `${owner}/${repo}/${this.base(dir)}`,
      name,
      slug: this.base(dir),
      source: `${owner}/${repo}`,
      sourceType: 'github',
      installUrl: `https://github.com/${owner}/${repo}`,
      ...(description !== undefined ? { description } : {}),
    }
  }
  private cap(files: SkillFile[]): void {
    const total = () => files.reduce((n, f) => n + byteLength(f.contents), 0)
    if (total() <= this.maxBytes) return
    const md = files.find((f) => skillMd(f.path))
    if (md && byteLength(md.contents) > this.maxBytes) {
      files
        .filter((f) => f !== md)
        .forEach((f) => {
          f.contents = ''
        })
      truncate(md, this.maxBytes)
      return
    }
    const support = files.filter((f) => f !== md).sort((a, b) => byteLength(b.contents) - byteLength(a.contents))
    let remaining = this.maxBytes - (md ? byteLength(md.contents) : 0)
    for (const file of support) {
      const size = byteLength(file.contents)
      if (size <= remaining) remaining -= size
      else {
        truncate(file, Math.max(0, remaining))
        remaining = 0
      }
    }
  }
}
