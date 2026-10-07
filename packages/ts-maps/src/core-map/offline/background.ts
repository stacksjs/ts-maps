/**
 * Downloading in the background, with Background Fetch.
 *
 * A download made by the page stops when the tab closes or the device
 * sleeps. Background Fetch hands the list of URLs to the browser, which
 * fetches them whether the page is open or not, shows its own progress, and
 * gives the results to the site's service worker. `ts-maps/offline-sw` takes
 * them in there, into the same store the page reads, and tells the page.
 *
 * Chromium browsers have it; elsewhere `backgroundFetchRegistration()` is
 * undefined and downloads stay in the page, as before.
 */

/** The part of a `BackgroundFetchRegistration` used here. */
export interface BackgroundFetchLike extends EventTarget {
  id: string
  downloaded: number
  downloadTotal: number
  /** `''` while running, then `'success'` or `'failure'`. */
  result: '' | 'success' | 'failure'
  abort: () => Promise<boolean>
  matchAll?: () => Promise<Array<{ request: Request, responseReady: Promise<Response> }>>
}

/** The part of a `BackgroundFetchManager` used here. */
export interface BackgroundFetchManagerLike {
  fetch: (id: string, requests: string[], options?: { title?: string, downloadTotal?: number }) => Promise<BackgroundFetchLike>
  get: (id: string) => Promise<BackgroundFetchLike | undefined>
}

/** Background Fetch ids for downloaded maps are the region's id, prefixed. */
export const BACKGROUND_PREFIX = 'ts-maps:'

/** The channel the service worker tells pages on when it has stored a region. */
export const OFFLINE_CHANNEL = 'ts-maps-offline'

export function backgroundId(regionId: string): string {
  return `${BACKGROUND_PREFIX}${regionId}`
}

export function regionIdOf(backgroundFetchId: string): string | undefined {
  return backgroundFetchId.startsWith(BACKGROUND_PREFIX) ? backgroundFetchId.slice(BACKGROUND_PREFIX.length) : undefined
}

/**
 * The page's Background Fetch, when the browser has one and a service worker
 * is in control to receive the results. Undefined otherwise.
 */
export async function backgroundFetchRegistration(): Promise<BackgroundFetchManagerLike | undefined> {
  const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
  if (!container?.controller)
    return undefined
  try {
    const registration = await container.ready as ServiceWorkerRegistration & { backgroundFetch?: BackgroundFetchManagerLike }
    return registration.backgroundFetch
  }
  catch {
    return undefined
  }
}

/** A message on `OFFLINE_CHANNEL`: a region has changed in the store. */
export interface OfflineChannelMessage {
  type: 'region'
  id: string
}

export function offlineChannel(): BroadcastChannel | undefined {
  try {
    return typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(OFFLINE_CHANNEL)
  }
  catch {
    return undefined
  }
}
