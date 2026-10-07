/**
 * `ts-maps/offline-sw`: a service worker for an app with offline maps.
 *
 * Downloaded maps make the map, search and directions work with no
 * connection, but opening the page with none also needs the page itself: its
 * HTML, scripts and styles. That is a service worker's job, and this is one
 * to import into yours:
 *
 * ```ts
 * // sw.ts, bundled for the browser
 * import { offlineServiceWorker } from 'ts-maps/offline-sw'
 *
 * offlineServiceWorker({
 *   shell: ['/', '/app.js', '/app.css', '/ts-maps.css'],
 *   cache: 'my-app-shell-v3',
 * })
 * ```
 *
 * It does three things, each of which can be turned off:
 *
 * - **The app shell.** `shell` is cached on install. A navigation goes to the
 *   network first and falls back to the cached page, so a hard reload with no
 *   connection still opens the app. Old shell caches are deleted on activate.
 * - **Map data the library does not fetch itself.** The map reads downloaded
 *   tiles on its own; an `<img>` in a popup or a raster a page draws by hand
 *   does not. Those are answered from the downloaded maps when the network
 *   fails.
 * - **Background downloads.** With `new OfflineMaps({ background: true })`,
 *   downloads go to Background Fetch, which carries on with the tab closed.
 *   Their files arrive here and are stored where the page reads them, and
 *   the page is told.
 */

import type { OfflineStore } from '../core-map/offline/OfflineStore'
import { regionIdOf } from '../core-map/offline/background'
import { OfflineMaps } from '../core-map/offline/OfflineMaps'
import { IndexedDBOfflineStore } from '../core-map/offline/OfflineStore'

export interface OfflineServiceWorkerOptions {
  /** Same-origin URLs to cache on install: the page, its scripts and styles. */
  shell?: string[]
  /**
   * The page a navigation falls back to with no connection, when the page
   * asked for is not cached itself. Default the first of `shell`.
   */
  fallback?: string
  /**
   * The shell's cache. Put a version in it and change it with each release:
   * on activate, other caches named the same up to the last `-` are deleted.
   * Default `'ts-maps-shell-v1'`.
   */
  cache?: string
  /**
   * Also cache same-origin GETs outside `shell` as they are fetched, to serve
   * when the network fails. The network comes first while there is one, so
   * a new build is picked up at once. `true` for every one the server lets
   * be cached; a function to choose. Default false.
   */
  runtime?: boolean | ((url: URL, request: Request) => boolean)
  /** Answer requests for map data from downloaded maps when the network fails. Default true. */
  maps?: boolean
  /** Take in Background Fetch downloads of offline maps. Default true. */
  backgroundFetch?: boolean
  /** Take over open pages as soon as installed (`skipWaiting`, `clients.claim`). Default true. */
  takeOver?: boolean
  /** Where downloads are kept. Default the same IndexedDB store pages use. */
  store?: OfflineStore
}

/** The parts of a service worker's global scope used here; injectable for tests. */
export interface ServiceWorkerScopeLike {
  addEventListener: (type: string, listener: (event: any) => void) => void
  caches: CacheStorage
  clients?: { claim: () => Promise<void>, openWindow?: (url: string) => Promise<unknown> }
  registration?: { scope: string }
  location?: { origin: string, href?: string }
  skipWaiting?: () => Promise<void>
  fetch?: typeof fetch
}

export interface OfflineServiceWorker {
  /** The downloaded maps, once anything has been downloaded. */
  maps: () => Promise<OfflineMaps | undefined>
}

const DEFAULT_CACHE = 'ts-maps-shell-v1'

/** Whether a response may be kept in a cache shared by every visit. */
function cacheable(response: Response): boolean {
  if (!response.ok || response.type !== 'basic')
    return false
  const control = response.headers.get('cache-control') ?? ''
  return !/no-store|private/i.test(control) && !response.headers.has('set-cookie')
}

