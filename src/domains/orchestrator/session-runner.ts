import type {OpencodeClient, Session, SessionPromptResponse} from "@opencode-ai/sdk";
import {runSessionRequest} from "./session-runner-factory";

export type ToolPolicy = Readonly<Record<string, boolean>>;

export const COORDINATOR_DENIED_TOOLS = ["edit", "bash", "task", "todowrite", "orchestration_start", "orchestration_status", "orchestration_read", "orchestration_cancel"] as const;
export const BUILD_DENIED_TOOLS = ["task", "orchestration_start", "orchestration_status", "orchestration_read", "orchestration_cancel"] as const;

export type SessionRunnerRequest = {
  readonly parentSessionID: string;
  readonly title: string;
  readonly agent: string;
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly system?: string;
  readonly tools?: ToolPolicy;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
};

export type SessionRunResult = {readonly sessionID: string; readonly text: string; readonly cleanupError?: unknown};
export type SessionGateway = {
  create(request: {parentSessionID: string; title: string; signal: AbortSignal}): Promise<Session>;
  prompt(request: {sessionID: string; agent: string; provider: string; model: string; prompt: string; system?: string; tools?: ToolPolicy; signal: AbortSignal}): Promise<SessionPromptResponse>;
  delete(sessionID: string): Promise<boolean>;
};

export type SessionRunnerOptions = {readonly maxResultChars: number; readonly cleanupTimeoutMs?: number};

export class SessionRunError extends Error {
  constructor(readonly primary: unknown, readonly cleanupError?: unknown) {
    super("child session execution failed", {cause: primary});
    this.name = "SessionRunError";
  }
}

function boundedText(response: SessionPromptResponse, maxChars: number): string {
  if ((response.info as {role?: unknown}).role !== "assistant") {
    throw new Error("prompt response is not an assistant message");
  }

  const text = response.parts.filter((part) => part.type === "text").map((part) => part.text).join("");

  return text.slice(0, maxChars);
}

function copyToolPolicy(input: unknown): ToolPolicy | undefined {
  if (input === undefined) {return undefined;}
  if (typeof input !== "object" || input === null || Array.isArray(input)) {throw new Error("tools must be an object");}

  const copy: Record<string, boolean> = {};

  for (const [name, enabled] of Object.entries(input)) {
    if (typeof enabled !== "boolean" || !name.trim()) {throw new Error("tools must map names to booleans");}
    copy[name] = enabled;
  }
  return Object.freeze(copy);
}

export function createToolPolicy(denied: readonly string[], overrides: ToolPolicy = {}): ToolPolicy {
  const policy: Record<string, boolean> = {...copyToolPolicy(overrides)};

  for (const name of denied) {policy[name] = false;}
  return Object.freeze(policy);
}

export function coordinatorToolPolicy(overrides: ToolPolicy = {}): ToolPolicy {
  void overrides;
  return createToolPolicy(COORDINATOR_DENIED_TOOLS, {"*": false});
}

export function buildToolPolicy(overrides: ToolPolicy = {}): ToolPolicy {
  return createToolPolicy(BUILD_DENIED_TOOLS, overrides);
}

function validateRequest(request: SessionRunnerRequest, maxPromptChars: number): ToolPolicy | undefined {
  if (!request.agent.trim() || !request.provider.trim() || !request.model.trim()) {throw new Error("agent, provider, and model are required");}
  if (request.prompt.length > maxPromptChars) {throw new Error("prompt exceeds configured limit");}
  if (!/^[^/\s]+$/.test(request.provider) || !/^[^/\s]+$/.test(request.model)) {throw new Error("provider and model must be identifiers");}
  return copyToolPolicy(request.tools);
}

function throwPrimary(primary: unknown): never {
  if (primary instanceof Error) {throw primary;}
  throw new Error(String(primary));
}

function deadlineSignal(request: SessionRunnerRequest): {signal: AbortSignal; dispose: () => void} {
  const controller = new AbortController();

  const abort = () => { controller.abort(request.signal?.reason); };
  request.signal?.addEventListener("abort", abort, {once: true});

  if (request.signal?.aborted) { abort(); }

  const timer = request.timeoutMs === undefined ? undefined : setTimeout(() => { controller.abort("deadline exceeded"); }, request.timeoutMs);

  return {signal: controller.signal, dispose: () => { request.signal?.removeEventListener("abort", abort); if (timer) {clearTimeout(timer);} }};
}

const cleanupWithTimeout = async (gateway: SessionGateway, sessionID: string, timeoutMs: number): Promise<unknown> => {
  const cleanup = Promise.resolve().then(() => gateway.delete(sessionID));

  const guarded = cleanup.then(() => undefined, (error: unknown) => {throw error;});

  guarded.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<symbol>((resolve) => {timer = setTimeout(() => { resolve(cleanupTimeout); }, timeoutMs);});

  try {
    return await Promise.race([guarded, timeout]);
  } finally {
    if (timer) {clearTimeout(timer);}
  }
};

const cleanupTimeout = Symbol("cleanup timeout");

type Execution = {readonly child?: Session; readonly result?: SessionRunResult; readonly primary?: unknown};

const executeSession = async (gateway: SessionGateway, request: SessionRunnerRequest, tools: ToolPolicy | undefined, signal: AbortSignal, maxResultChars: number): Promise<Execution> => {
  let child: Session | undefined;

  try {
    child = await gateway.create({parentSessionID: request.parentSessionID, title: request.title, signal});
    const response = await gateway.prompt({sessionID: child.id, agent: request.agent, provider: request.provider, model: request.model, prompt: request.prompt, system: request.system, tools, signal});

    return {child, result: {sessionID: child.id, text: boundedText(response, maxResultChars)}};
  } catch (primary) {
    return {child, primary};
  }
};

const cleanupChild = async (gateway: SessionGateway, child: Session | undefined, timeoutMs: number): Promise<unknown> => {
  if (!child) {return undefined;}
  try {
    const outcome = await cleanupWithTimeout(gateway, child.id, timeoutMs);

    return outcome === cleanupTimeout ? new Error(`child session cleanup timed out after ${String(timeoutMs)} ms`) : undefined;
  } catch (error) {
    return error;
  }
};

export function createSdkSessionGateway(client: Pick<OpencodeClient, "session">, directory?: string): SessionGateway {
  return {
    create: async (request) => (await client.session.create({query: directory ? {directory} : undefined, body: {parentID: request.parentSessionID, title: request.title}, signal: request.signal, throwOnError: true})).data,
    prompt: async (request) => (await client.session.prompt({path: {id: request.sessionID}, body: {agent: request.agent, model: {providerID: request.provider, modelID: request.model}, system: request.system, tools: request.tools ? {...request.tools} : undefined, parts: [{type: "text", text: request.prompt}]}, signal: request.signal, throwOnError: true})).data,
    delete: async (sessionID) => (await client.session.delete({path: {id: sessionID}, query: directory ? {directory} : undefined, throwOnError: true})).data,
  };
}

export function createSessionRunner(gateway: SessionGateway, options: SessionRunnerOptions & {readonly maxPromptChars?: number}): (request: SessionRunnerRequest) => Promise<SessionRunResult> {
  return (request) => runSessionRequest(gateway, request, options, {validateRequest, deadlineSignal, executeSession, cleanupChild, throwPrimary});
}
