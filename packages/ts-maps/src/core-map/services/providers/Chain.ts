// A chain of geocoders: ask the first, and the next when it fails.
//
// The usual chain is a self-hosted Photon in front of the public one, or a
// keyless provider in front of a keyed one, so the keyed one is billed only
// for what the free one could not answer. A provider that is rate-limited is
// skipped without being asked until it may be asked again.

import type { GeocoderOptions, GeocoderProvider, GeocodingResult, LatLngLike } from '../types'
import { RateLimitError } from '../rate-limit'

export interface GeocoderChainOptions {
  /**
   * Ask the next provider when one answers with nothing, as well as when it
   * fails. Suits a regional instance in front of a global one. Default false,
   * since with search-as-you-type it doubles the requests for every query
   * the first provider has no answer to.
   */
  fallThroughOnEmpty?: boolean
}

function isAbort(err: unknown): boolean {
  return (err as Error)?.name === 'AbortError'
}

export class GeocoderChain implements GeocoderProvider {
  name: string
  providers: GeocoderProvider[]
  private fallThroughOnEmpty: boolean
  private skipUntil = new Map<GeocoderProvider, number>()

  constructor(providers: GeocoderProvider[], options: GeocoderChainOptions = {}) {
    if (!providers.length)
      throw new Error('GeocoderChain needs at least one provider')
    this.providers = providers
    this.name = `chain(${providers.map(p => p.name).join(',')})`
    this.fallThroughOnEmpty = options.fallThroughOnEmpty ?? false
  }

  search(query: string, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    return this.run(p => p.search(query, opts))
  }

  reverse(center: LatLngLike, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    return this.run(p => p.reverse(center, opts))
  }

  private async run(ask: (provider: GeocoderProvider) => Promise<GeocodingResult[]>): Promise<GeocodingResult[]> {
    let failure: unknown
    let answered = false
    for (const provider of this.providers) {
      if ((this.skipUntil.get(provider) ?? 0) > Date.now())
        continue
      try {
        const results = await ask(provider)
        answered = true
        if (results.length || !this.fallThroughOnEmpty)
          return results
      }
      catch (err) {
        if (isAbort(err))
          throw err
        if (err instanceof RateLimitError)
          this.skipUntil.set(provider, Date.now() + err.retryAfter)
        failure = err
      }
    }
    if (!answered && failure)
      throw failure
    if (!answered)
      throw new RateLimitError(this.name, this.nextAvailable())
    return []
  }

  private nextAvailable(): number {
    const soonest = Math.min(...this.providers.map(p => this.skipUntil.get(p) ?? 0))
    return Math.max(0, soonest - Date.now())
  }
}

/** `new GeocoderChain(providers, options)`. */
export function geocoderChain(providers: GeocoderProvider[], options?: GeocoderChainOptions): GeocoderChain {
  return new GeocoderChain(providers, options)
}
