const DEFAULT_TIMEOUT_MS = 10_000;

const DEFAULT_RETRIES = 2;

const DEFAULT_BACKOFF_MS = 1000;

const EXPONENTIAL_BASE = 2;

const BACKOFF_JITTER = 0.5;

const TOO_MANY_REQUESTS_STATUS = 429;

const SERVER_ERROR_MIN_STATUS = 500;

const MS_PER_SECOND = 1000;

const NETWORK_ERROR_STATUS = 0;

export interface HttpGetOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

interface FetchConfig {
  headers?: Record<string, string>;
  timeout: number;
  retries: number;
  base: number;
}

export class HttpError extends Error {
  readonly status: number;

  readonly retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number, cause?: unknown) {
    super(message, { cause });
    this.name = "HttpError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const backoff = (base: number, attempt: number) =>
  base * EXPONENTIAL_BASE ** attempt + Math.random() * base * BACKOFF_JITTER;

function retryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const n = Number(value);

  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryable(status: number): boolean {
  return status === TOO_MANY_REQUESTS_STATUS || status >= SERVER_ERROR_MIN_STATUS;
}

function retryDelayMs(response: Response, base: number, attempt: number): number {
  if (response.status === TOO_MANY_REQUESTS_STATUS) {
    const seconds = retryAfter(response.headers.get("retry-after"));

    if (seconds !== undefined) {
      return seconds * MS_PER_SECOND;
    }
  }

  return backoff(base, attempt);
}

async function attemptFetch(
  url: string,
  headers: Record<string, string> | undefined,
  timeout: number,
): Promise<Response> {
  const controller = new AbortController();

  const timer = setTimeout(() => { controller.abort(); }, timeout);

  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, config: FetchConfig, attempt: number): Promise<Response> {
  let response: Response;

  try {
    response = await attemptFetch(url, config.headers, config.timeout);
  } catch (error) {
    if (attempt >= config.retries) {
      throw new HttpError(`network error fetching ${url}: ${errorMessage(error)}`, NETWORK_ERROR_STATUS, undefined, error);
    }
    await delay(backoff(config.base, attempt));

    return fetchWithRetry(url, config, attempt + 1);
  }

  if (!isRetryable(response.status)) {
    return response;
  }
  if (attempt >= config.retries) {
    throw new HttpError(`request failed fetching ${url} (status ${String(response.status)})`, response.status, retryAfter(response.headers.get("retry-after")));
  }
  await delay(retryDelayMs(response, config.base, attempt));

  return fetchWithRetry(url, config, attempt + 1);
}

function toConfig(opts: HttpGetOptions): FetchConfig {
  return {
    headers: opts.headers,
    timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: opts.retries ?? DEFAULT_RETRIES,
    base: opts.backoffMs ?? DEFAULT_BACKOFF_MS,
  };
}

export async function httpGetJson<T>(url: string, opts: HttpGetOptions = {}): Promise<T> {
  const response = await fetchWithRetry(url, toConfig(opts), 0);

  if (!response.ok) {
    throw new HttpError(`request failed fetching ${url} (status ${String(response.status)})`, response.status, retryAfter(response.headers.get("retry-after")));
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new HttpError(`invalid JSON response from ${url} (status ${String(response.status)})`, response.status, undefined, error);
  }
}

export async function httpGetText(url: string, opts: HttpGetOptions = {}): Promise<string> {
  const response = await fetchWithRetry(url, toConfig(opts), 0);

  if (!response.ok) {
    throw new HttpError(`request failed fetching ${url} (status ${String(response.status)})`, response.status, retryAfter(response.headers.get("retry-after")));
  }

  return response.text();
}
