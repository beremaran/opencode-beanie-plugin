import type {PluginInput} from "@opencode-ai/plugin";
import type {Domain} from "../../shared/domain";
import {createRegistry} from "./registries/factory";
import {resolveSkillboxOptions} from "./options";
import {
  createListSkillsTool,
  createLoadSkillTool,
  createSearchSkillsTool,
  type Logger,
} from "./tools";

export * from "./types";
export {createRegistry, describeRegistry, DEFAULT_GITHUB_SOURCES} from "./registries/factory";
export {resolveSkillboxOptions} from "./options";

const SERVICE = "opencode-beanie-plugin";

function createLogger(client: PluginInput["client"], enabled: boolean): Logger {
  return async (level, message, extra) => {
    if (!enabled) {
      return;
    }
    await client.app
      .log({ body: { service: SERVICE, level, message, ...(extra && { extra }) } })
      .catch(() => undefined);
  };
}

export const SkillboxDomain: Domain = (input, rawOptions) => {
  const options = resolveSkillboxOptions(rawOptions);

  const log = createLogger(input.client, options.debug === true);

  const registry = createRegistry(options);

  return Promise.resolve({
    tool: {
      list_skills: createListSkillsTool(registry, log),
      search_skills: createSearchSkillsTool(registry, log),
      load_skill: createLoadSkillTool(registry, log),
    },
  });
};

export default SkillboxDomain;
