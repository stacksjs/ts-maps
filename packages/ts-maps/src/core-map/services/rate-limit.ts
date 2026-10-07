// Rate limits on the keyless public services.
//
// Photon's and Nominatim's public instances are shared and answer 429 when a
// client asks too often. Search-as-you-type asks on every pause, so a busy
// page meets that limit. A short wait is worth one retry; a long one is not,
// since the user has typed on by then. After that the provider backs off
// for a while, asking nothing, so the page stops adding to the load, and
// callers fall back to what they have (the map's own places, offline maps,
// the next provider in a chain).

/** Thrown while a provider is rate-limited. `retryAfter` is in milliseconds. */
export class RateLimitError extends Error {
  provider: string
  retryAfter: number

  constructor(provider: string, retryAfter: number) {
    super(`${provider} is rate-limited; retry in ${Math.ceil(retryAfter / 1000)} s`)
    this.name = 'RateLimitError'
    this.provider = provider
    this.retryAfter = retryAfter
  }
}

export interface RateLimitOptions {
  /** Retries after a 429 whose wait is short enough. Default 1. */
  retries?: number
  /** The longest wait worth retrying after, in ms. Default 2000. */
  maxRetryDelay?: number
  /**
   * How long to stop asking once retries run out, in ms, doubling for each
   * limit in a row up to five minutes. A longer `Retry-After` wins. Default 30000.
   */
  cooldown?: number
}

/** The wait a 429 or 503 asks for, from `Retry-After` (seconds or a date), in ms. */
export function retryAfterMs(response: Response, now: number = Date.now()): number | undefined {
  const header = response.headers?.get('Retry-After')
  if (!header)
    return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds))
    return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - now)
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const MAX_COOLDOWN = 5 * 60_000

/**
 * One provider's rate-limit state. `fetch` behaves like the global one but
 * retries a short 429 and throws `RateLimitError` while the provider is
 * backing off.
 */
export class RateLimiter {
  name: string
  /** When the provider may be asked again, as a `Date.now()` time. */
  until: number = 0
  private strikes = 0
  private retries: number
  private maxRetryDelay: number
  private cooldown: number

  constructor(name: string, options: RateLimitOptions = {}) {
    this.name = name
    this.retries = options.retries ?? 1
    this.maxRetryDelay = options.maxRetryDelay ?? 2000
    this.cooldown = options.cooldown ?? 30_000
  }

  /** Whether the provider is backing off now. */
  get limited(): boolean {
    return Date.now() < this.until
  }

  async fetch(url: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Response> {
    const wait = this.until - Date.now()
    if (wait > 0)
      throw new RateLimitError(this.name, wait)
    for (let attempt = 0; ; attempt++) {
      const response = await fetcher(url, init)
      const limited = response.status === 429 || (response.status === 503 && !!response.headers?.has('Retry-After'))
      if (!limited) {
        this.strikes = 0
        return response
      }
      const asked = retryAfterMs(response)
      const delay = asked ?? 250 * 2 ** attempt
      if (attempt < this.retries && delay <= this.maxRetryDelay) {
        await sleep(delay, init.signal)
        continue
      }
      this.strikes++
      const backoff = Math.min(MAX_COOLDOWN, this.cooldown * 2 ** (this.strikes - 1))
      const pause = Math.max(asked ?? 0, backoff)
      this.until = Date.now() + pause
      throw new RateLimitError(this.name, pause)
    }
  }
}
