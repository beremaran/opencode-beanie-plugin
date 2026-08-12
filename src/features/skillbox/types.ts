export interface SkillSummary {
  id: string
  name: string
  slug: string
  source: string
  sourceType: 'github' | 'well-known'
  installs?: number
  installUrl?: string
  url?: string
  description?: string
}
export interface SkillFile {
  path: string
  contents: string
}
export interface SkillDetail {
  id: string
  name: string
  slug: string
  source: string
  installs?: number
  hash?: string | null
  files: SkillFile[]
}
export interface ListSkillsOptions {
  view?: 'all-time' | 'trending' | 'hot'
  page?: number
  perPage?: number
  includeDescription?: boolean
}
export interface SearchSkillsOptions {
  query: string
  limit?: number
  owner?: string
  includeDescription?: boolean
}
export interface SkillListResult {
  data: SkillSummary[]
  pagination?: { page: number; perPage: number; total?: number; hasMore: boolean }
}
export interface SkillRegistry {
  listSkills(opts: ListSkillsOptions): Promise<SkillListResult>
  searchSkills(opts: SearchSkillsOptions): Promise<SkillListResult>
  loadSkill(id: string): Promise<SkillDetail>
}
export class SkillNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkillNotFoundError'
  }
}
export class RegistryAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RegistryAuthError'
  }
}
