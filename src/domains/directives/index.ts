import type {Domain} from "../../shared/domain";
import {SERVICE} from "./defaults";
import {systemDirective, toolGuidance} from "./guidance";
import {resolveDirectivesOptions} from "./options";
import type {ResolvedDirectivesOptions} from "./types";

export * from "./types";
export * from "./defaults";
export {resolveDirectivesOptions} from "./options";
export {systemDirective, toolGuidance, mechanismNotes} from "./guidance";

const shouldActivate = (options: ResolvedDirectivesOptions): boolean =>
  options.defaults || options.system.length > 0 || Object.keys(options.tools).length > 0;

function appendToolGuidance(
  toolId: string,
  output: {description?: string},
  options: ResolvedDirectivesOptions,
) {
  const guidance = toolGuidance(options, toolId);

  if (!guidance) {
    return;
  }

  const prefix = `[${SERVICE}] ${guidance}`;

  if (!output.description) {
    output.description = prefix;
  } else {
    output.description = `${output.description}\n\n${prefix}`;
  }
}

function appendSystemTransforms(
  output: {system: string[]},
  options: ResolvedDirectivesOptions,
) {
  if (options.defaults) {
    output.system.push(systemDirective(options));
  }

  for (const line of options.system) {
    output.system.push(line);
  }
}

async function logActivation(client: Parameters<Domain>[0]["client"], options: ResolvedDirectivesOptions) {
  await client.app
    .log({
      body: {
        service: SERVICE,
        level: "info",
        message: "Directives feature enabled",
        extra: {
          defaults: options.defaults,
          mechanisms: options.mechanisms,
          customSystem: options.system.length,
          customTools: Object.keys(options.tools).length,
        },
      },
    })
    .catch(() => undefined);
}

export const DirectivesDomain: Domain = async ({ client }, rawOptions) => {
  const options = resolveDirectivesOptions(rawOptions);

  if (!shouldActivate(options)) {
    return {};
  }

  await logActivation(client, options);

  return {
    "tool.definition": ({ toolID }, output) => {
      appendToolGuidance(toolID, output, options);
      return Promise.resolve();
    },
    "experimental.chat.system.transform": (_input, output) => {
      appendSystemTransforms(output, options);
      return Promise.resolve();
    },
  };
};

export default DirectivesDomain;
