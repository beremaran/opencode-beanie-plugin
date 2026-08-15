import type { Hooks, Plugin } from "@opencode-ai/plugin"
import { GoalsDomain } from "./domains/goals"

const domains = [GoalsDomain]

export const BeaniePlugin: Plugin = async (input, options) => {
  const hooks = await Promise.all(domains.map((domain) => domain(input, options)))

  const mergedHooks: Hooks = {}

  for (const hook of hooks) Object.assign(mergedHooks, hook)

  return mergedHooks
}

export default BeaniePlugin
