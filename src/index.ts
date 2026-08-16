import type { Plugin } from "@opencode-ai/plugin";
import { CommitCommandDomain } from "./domains/commit-command";
import { GoalsDomain } from "./domains/goals";
import { PapercutsDomain } from "./domains/papercuts";
import { OrchestratorDomain } from "./domains/orchestrator";
import { ThrottleDomain } from "./domains/throttle";
import { mergeHooks } from "./shared/hooks";

const domains = [
  CommitCommandDomain,
  GoalsDomain,
  PapercutsDomain,
  OrchestratorDomain,
  ThrottleDomain,
];

export { composeCommandHooks } from "./shared/hooks";

async function loadDomainHooks(
  input: Parameters<Plugin>[0],
  options: Parameters<Plugin>[1],
) {
  return Promise.all(domains.map((domain) => domain(input, options)));
}

export const BeaniePlugin: Plugin = async (input, options) => {
  const hooks = await loadDomainHooks(input, options);

  return mergeHooks(hooks);
};

export default BeaniePlugin;