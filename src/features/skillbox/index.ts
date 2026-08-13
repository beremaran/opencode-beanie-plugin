// biome-ignore lint/style/noExcessiveLinesPerFile: this file is the cohesive skillbox feature entrypoint (option resolution, registry wiring, and the three public tool definitions); splitting it would fragment tightly-coupled logic across files.
import { type Plugin, type PluginInput, tool } from '@opencode-ai/plugin'
import { HttpError } from './http.js'
import { createRegistry, type RegistryFactoryConfig } from './registries/factory.js'
import {
  RegistryAuthError,
  type SkillDetail,
  type SkillFile,
  SkillNotFoundError,
  type SkillRegistry,
  type SkillSummary,
} from './types.js'

const MAX_DESCRIPTION_CHARS = 300
const MAX_PAYLOAD_CHARS = 200_000
const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 25
const MAX_SEARCH_LIMIT = 50
const DEFAULT_SEARCH_LIMIT = 10
const MIN_LOAD_BYTES = 500
const MAX_LOAD_BYTES = 100_000
const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength
type Options = RegistryFactoryConfig & { debug?: boolean }
type Env = Record<string, string | undefined>
type Logger = (level: 'warn' | 'error', message: string, extra?: Record<string, unknown>) => Promise<void>
type FileWithSize = SkillFile & { sizeBytes: number }
const env = (): Env => {
  const value = (globalThis as { process?: { env?: Env } }).process?.env
  return value ?? {}
}
function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s
  }
  return s.slice(0, max)
}
function isSkillMd(path: string): boolean {
  return path.split('/').at(-1)?.toLowerCase() === 'skill.md'
}
function summary(item: SkillSummary, description: boolean): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: item.id,
    name: item.name,
    slug: item.slug,
    source: item.source,
    sourceType: item.sourceType,
  }
  if (item.installs !== undefined) {
    result.installs = item.installs
  }
  if (item.installUrl !== undefined) {
    result.installUrl = item.installUrl
  }
  if (item.url !== undefined) {
    result.url = item.url
  }
  if (description && item.description !== undefined) {
    result.description = truncate(item.description, MAX_DESCRIPTION_CHARS)
  }
  return result
}
function marker(bytes: number): string {
  return `\n[...truncated: ${bytes} bytes omitted]\n`
}
function truncateBytes(contents: string, budget: number): string {
  const original = byteLength(contents)
  if (original <= budget) {
    return contents
  }
  let text = contents.slice(0, Math.max(0, budget))
  while (byteLength(text + marker(original - byteLength(text))) > budget && text.length > 0) {
    text = text.slice(0, -1)
  }
  return text + marker(original - byteLength(text))
}
function errorText(error: unknown, id?: string): string {
  let text: string
  if (error instanceof SkillNotFoundError) {
    text = `Skill not found: ${id ?? error.message}. Use list_skills or search_skills to find valid skill ids.`
  } else if (error instanceof RegistryAuthError) {
    text = `Registry authentication error: ${error.message}. If you intended skills.sh, set SKILLS_SH_TOKEN, otherwise remove it to run in GitHub mode.`
  } else if (error instanceof HttpError) {
    text = `Registry request failed (HTTP ${error.status}): ${error.message}`
  } else if (error instanceof Error) {
    text = error.message
  } else {
    text = String(error)
  }
  return JSON.stringify({ error: text }, null, 2)
}
function withSizes(files: SkillFile[]): FileWithSize[] {
  return files.map((file) => ({ ...file, sizeBytes: byteLength(file.contents) }))
}
function mainFileOnly(files: FileWithSize[]): FileWithSize[] {
  return files.filter((file) => isSkillMd(file.path))
}
function budgetFiles(files: FileWithSize[], maxBytes: number): FileWithSize[] {
  const budgeted: FileWithSize[] = []
  let remaining = maxBytes
  for (const file of files) {
    if (file.sizeBytes <= remaining) {
      budgeted.push(file)
      remaining -= file.sizeBytes
    } else {
      const contents = truncateBytes(file.contents, remaining)
      budgeted.push({ ...file, contents, sizeBytes: byteLength(contents) })
      remaining = 0
      break
    }
  }
  return budgeted
}
function loadPayload(detail: SkillDetail, includeSupporting: boolean, maxBytes: number | undefined): string {
  let files = withSizes(detail.files)
  if (!includeSupporting) {
    files = mainFileOnly(files)
  }
  let truncated = false
  if (maxBytes !== undefined && files.reduce((n, f) => n + f.sizeBytes, 0) > maxBytes) {
    const main = mainFileOnly(files)
    if (main.length < files.length) {
      files = main
      truncated = true
    }
    files = budgetFiles(files, maxBytes)
    truncated = true
  }
  const base: Record<string, unknown> = {
    id: detail.id,
    name: detail.name,
    source: detail.source,
  }
  if (detail.installs !== undefined) {
    base.installs = detail.installs
  }
  const payload = (list: FileWithSize[], flag: boolean) => {
    const result: Record<string, unknown> = { ...base, files: list }
    if (flag) {
      result.truncated = true
    }
    return result
  }
  let output = JSON.stringify(payload(files, truncated), null, 2)
  if (output.length > MAX_PAYLOAD_CHARS) {
    const main = files.find((f) => isSkillMd(f.path))
    if (main) {
      const budget = Math.min(byteLength(main.contents), maxBytes ?? MAX_PAYLOAD_CHARS)
      const contents = truncateBytes(main.contents, budget)
      files = [{ ...main, contents, sizeBytes: byteLength(contents) }]
      output = JSON.stringify(payload(files, true), null, 2)
    }
  }
  return output
}
function createLogger(input: PluginInput, enabled: boolean): Logger {
  return async (level, message, extra) => {
    if (!enabled) {
      return
    }
    await input.client.app
      .log({ body: { service: 'opencode-beanie-plugin', level, message, ...(extra && { extra }) } })
      .catch(() => undefined)
  }
}
function listSkillsTool(registry: SkillRegistry, log: Logger) {
  return tool({
    description:
      'List available agent skills from the registry. Returns compact JSON metadata; descriptions are omitted by default.',
    args: {
      view: tool.schema.enum(['all-time', 'trending', 'hot']).optional(),
      page: tool.schema.number().int().min(0).optional().default(0),
      // biome-ignore lint/style/useNamingConvention: per_page is the public snake_case tool-arg field name exposed to OpenCode agents.
      per_page: tool.schema.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
      // biome-ignore lint/style/useNamingConvention: include_description is the public snake_case tool-arg field name exposed to OpenCode agents.
      include_description: tool.schema.boolean().optional().default(false),
    },
    execute: async (args) => {
      try {
        const result = await registry.listSkills({
          view: args.view,
          page: args.page,
          perPage: args.per_page,
          includeDescription: args.include_description,
        })
        return JSON.stringify(
          {
            count: result.data.length,
            skills: result.data.map((item) => summary(item, args.include_description)),
            pagination: result.pagination ?? { page: args.page, perPage: args.per_page, hasMore: false },
          },
          null,
          2,
        )
      } catch (error) {
        await log('error', 'list_skills failed', { error: String(error) })
        return errorText(error)
      }
    },
  })
}
function searchSkillsTool(registry: SkillRegistry, log: Logger) {
  return tool({
    description:
      'Search agent skills by keyword. Returns compact JSON results and optional descriptions truncated to 300 characters.',
    args: {
      query: tool.schema.string().min(2),
      limit: tool.schema.number().int().min(1).max(MAX_SEARCH_LIMIT).optional().default(DEFAULT_SEARCH_LIMIT),
      owner: tool.schema.string().optional(),
      // biome-ignore lint/style/useNamingConvention: include_description is the public snake_case tool-arg field name exposed to OpenCode agents.
      include_description: tool.schema.boolean().optional().default(false),
    },
    execute: async (args) => {
      try {
        const query = args.query.trim()
        if (query.length < 2) {
          return JSON.stringify({ error: 'Search query must be at least 2 characters' }, null, 2)
        }
        const result = await registry.searchSkills({
          query,
          limit: args.limit,
          owner: args.owner,
          includeDescription: args.include_description,
        })
        return JSON.stringify(
          {
            count: result.data.length,
            query,
            results: result.data.map((item) => summary(item, args.include_description)),
          },
          null,
          2,
        )
      } catch (error) {
        await log('error', 'search_skills failed', { error: String(error) })
        return errorText(error)
      }
    },
  })
}
function loadSkillTool(registry: SkillRegistry, log: Logger) {
  return tool({
    description: 'Load the full content of one skill by id, with optional supporting files and byte limits.',
    args: {
      id: tool.schema.string().min(1),
      // biome-ignore lint/style/useNamingConvention: include_supporting_files is the public snake_case tool-arg field name exposed to OpenCode agents.
      include_supporting_files: tool.schema.boolean().optional().default(false),
      // biome-ignore lint/style/useNamingConvention: max_bytes is the public snake_case tool-arg field name exposed to OpenCode agents.
      max_bytes: tool.schema.number().int().min(MIN_LOAD_BYTES).max(MAX_LOAD_BYTES).optional(),
    },
    execute: async (args) => {
      const id = args.id.trim()
      if (!id) {
        return JSON.stringify({ error: 'Skill id is required' }, null, 2)
      }
      try {
        return loadPayload(await registry.loadSkill(id), args.include_supporting_files, args.max_bytes)
      } catch (error) {
        await log('error', 'load_skill failed', { id, error: String(error) })
        return errorText(error, id)
      }
    },
  })
}
const Skillbox: Plugin = async (input, rawOptions) => {
  const options = resolve(rawOptions)
  const log = createLogger(input, options.debug === true)
  let registry: SkillRegistry
  try {
    registry = createRegistry(options)
    await log('warn', 'Skillbox registry initialized', { registry: options.registry ?? 'auto' })
  } catch (error) {
    await log('error', 'Skillbox registry initialization failed', { error: String(error) })
    throw error
  }
  return {
    tool: {
      // biome-ignore lint/style/useNamingConvention: list_skills is the public snake_case tool name exposed to OpenCode agents.
      list_skills: listSkillsTool(registry, log),
      // biome-ignore lint/style/useNamingConvention: search_skills is the public snake_case tool name exposed to OpenCode agents.
      search_skills: searchSkillsTool(registry, log),
      // biome-ignore lint/style/useNamingConvention: load_skill is the public snake_case tool name exposed to OpenCode agents.
      load_skill: loadSkillTool(registry, log),
    },
  }
}
export function resolve(raw: Record<string, unknown> | undefined): Options {
  const source = raw ?? {}
  const e = env()
  const value = (key: string, envKey: string) => {
    if (source[key] === undefined) {
      return e[envKey]
    }
    return source[key]
  }
  const registry = value('registry', 'SKILL_REGISTRY')
  const sources = value('githubSources', 'SKILL_GITHUB_SOURCES')
  const max = value('maxBytes', 'SKILL_MAX_BYTES')
  const debug = value('debug', 'SKILL_DEBUG')
  const config: Options = {}
  if (registry === 'auto' || registry === 'skills-sh' || registry === 'github') {
    config.registry = registry
  }
  if (typeof value('skillsShToken', 'SKILLS_SH_TOKEN') === 'string') {
    config.skillsShToken = value('skillsShToken', 'SKILLS_SH_TOKEN') as string
  }
  if (typeof sources === 'string') {
    config.githubSources = sources
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  } else if (Array.isArray(sources)) {
    config.githubSources = sources.filter((s): s is string => typeof s === 'string')
  }
  const n = Number(max)
  if (Number.isFinite(n) && n > 0) {
    config.maxBytes = Math.floor(n)
  }
  if (typeof value('githubToken', 'GITHUB_TOKEN') === 'string') {
    config.githubToken = value('githubToken', 'GITHUB_TOKEN') as string
  }
  config.debug = debug === true || debug === '1' || debug === 'true'
  return config
}
export default Skillbox