export function offlineServiceWorker(options: OfflineServiceWorkerOptions = {}, scope: ServiceWorkerScopeLike = globalThis as unknown as ServiceWorkerScopeLike): OfflineServiceWorker {
  const cacheName = options.cache ?? DEFAULT_CACHE
  const family = cacheName.includes('-') ? cacheName.slice(0, cacheName.lastIndexOf('-') + 1) : cacheName
  const shell = options.shell ?? []
  const fallback = options.fallback ?? shell[0]
  const takeOver = options.takeOver ?? true
  const network = (request: Request | string): Promise<Response> => (scope.fetch ?? fetch)(request)
  const origin = scope.location?.origin ?? (typeof location === 'undefined' ? '' : location.origin)
  // Relative shell URLs are relative to the worker's own script, as
  // `cache.addAll` reads them.
  const base = scope.location?.href ?? (origin || 'http://localhost')
  const shellPaths = new Set(shell.map(url => new URL(url, base).pathname))

  let manager: OfflineMaps | undefined
  const maps = async (): Promise<OfflineMaps | undefined> => {
    // A worker for a page that has never downloaded anything should not
    // create a database just to find it empty.
    if (!manager && !options.store && !(await IndexedDBOfflineStore.exists().catch(() => false)))
      return undefined
    manager ??= new OfflineMaps({ store: options.store ?? new IndexedDBOfflineStore() })
    await manager.ready()
    return manager
  }

  scope.addEventListener('install', (event: any) => {
    event.waitUntil((async () => {
      if (shell.length)
        await (await scope.caches.open(cacheName)).addAll(shell)
      if (takeOver)
        await scope.skipWaiting?.()
    })())
  })

  scope.addEventListener('activate', (event: any) => {
    event.waitUntil((async () => {
      for (const key of await scope.caches.keys()) {
        if (key !== cacheName && key.startsWith(family))
          await scope.caches.delete(key)
      }
      if (takeOver)
        await scope.clients?.claim()
    })())
  })

  const fromDownloads = async (url: string): Promise<Response | undefined> => {
    const offline = await maps()
    const hit = await offline?.lookup(url).catch(() => undefined)
    if (!hit)
      return undefined
    const empty = hit.data.byteLength === 0
    return new Response(empty ? null : (hit.data as unknown as BodyInit), { status: empty ? 204 : 200, headers: { 'content-type': hit.mime } })
  }

  scope.addEventListener('fetch', (event: any) => {
    const request = event.request as Request
    if (request.method !== 'GET')
      return
    const url = new URL(request.url)
    const sameOrigin = !origin || url.origin === origin

    if (sameOrigin && request.mode === 'navigate') {
      // The network first: HTML can carry a session, and should be fresh.
      event.respondWith(network(request).catch(async () => {
        const cached = await scope.caches.match(request) ?? (fallback ? await scope.caches.match(fallback) : undefined)
        return cached ?? Response.error()
      }))
      return
    }

    // The shell, from the cache: it is versioned by the cache's name.
    if (sameOrigin && shellPaths.has(url.pathname)) {
      event.respondWith(scope.caches.match(request).then(cached => cached ?? network(request)))
      return
    }
    // Anything else kept as it loads, from the network while there is one,
    // so a new build is picked up at once, and from the cache when not.
    const runtime = typeof options.runtime === 'function' ? options.runtime(url, request) : !!options.runtime
    if (sameOrigin && runtime) {
      event.respondWith(network(request).then(async (response) => {
        if (cacheable(response))
          await (await scope.caches.open(cacheName)).put(request, response.clone())
        return response
      }, async (error) => {
        const cached = await scope.caches.match(request)
        if (cached)
          return cached
        throw error
      }))
      return
    }

    if (options.maps === false)
      return
    event.respondWith(network(request).catch(async (error) => {
      const stored = await fromDownloads(request.url)
      if (stored)
        return stored
      throw error
    }))
  })

  if (options.backgroundFetch !== false) {
    // Success or failure, the files that did arrive are kept: a failed
    // region is left in error with them, and resuming fetches the rest.
    const take = (event: any): void => {
      const id = regionIdOf(event.registration?.id ?? '')
      if (!id)
        return
      event.waitUntil((async () => {
        const records = await event.registration.matchAll()
        const files = records.map((record: { request: Request, responseReady: Promise<Response> }) => ({ url: record.request.url, response: record.responseReady }))
        const region = await (await maps())?.ingest(id, files)
        if (typeof event.updateUI === 'function' && region) {
          await event.updateUI({
            title: region.status === 'complete' ? `${region.name} is ready to use offline` : `${region.name} did not finish downloading`,
          }).catch(() => {})
        }
      })())
    }
    scope.addEventListener('backgroundfetchsuccess', take)
    scope.addEventListener('backgroundfetchfail', take)
    scope.addEventListener('backgroundfetchabort', (event: any) => {
      const id = regionIdOf(event.registration?.id ?? '')
      if (!id)
        return
      event.waitUntil(maps().then(offline => offline?.stopped(id)))
    })
    scope.addEventListener('backgroundfetchclick', (event: any) => {
      if (regionIdOf(event.registration?.id ?? '') && scope.clients?.openWindow)
        event.waitUntil(scope.clients.openWindow(scope.registration?.scope ?? '/'))
    })
  }

  return { maps }
}
