import { RegistryAuthError, type SkillRegistry } from '../types.js'
import { GithubRegistry } from './github.js'
import { SkillsShRegistry } from './skills-sh.js'
export interface RegistryFactoryConfig {
  registry?: 'auto' | 'skills-sh' | 'github'
  skillsShToken?: string
  githubSources?: string[]
  maxBytes?: number
  githubToken?: string
}
export const DEFAULT_GITHUB_SOURCES = [
  'vercel-labs/skills',
  'anthropics/skills',
  'obra/superpowers',
  'mattpocock/skills',
  'microsoft/azure-skills',
  'supabase/agent-skills',
  'prisma/skills',
]
export function createRegistry(config: RegistryFactoryConfig): SkillRegistry {
  const mode = config.registry ?? 'auto'
  if (mode === 'skills-sh' || (mode === 'auto' && config.skillsShToken)) {
    if (!config.skillsShToken) throw new RegistryAuthError('skills-sh registry requires skillsShToken')
    return new SkillsShRegistry({ token: config.skillsShToken, maxBytes: config.maxBytes })
  }
  return new GithubRegistry({ sources: config.githubSources, maxBytes: config.maxBytes, token: config.githubToken })
}
export function describe(config: RegistryFactoryConfig): {
  registry: 'skills-sh' | 'github'
  reason: string
  sources?: string[]
} {
  const mode = config.registry ?? 'auto'
  if (mode === 'skills-sh') {
    if (!config.skillsShToken) throw new RegistryAuthError('skills-sh registry requires skillsShToken')
    return { registry: 'skills-sh', reason: 'skills.sh registry requested explicitly' }
  }
  if (mode === 'github')
    return {
      registry: 'github',
      reason: 'github registry requested explicitly',
      sources: config.githubSources ?? DEFAULT_GITHUB_SOURCES,
    }
  if (config.skillsShToken) return { registry: 'skills-sh', reason: 'skillsShToken provided; using skills.sh registry' }
  return {
    registry: 'github',
    reason: 'no skillsShToken provided; using public GitHub registries',
    sources: config.githubSources ?? DEFAULT_GITHUB_SOURCES,
  }
}
