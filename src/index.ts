import type { Plugin } from "@opencode-ai/plugin";
import { CommitCommandDomain } from "./domains/commit-command";
import { ConfiguratorDomain } from "./domains/configurator";
import { GoalsDomain } from "./domains/goals";
import { PapercutsDomain } from "./domains/papercuts";
import { OrchestratorDomain } from "./domains/orchestrator";
import { SkillboxDomain } from "./domains/skillbox";
import { ThrottleDomain } from "./domains/throttle";
import { ToolboxDomain } from "./domains/toolbox";
import { mergeHooks } from "./shared/hooks";

const domains = [
  CommitCommandDomain,
  ConfiguratorDomain,
  GoalsDomain,
  PapercutsDomain,
  OrchestratorDomain,
  SkillboxDomain,
  ThrottleDomain,
  ToolboxDomain,
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