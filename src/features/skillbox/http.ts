export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
export interface HttpGetJsonOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  retries?: number
  backoffMs?: number
}
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const backoff = (base: number, attempt: number) => base * 2 ** attempt + Math.random() * base * 0.5
function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}
export async function httpGetJson<T>(url: string, opts: HttpGetJsonOptions = {}): Promise<T> {
  const timeout = opts.timeoutMs ?? 10000
  const retries = opts.retries ?? 2
  const base = opts.backoffMs ?? 1000
  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response | undefined
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      try {
        response = await fetch(url, { headers: opts.headers, signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
    } catch (error) {
      if (attempt === retries)
        throw new HttpError(
          `network error fetching ${url}: ${error instanceof Error ? error.message : String(error)}`,
          0,
        )
      await delay(backoff(base, attempt))
      continue
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === retries)
        throw new HttpError(
          `request failed fetching ${url} (status ${response.status})`,
          response.status,
          retryAfter(response.headers.get('retry-after')),
        )
      await delay(
        response.status === 429 && retryAfter(response.headers.get('retry-after')) !== undefined
          ? retryAfter(response.headers.get('retry-after'))! * 1000
          : backoff(base, attempt),
      )
      continue
    }
    if (!response.ok) throw new HttpError(`HTTP ${response.status} fetching ${url}`, response.status)
    try {
      return (await response.json()) as T
    } catch {
      throw new HttpError(`invalid JSON response from ${url} (status ${response.status})`, response.status)
    }
  }
  throw new HttpError(`request failed fetching ${url}`, 0)
}
