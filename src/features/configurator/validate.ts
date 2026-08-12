import { MECHANISMS, resolveOptions as resolveDirectives } from '../directives/index.js'
import { resolveOptions as resolveGoal } from '../goal/options.js'
import { normalizeOptions as normalizeOrchestrator } from '../orchestrator/index.js'
import { normalizeOptions as normalizeProviders } from '../providers/options.js'
import { validateProviderSource } from '../providers/store.js'
import { resolve as resolveSkillbox } from '../skillbox/index.js'
import { createRegistry } from '../skillbox/registries/factory.js'
import { loadConfig } from '../toolbox/config.js'
import { PLUGIN_OPTIONS_SCHEMA } from './schema.js'

export interface FeatureReport {
  feature: string
  ok: boolean
  message?: string
}
export interface ValidationResult {
  errors: FeatureReport[]
  warnings: string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isNonEmptyString = (value: unknown): boolean => typeof value === 'string' && value.trim() !== ''
const isPositiveInteger = (value: unknown): boolean =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const isNonNegativeInteger = (value: unknown): boolean =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const featureSchema = (name: string): { properties?: Record<string, unknown> } | undefined =>
  (PLUGIN_OPTIONS_SCHEMA.properties as Record<string, { properties?: Record<string, unknown> }>)[name]

const unknownKeys = (value: unknown, known: Set<string>, prefix: string): string[] =>
  isRecord(value)
    ? Object.keys(value)
        .filter((key) => !known.has(key))
        .map((key) => `${prefix}.${key}`)
    : []

function checkOrchestrator(raw: unknown): FeatureReport {
  try {
    normalizeOrchestrator(raw)
    return { feature: 'orchestrator', ok: true }
  } catch (error) {
    return { feature: 'orchestrator', ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function checkThrottle(raw: unknown): FeatureReport {
  const o = raw === undefined ? {} : raw
  if (!isRecord(o)) {
    return { feature: 'throttle', ok: false, message: 'The throttle options must be an object.' }
  }
  const fail = (key: string, expected: string): FeatureReport => ({
    feature: 'throttle',
    ok: false,
    message: `The \`${key}\` option must be ${expected}.`,
  })
  if (o.maxParallel !== undefined && !isPositiveInteger(o.maxParallel)) {
    return fail('maxParallel', 'a positive integer')
  }
  if (o.mode !== undefined && o.mode !== 'session' && o.mode !== 'global') {
    return fail('mode', 'one of "session" or "global"')
  }
  if (o.maxWaitMs !== undefined && (typeof o.maxWaitMs !== 'number' || o.maxWaitMs <= 0)) {
    return fail('maxWaitMs', 'a number greater than 0')
  }
  if (o.notifyQueue !== undefined && typeof o.notifyQueue !== 'boolean') {
    return fail('notifyQueue', 'a boolean')
  }
  return { feature: 'throttle', ok: true }
}

function checkGoal(raw: unknown): FeatureReport {
  const o = raw === undefined ? {} : raw
  if (!isRecord(o)) {
    return { feature: 'goal', ok: false, message: 'The goal options must be an object.' }
  }
  resolveGoal(o)
  const fail = (key: string, expected: string): FeatureReport => ({
    feature: 'goal',
    ok: false,
    message: `The \`${key}\` option must be ${expected}.`,
  })
  if (o.evaluatorModel !== undefined && !isNonEmptyString(o.evaluatorModel)) {
    return fail('evaluatorModel', 'a non-empty string')
  }
  if (o.evaluatorAgent !== undefined && !isNonEmptyString(o.evaluatorAgent)) {
    return fail('evaluatorAgent', 'a non-empty string')
  }
  if (o.stateDirectory !== undefined && !isNonEmptyString(o.stateDirectory)) {
    return fail('stateDirectory', 'a non-empty string')
  }
  if (o.maxTranscriptChars !== undefined && !isPositiveInteger(o.maxTranscriptChars)) {
    return fail('maxTranscriptChars', 'a positive integer')
  }
  if (o.defaultTokenBudget !== undefined && !isPositiveInteger(o.defaultTokenBudget)) {
    return fail('defaultTokenBudget', 'a positive integer')
  }
  if (o.defaultMaxTurns !== undefined && !isPositiveInteger(o.defaultMaxTurns)) {
    return fail('defaultMaxTurns', 'a positive integer')
  }
  if (o.continuationDelayMs !== undefined && !isNonNegativeInteger(o.continuationDelayMs)) {
    return fail('continuationDelayMs', 'a non-negative integer')
  }
  if (o.deleteEvaluatorSessions !== undefined && typeof o.deleteEvaluatorSessions !== 'boolean') {
    return fail('deleteEvaluatorSessions', 'a boolean')
  }
  return { feature: 'goal', ok: true }
}

function checkProviders(raw: unknown): FeatureReport {
  const o = raw === undefined ? {} : raw
  if (!isRecord(o)) {
    return { feature: 'providers', ok: false, message: 'The providers options must be an object.' }
  }
  if (o.providers !== undefined) {
    if (!Array.isArray(o.providers)) {
      return { feature: 'providers', ok: false, message: 'The `providers` option must be an array.' }
    }
    for (let i = 0; i < o.providers.length; i += 1) {
      const entry = o.providers[i]
      if (!validateProviderSource(entry)) {
        return {
          feature: 'providers',
          ok: false,
          message: `providers[${i}]: each provider needs a non-empty id and a baseURL starting with http:// or https://.`,
        }
      }
    }
  }
  const fail = (key: string, expected: string): FeatureReport => ({
    feature: 'providers',
    ok: false,
    message: `The \`${key}\` option must be ${expected}.`,
  })
  if (o.configFile !== undefined && !isNonEmptyString(o.configFile)) {
    return fail('configFile', 'a non-empty string')
  }
  if (o.model !== undefined && !isNonEmptyString(o.model)) {
    return fail('model', 'a non-empty string')
  }
  if (o.smallModel !== undefined && !isNonEmptyString(o.smallModel)) {
    return fail('smallModel', 'a non-empty string')
  }
  if (o.timeout !== undefined && !isPositiveInteger(o.timeout)) {
    return fail('timeout', 'a positive integer')
  }
  if (o.npm !== undefined && !isNonEmptyString(o.npm)) {
    return fail('npm', 'a non-empty string')
  }
  if (o.env !== undefined && typeof o.env !== 'boolean') {
    return fail('env', 'a boolean')
  }
  try {
    normalizeProviders(o, [], '', () => undefined)
    return { feature: 'providers', ok: true }
  } catch (error) {
    return { feature: 'providers', ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function checkSkillbox(raw: unknown): FeatureReport {
  const o = raw === undefined ? {} : raw
  if (!isRecord(o)) {
    return { feature: 'skillbox', ok: false, message: 'The skillbox options must be an object.' }
  }
  if (o.registry !== undefined && o.registry !== 'auto' && o.registry !== 'skills-sh' && o.registry !== 'github') {
    return {
      feature: 'skillbox',
      ok: false,
      message: 'The `registry` option must be one of "auto", "skills-sh", or "github".',
    }
  }
  if (o.skillsShToken !== undefined && !isNonEmptyString(o.skillsShToken)) {
    return { feature: 'skillbox', ok: false, message: 'The `skillsShToken` option must be a non-empty string.' }
  }
  if (o.githubToken !== undefined && !isNonEmptyString(o.githubToken)) {
    return { feature: 'skillbox', ok: false, message: 'The `githubToken` option must be a non-empty string.' }
  }
  if (o.maxBytes !== undefined && !isPositiveInteger(o.maxBytes)) {
    return { feature: 'skillbox', ok: false, message: 'The `maxBytes` option must be a positive integer.' }
  }
  if (o.debug !== undefined && typeof o.debug !== 'boolean') {
    return { feature: 'skillbox', ok: false, message: 'The `debug` option must be a boolean.' }
  }
  if (
    o.githubSources !== undefined &&
    (!Array.isArray(o.githubSources) || o.githubSources.some((entry) => !isNonEmptyString(entry)))
  ) {
    return {
      feature: 'skillbox',
      ok: false,
      message: 'The `githubSources` option must be an array of non-empty strings.',
    }
  }
  try {
    createRegistry(resolveSkillbox(o))
    return { feature: 'skillbox', ok: true }
  } catch (error) {
    return { feature: 'skillbox', ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function checkToolbox(raw: unknown): FeatureReport {
  const o = raw === undefined ? {} : raw
  if (!isRecord(o)) {
    return { feature: 'toolbox', ok: false, message: 'The toolbox options must be an object.' }
  }
  if (o.config === undefined && o.servers === undefined) {
    return { feature: 'toolbox', ok: true }
  }
  const silent = { info: () => undefined, warn: () => undefined }
  try {
    if (typeof o.config === 'string') {
      if (o.config.trim() === '') {
        return {
          feature: 'toolbox',
          ok: false,
          message: 'The `config` option must be a non-empty string or an object.',
        }
      }
      loadConfig({ config: o.config, logger: silent })
      return { feature: 'toolbox', ok: true }
    }
    loadConfig({ config: o.config, servers: o.servers, logger: silent })
    return { feature: 'toolbox', ok: true }
  } catch (error) {
    return { feature: 'toolbox', ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function checkDirectives(raw: unknown): FeatureReport {
  const o = raw === undefined ? {} : raw
  if (!isRecord(o)) {
    return { feature: 'directives', ok: false, message: 'The directives options must be an object.' }
  }
  const fail = (key: string, expected: string): FeatureReport => ({
    feature: 'directives',
    ok: false,
    message: `The \`${key}\` option must be ${expected}.`,
  })
  if (o.defaults !== undefined && typeof o.defaults !== 'boolean') {
    return fail('defaults', 'a boolean')
  }
  if (o.system !== undefined && (!Array.isArray(o.system) || o.system.some((entry) => !isNonEmptyString(entry)))) {
    return fail('system', 'an array of non-empty strings')
  }
  if (
    o.mechanisms !== undefined &&
    (!Array.isArray(o.mechanisms) || o.mechanisms.some((entry) => !(MECHANISMS as readonly string[]).includes(entry)))
  ) {
    return fail('mechanisms', `an array of values from ${MECHANISMS.join(', ')}`)
  }
  if (o.tools !== undefined) {
    if (!isRecord(o.tools)) {
      return fail('tools', 'an object with non-empty string values')
    }
    for (const [key, value] of Object.entries(o.tools)) {
      if (!/^[a-z0-9_-]+$/.test(key)) {
        return {
          feature: 'directives',
          ok: false,
          message: `The \`tools\` keys must match /^[a-z0-9_-]+$/ (got "${key}").`,
        }
      }
      if (!isNonEmptyString(value)) {
        return fail('tools', 'an object with non-empty string values')
      }
    }
  }
  resolveDirectives(o)
  return { feature: 'directives', ok: true }
}

const CHECKS: [string, (raw: unknown) => FeatureReport][] = [
  ['orchestrator', checkOrchestrator],
  ['throttle', checkThrottle],
  ['goal', checkGoal],
  ['providers', checkProviders],
  ['skillbox', checkSkillbox],
  ['toolbox', checkToolbox],
  ['directives', checkDirectives],
]

export function validateFullOptions(fullOptions: unknown): ValidationResult {
  if (fullOptions === undefined || fullOptions === null) {
    return { errors: [checkOrchestrator(undefined)], warnings: [] }
  }
  if (!isRecord(fullOptions)) {
    return {
      errors: [{ feature: 'plugin', ok: false, message: 'The plugin options must be an object.' }],
      warnings: [],
    }
  }
  const errors: FeatureReport[] = []
  const warnings: string[] = []
  const topKeys = new Set(Object.keys(PLUGIN_OPTIONS_SCHEMA.properties))
  for (const key of Object.keys(fullOptions)) {
    if (!topKeys.has(key)) {
      warnings.push(`Unknown top-level option "${key}" (not a feature name).`)
    }
  }
  for (const [name, check] of CHECKS) {
    const report = check(fullOptions[name])
    if (!report.ok) {
      errors.push(report)
    }
    const known = featureSchema(name)?.properties
    if (known) {
      warnings.push(...unknownKeys(fullOptions[name], new Set(Object.keys(known)), name))
    }
  }
  return { errors, warnings }
}
