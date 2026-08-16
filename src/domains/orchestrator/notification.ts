import type {PluginInput} from "@opencode-ai/plugin";
import type {OrchestratorJob, OrchestratorStatus} from "./model";

export type NotificationResult = "sent" | "aborted" | "timeout";
export type NotificationOptions = {
  readonly input: PluginInput;
  readonly worktree: string;
  readonly rootSessionID: string;
  readonly job: OrchestratorJob;
  readonly limit: number;
  readonly timeoutMs: number;
  readonly controller: AbortController;
  readonly shouldDispatch: () => boolean;
};

type AppLogger = {log?: PluginInput["client"]["app"]["log"]};

const marker = (jobID: string, status: OrchestratorStatus, limit: number) =>
  `[orchestration-complete] job=${jobID} status=${status}. Call orchestration_read once for details.`.slice(0, limit);

const abortResult = (signal: AbortSignal) => {
  let listener: (() => void) | undefined;

  const promise = new Promise<NotificationResult>((resolve) => {
    listener = () => { resolve("aborted"); };
    if (signal.aborted) {resolve("aborted"); return;}
    signal.addEventListener("abort", listener, {once: true});
  });

  return {promise, cancel: () => {if (listener) {signal.removeEventListener("abort", listener);}}};
};

const timeoutResult = (timeoutMs: number) => {
  let timer: ReturnType<typeof setTimeout>;

  const promise = new Promise<NotificationResult>((resolve) => {timer = setTimeout(() => { resolve("timeout"); }, timeoutMs);});

  return {promise, cancel: () => { clearTimeout(timer); }};
};

const dispatch = (options: NotificationOptions) => {
  if (!options.shouldDispatch()) {return Promise.resolve("aborted" as const);}
  return Promise.resolve().then(() => {
    if (!options.shouldDispatch()) {return "aborted" as const;}
    return options.input.client.session.promptAsync({
      path: {id: options.rootSessionID},
      query: {directory: options.worktree},
      body: {parts: [{type: "text", text: marker(options.job.id, options.job.status, options.limit)}]},
      signal: options.controller.signal,
      throwOnError: true,
    }).then(() => "sent" as const);
  });
};

export const notifyCompletion = async (options: NotificationOptions): Promise<NotificationResult> => {
  const request = dispatch(options);

  const outcome = request.catch((error: unknown) => {
    if (options.controller.signal.aborted) {return "aborted" as const;}
    throw error;
  });
  outcome.catch(() => undefined);
  const abort = abortResult(options.controller.signal);

  const timeout = timeoutResult(options.timeoutMs);

  try {
    const result = await Promise.race([outcome, abort.promise, timeout.promise]);

    if (result === "timeout") {options.controller.abort("notification timeout");}
    return result;
  } finally {abort.cancel(); timeout.cancel();}
};

export const notificationTimeoutMs = (maxDurationMs: number) => Math.min(5_000, Math.max(1, maxDurationMs));

export const logNotificationFailure = (input: PluginInput, worktree: string, jobID: string, status: OrchestratorStatus): void => {
  const extra = {jobID, status};

  const app = (input.client as unknown as {app?: AppLogger}).app;

  if (typeof app?.log === "function") {
    try {
      void Promise.resolve(app.log({query: {directory: worktree}, body: {service: "beanie-orchestrator", level: "error", message: "orchestration notification failed", extra}, throwOnError: true})).catch(() => undefined);
    } catch {return;}
    return;
  }
  console.error("[beanie] orchestration notification failed", extra);
};
