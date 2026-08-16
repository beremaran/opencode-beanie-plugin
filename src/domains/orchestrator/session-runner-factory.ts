import type {Session} from "@opencode-ai/sdk";
import type {SessionGateway, SessionRunResult, SessionRunnerOptions, SessionRunnerRequest, ToolPolicy} from "./session-runner";
import {SessionRunError} from "./session-runner";

type Execution = {readonly child?: Session; readonly result?: SessionRunResult; readonly primary?: unknown};
type Helpers = {
  readonly validateRequest: (request: SessionRunnerRequest, maxPromptChars: number) => ToolPolicy | undefined;
  readonly deadlineSignal: (request: SessionRunnerRequest) => {signal: AbortSignal; dispose: () => void};
  readonly executeSession: (gateway: SessionGateway, request: SessionRunnerRequest, tools: ToolPolicy | undefined, signal: AbortSignal, maxResultChars: number) => Promise<Execution>;
  readonly cleanupChild: (gateway: SessionGateway, child: Session | undefined, timeoutMs: number) => Promise<unknown>;
  readonly throwPrimary: (primary: unknown) => never;
};

export async function runSessionRequest(gateway: SessionGateway, request: SessionRunnerRequest, options: SessionRunnerOptions & {readonly maxPromptChars?: number}, helpers: Helpers): Promise<SessionRunResult> {
  const tools = helpers.validateRequest(request, options.maxPromptChars ?? 48000);

  const deadline = helpers.deadlineSignal(request);

  const execution = await helpers.executeSession(gateway, request, tools, deadline.signal, options.maxResultChars);
  deadline.dispose();
  const cleanupError = await helpers.cleanupChild(gateway, execution.child, options.cleanupTimeoutMs ?? 5000);

  if (execution.primary !== undefined) { if (cleanupError !== undefined) { throw new SessionRunError(execution.primary, cleanupError); } helpers.throwPrimary(execution.primary); }
  return {...execution.result as SessionRunResult, ...(cleanupError === undefined ? {} : {cleanupError})};
}
