import type { Config, Hooks, PluginInput } from "@opencode-ai/plugin";
import type { Domain } from "../../shared/domain";
import { COMMIT_PROMPT } from "./prompt";

const STATUS_COMMAND = "git status --short";

const CONTEXT_COMMAND =
  "git diff --stat && git diff --check && git log -10 --oneline";

const DESCRIPTION =
  "Create focused, verified Conventional Commits from the current worktree.";

type ShellInput = { sessionID: string; command: string };
type Ownership = { value: boolean };
type BeforeCommand = NonNullable<Hooks["command.execute.before"]>;

function responseError(value: unknown) {
  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;

  const data =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : record;

  const error = record.error ?? data.error;

  if (!error) {
    return;
  }

  return "shell request returned an error";
}

function shellRequest(input: PluginInput, request: ShellInput) {
  return input.client.session.shell({
    path: { id: request.sessionID },
    body: { agent: "build", command: request.command },
    throwOnError: true,
  });
}

async function gatherContext(input: PluginInput, sessionID: string) {
  const status = await shellRequest(input, {
    sessionID,
    command: STATUS_COMMAND,
  });

  if (responseError(status)) {
    throw new Error("shell request returned an error");
  }

  const context = await shellRequest(input, {
    sessionID,
    command: CONTEXT_COMMAND,
  });

  if (responseError(context)) {
    throw new Error("shell request returned an error");
  }
}

function contextError(error: unknown) {
  const detail =
    error instanceof Error ? error.message : "unknown shell failure";

  return new Error(`Commit context gathering failed: ${detail}`);
}

function configureCommit(config: Config, ownership: Ownership) {
  ownership.value = !config.command?.commit;

  if (ownership.value) {
    config.command = {
      ...config.command,
      commit: {
        description: DESCRIPTION,
        template: COMMIT_PROMPT,
        agent: "build",
      },
    };
  }

  return Promise.resolve();
}

async function executeCommit(
  input: PluginInput,
  ownership: Ownership,
  command: Parameters<BeforeCommand>[0],
) {
  if (command.command !== "commit" || !ownership.value) {
    return;
  }

  try {
    await gatherContext(input, command.sessionID);
  } catch (error) {
    throw contextError(error);
  }
}

function createHooks(input: PluginInput, ownership: Ownership): Hooks {
  return {
    config: (config) => configureCommit(config, ownership),
    "command.execute.before": (command) =>
      executeCommit(input, ownership, command),
  };
}

export const CommitCommandDomain: Domain = (input) => {
  const ownership: Ownership = { value: false };

  return Promise.resolve(createHooks(input, ownership));
};
