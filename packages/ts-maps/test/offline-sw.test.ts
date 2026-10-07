import { afterEach, describe, expect, test } from 'bun:test'
import { backgroundId, MemoryOfflineStore, OfflineMaps, setOfflineMaps } from '../src/core-map/offline'
import { latToUnit, lngToUnit, unitToLat, unitToLng } from '../src/core-map/offline/plan'
import { offlineServiceWorker } from '../src/offline-sw'

const Z = 14
const X = Math.floor(lngToUnit(-122.42) * 2 ** Z)
const Y = Math.floor(latToUnit(37.78) * 2 ** Z)
const at = (px: number, py: number): [number, number] => [unitToLng((X + px / 4096) / 2 ** Z), unitToLat((Y + py / 4096) / 2 ** Z)]
const [w, n] = at(1000, 1000)
const [e, s] = at(3000, 3000)
const AREA = { bounds: [w, s, e, n] as [number, number, number, number], minZoom: 13, maxZoom: 15, sources: [{ url: 'https://tiles.test/{z}/{x}/{y}.png', type: 'raster' as const }] }
const png = (): Response => new Response(new Uint8Array(20) as unknown as BodyInit, { headers: { 'content-type': 'image/png' } })

/** A service worker's scope, with a Cache Storage in memory and events to dispatch by hand. */
function fakeScope(network: (url: string) => Promise<Response>) {
  const listeners = new Map<string, Array<(event: any) => void>>()
  const stores = new Map<string, Map<string, Response>>()
  const key = (r: Request | string): string => new URL(typeof r === 'string' ? r : r.url, 'https://app.test').href
  const cache = (name: string) => {
    const entries = stores.get(name) ?? new Map<string, Response>()
    stores.set(name, entries)
    return {
      addAll: async (urls: string[]) => { for (const url of urls) entries.set(key(url), await network(key(url))) },
      put: async (r: Request, response: Response) => { entries.set(key(r), response) },
      match: async (r: Request | string) => entries.get(key(r))?.clone(),
    }
  }
  const scope = {
    addEventListener: (type: string, fn: (event: any) => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    caches: {
      open: async (name: string) => cache(name),
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (r: Request | string) => {
        for (const name of stores.keys()) {
          const hit = await cache(name).match(r)
          if (hit)
            return hit
        }
        return undefined
      },
    } as unknown as CacheStorage,
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    location: { origin: 'https://app.test' },
    fetch: ((r: Request | string) => network(key(r))) as typeof fetch,
  }
  /** Dispatch an event, and wait for what it asked to be waited for; its response, if any. */
  async function dispatch(type: string, init: Record<string, unknown> = {}): Promise<Response | undefined> {
    const waits: Promise<unknown>[] = []
    let response: Promise<Response> | undefined
    const event = { ...init, waitUntil: (p: Promise<unknown>) => waits.push(p), respondWith: (p: Promise<Response>) => (response = p) }
    for (const fn of listeners.get(type) ?? [])
      fn(event)
    await Promise.all(waits)
    return response ? await response : undefined
  }
  return { scope, stores, dispatch }
}

const pages: OfflineMaps[] = []
afterEach(() => {
  for (const page of pages.splice(0))
    page.dispose()
  setOfflineMaps(null)
  delete (navigator as any).serviceWorker
})

describe('the app shell', () => {
  test('is cached on install, old shells are cleared, and a navigation falls back to it offline', async () => {
    let up = true
    const { scope, stores, dispatch } = fakeScope(async (url) => {
      if (!up)
        throw new TypeError('offline')
      return new Response(`<html>${url}</html>`, { headers: { 'content-type': 'text/html' } })
    })
    stores.set('my-app-shell-v1', new Map())
    stores.set('someone-else', new Map())
    offlineServiceWorker({ shell: ['/', '/app.js'], cache: 'my-app-shell-v2', store: new MemoryOfflineStore() }, scope as any)
    await dispatch('install')
    await dispatch('activate')
    expect([...stores.keys()].sort()).toEqual(['my-app-shell-v2', 'someone-else'])

    up = false
    // A page not in the shell: the shell's first page stands in for it.
    const navigation = Object.defineProperty(new Request('https://app.test/trails/42'), 'mode', { value: 'navigate' })
    expect(await (await dispatch('fetch', { request: navigation }))!.text()).toBe('<html>https://app.test/</html>')
    const script = await dispatch('fetch', { request: new Request('https://app.test/app.js') })
    expect(await script!.text()).toBe('<html>https://app.test/app.js</html>')
  })
})

describe('map data the library does not fetch itself', () => {
  test('is answered from downloaded maps when the network fails', async () => {
    const store = new MemoryOfflineStore()
    const page = new OfflineMaps({ store, fetch: async () => png() })
    pages.push(page)
    await page.download(AREA)
    const url = `https://tiles.test/15/${X * 2 + 1}/${Y * 2 + 1}.png`
    const { scope, dispatch } = fakeScope(async () => { throw new TypeError('offline') })
    offlineServiceWorker({ store }, scope as any)
    const response = await dispatch('fetch', { request: new Request(url) })
    expect(response!.status).toBe(200)
    expect(response!.headers.get('content-type')).toBe('image/png')
  })
})

describe('background downloads', () => {
  /** A Background Fetch that holds its requests, like the browser's. */
  function fakeBackgroundFetch() {
    const running = new Map<string, any>()
    const manager = {
      fetch: async (id: string, urls: string[]) => {
        const listeners = new Set<() => void>()
        const registration = {
          addEventListener: (_: string, fn: () => void) => listeners.add(fn),
          removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
          emit: () => listeners.forEach(fn => fn()),
          id,
          urls,
          downloaded: 0,
          downloadTotal: 0,
          result: '' as '' | 'success' | 'failure',
          abort: async () => true,
          matchAll: async () => urls.map(url => ({ request: new Request(url), responseReady: Promise.resolve(png()) })),
        }
        running.set(id, registration)
        return registration
      },
      get: async (id: string) => running.get(id),
    }
    ;(navigator as any).serviceWorker = { controller: {}, ready: Promise.resolve({ backgroundFetch: manager }) }
    return { manager, running }
  }

  test('go to Background Fetch, report progress, and finish when the worker takes them in', async () => {
    const { running } = fakeBackgroundFetch()
    const store = new MemoryOfflineStore()
    const pageFetches: string[] = []
    const page = new OfflineMaps({ store, background: true, fetch: async (url) => { pageFetches.push(url); return png() } })
    pages.push(page)
    const progress: number[] = []
    page.on('progress', (e: any) => progress.push(e.region.downloaded))
    const done = page.download(AREA)

    // The browser has it now, not the page.
    while (!running.size)
      await new Promise(r => setTimeout(r, 1))
    const [registration] = [...running.values()]
    expect(registration.id).toBe(backgroundId(page.regions[0]!.id))
    expect(pageFetches).toEqual([])
    expect(page.regions[0]!.background).toBe(true)
    registration.downloaded = 64_000
    registration.emit()
    expect(progress.at(-1)).toBeGreaterThan(0)

    // The browser finishes; the worker stores the files and tells the page.
    const { scope, dispatch } = fakeScope(async () => png())
    offlineServiceWorker({ store }, scope as any)
    await dispatch('backgroundfetchsuccess', { registration })
    const region = await done
    expect(region.status).toBe('complete')
    expect(region.downloaded).toBe(region.tiles)
    expect(region.background).toBeUndefined()
    expect(await page.lookup(registration.urls[0])).toBeDefined()
  })

  test('a page opened while one runs follows it, rather than calling it paused', async () => {
    const { running } = fakeBackgroundFetch()
    const store = new MemoryOfflineStore()
    const first = new OfflineMaps({ store, background: true, fetch: async () => png() })
    pages.push(first)
    void first.download(AREA)
    while (!running.size)
      await new Promise(r => setTimeout(r, 1))
    first.dispose()

    // The tab closed; another opens.
    const second = new OfflineMaps({ store, background: true, fetch: async () => png() })
    pages.push(second)
    await second.ready()
    const region = second.regions[0]!
    expect(region.status).toBe('downloading')
    expect(region.interrupted).toBeUndefined()
    const completed = new Promise(resolve => second.once('complete', resolve))
    const { scope, dispatch } = fakeScope(async () => png())
    offlineServiceWorker({ store }, scope as any)
    await dispatch('backgroundfetchsuccess', { registration: [...running.values()][0] })
    await completed
    expect(second.regions[0]!.status).toBe('complete')
  })

  test('without a service worker in control, the page downloads it itself', async () => {
    const store = new MemoryOfflineStore()
    const fetched: string[] = []
    const page = new OfflineMaps({ store, background: true, fetch: async (url) => { fetched.push(url); return png() } })
    pages.push(page)
    const region = await page.download(AREA)
    expect(region.status).toBe('complete')
    expect(fetched.length).toBe(region.tiles)
  })
})
