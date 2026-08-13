const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_RETRIES = 2
const DEFAULT_BACKOFF_MS = 1000
const EXPONENTIAL_BASE = 2
const BACKOFF_JITTER = 0.5
const TOO_MANY_REQUESTS_STATUS = 429
const SERVER_ERROR_MIN_STATUS = 500
const MS_PER_SECOND = 1000
const NETWORK_ERROR_STATUS = 0
interface FetchConfig {
  headers?: Record<string, string>
  timeout: number
  retries: number
  base: number
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const backoff = (base: number, attempt: number) =>
  base * EXPONENTIAL_BASE ** attempt + Math.random() * base * BACKOFF_JITTER

function retryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined
  }
  const n = Number(value)
  if (Number.isFinite(n) && n >= 0) {
    return n
  }
  return undefined
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function isRetryable(status: number): boolean {
  return status === TOO_MANY_REQUESTS_STATUS || status >= SERVER_ERROR_MIN_STATUS
}

function retryDelayMs(response: Response, base: number, attempt: number): number {
  let header: number | undefined
  if (response.status === TOO_MANY_REQUESTS_STATUS) {
    header = retryAfter(response.headers.get('retry-after'))
  }
  if (header !== undefined) {
    return header * MS_PER_SECOND
  }
  return backoff(base, attempt)
}

async function attemptFetch(
  url: string,
  headers: Record<string, string> | undefined,
  timeout: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { headers, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchWithRetry(url: string, config: FetchConfig, attempt: number): Promise<Response> {
  let response: Response
  try {
    response = await attemptFetch(url, config.headers, config.timeout)
  } catch (error) {
    if (attempt >= config.retries) {
      // biome-ignore lint/style/useErrorCause: the caught error is forwarded into the native Error `cause` option via HttpError's constructor; the linter cannot see through the wrapper class.
      throw new HttpError(
        `network error fetching ${url}: ${errorMessage(error)}`,
        NETWORK_ERROR_STATUS,
        undefined,
        error,
      )
    }
    await delay(backoff(config.base, attempt))
    return fetchWithRetry(url, config, attempt + 1)
  }
  if (!isRetryable(response.status)) {
    return response
  }
  if (attempt >= config.retries) {
    throw new HttpError(
      `request failed fetching ${url} (status ${response.status})`,
      response.status,
      retryAfter(response.headers.get('retry-after')),
    )
  }
  await delay(retryDelayMs(response, config.base, attempt))
  return fetchWithRetry(url, config, attempt + 1)
}

export class HttpError extends Error {
  readonly status: number
  readonly retryAfterSeconds?: number

  constructor(message: string, status: number, retryAfterSeconds?: number, cause?: unknown) {
    super(message, { cause })
    this.name = 'HttpError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export interface HttpGetJsonOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  retries?: number
  backoffMs?: number
}

export async function httpGetJson<T>(url: string, opts: HttpGetJsonOptions = {}): Promise<T> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = opts.retries ?? DEFAULT_RETRIES
  const base = opts.backoffMs ?? DEFAULT_BACKOFF_MS
  const response = await fetchWithRetry(url, { headers: opts.headers, timeout, retries, base }, 0)
  try {
    return (await response.json()) as T
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the caught error is forwarded into the native Error `cause` option via HttpError's constructor; the linter cannot see through the wrapper class.
    throw new HttpError(
      `invalid JSON response from ${url} (status ${response.status})`,
      response.status,
      undefined,
      error,
    )
  }
}
