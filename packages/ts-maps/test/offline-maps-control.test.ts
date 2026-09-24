import { afterEach, describe, expect, test } from 'bun:test'
import { control, TileLayer, TsMap } from '../src/core-map'
import { formatBytes, OFFLINE_MAPS_EVENTS, OfflineMapsControl } from '../src/core-map/control/OfflineMapsControl'
import { MemoryOfflineStore, OfflineMaps, setOfflineMaps } from '../src/core-map/offline'

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

function tileServer() {
  const requests: string[] = []
  return {
    requests,
    fetch: async (url: string): Promise<Response> => {
      requests.push(url)
      return new Response(PNG as unknown as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } })
    },
  }
}

function makeMap(): TsMap {
  const container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  Object.defineProperty(container, 'clientWidth', { value: 800 })
  Object.defineProperty(container, 'clientHeight', { value: 600 })
  document.body.appendChild(container)
  const map = new TsMap(container, { zoomAnimation: false })
  map.setView([37.78, -122.42], 15)
  new TileLayer('https://img.test/{z}/{x}/{y}.png').addTo(map)
  return map
}

const tick = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

async function until(check: () => boolean, ms = 1000): Promise<void> {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end)
      throw new Error('timed out')
    await tick(5)
  }
}

let online = true
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })

afterEach(() => {
  setOfflineMaps(null)
  online = true
  document.body.innerHTML = ''
})

describe('formatBytes', () => {
  test('reads the way Apple writes sizes', () => {
    expect(formatBytes(512)).toBe('512 bytes')
    expect(formatBytes(850_000)).toBe('850 KB')
    expect(formatBytes(3_400_000)).toBe('3.4 MB')
    expect(formatBytes(312_000_000)).toBe('312 MB')
    expect(formatBytes(1_240_000_000)).toBe('1.2 GB')
  })
})

describe('OfflineMapsControl', () => {
  test('lists nothing, then offers to download', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tileServer().fetch })
    const map = makeMap()
    const offline = control.offlineMaps({ maps }).addTo(map)
    offline.open()
    await tick()
    const card = map.getContainer().querySelector('.tsmap-offline-card')!
    expect(card.querySelector('.tsmap-offline-title')?.textContent).toBe('Offline Maps')
    expect(card.querySelector('.tsmap-offline-empty')).not.toBeNull()
    expect(card.querySelector('.tsmap-offline-new')).not.toBeNull()
  })

  test('picks an area, estimates it, and downloads it into the list', async () => {
    const server = tileServer()
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: server.fetch })
    const map = makeMap()
    const offline = control.offlineMaps({ maps }).addTo(map)
    offline.open()
    ;(map.getContainer().querySelector('.tsmap-offline-new') as HTMLElement).click()

    const select = map.getContainer().querySelector('.tsmap-offline-select')!
    expect(select.querySelectorAll('.tsmap-offline-handle')).toHaveLength(4)
    const bounds = offline.selectedBounds()!
    expect(bounds[0]).toBeLessThan(-122.42)
    expect(bounds[2]).toBeGreaterThan(-122.42)

    const estimate = map.getContainer().querySelector('.tsmap-offline-estimate')!
    expect(estimate.textContent).toContain('Estimated size')
    const name = map.getContainer().querySelector<HTMLInputElement>('.tsmap-offline-name')!
    name.value = 'Downtown'
    name.dispatchEvent(new Event('input'))

    ;(map.getContainer().querySelector('.tsmap-offline-download') as HTMLElement).click()
    expect(map.getContainer().querySelector('.tsmap-offline-select')).toBeNull()
    await until(() => maps.regions[0]?.status === 'complete')

    const region = maps.regions[0]!
    expect(region.name).toBe('Downtown')
    // Zoom 0 to 16 of the one image layer on the map.
    expect(region.maxZoom).toBe(16)
    expect(server.requests.every(u => u.startsWith('https://img.test/'))).toBe(true)
    await until(() => !!map.getContainer().querySelector('.tsmap-offline-row[data-status="complete"]'))
    const row = map.getContainer().querySelector('.tsmap-offline-row')!
    expect(row.querySelector('.tsmap-offline-row-name')?.textContent).toBe('Downtown')
    expect(row.textContent).toContain('Downloaded')
  })

  test('dragging a corner makes the area smaller', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tileServer().fetch })
    const map = makeMap()
    const offline = control.offlineMaps({ maps }).addTo(map)
    offline.selectArea()
    const before = offline.selectedBounds()!
    const handle = map.getContainer().querySelector<HTMLElement>('.tsmap-offline-handle-ne')!
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 700, clientY: 100, pointerId: 1 }))
    handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 600, clientY: 200, pointerId: 1 }))
    handle.dispatchEvent(new PointerEvent('pointerup', { clientX: 600, clientY: 200, pointerId: 1 }))
    const after = offline.selectedBounds()!
    expect(after[2]).toBeLessThan(before[2])
    expect(after[3]).toBeLessThan(before[3])
    expect(after[0]).toBeCloseTo(before[0], 9)
  })

  test('deleting asks once more before it deletes', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tileServer().fetch })
    const map = makeMap()
    await maps.download({ bounds: [-122.421, 37.779, -122.419, 37.781], minZoom: 16, map, name: 'Block' })
    const offline = control.offlineMaps({ maps }).addTo(map)
    offline.open()
    await tick()
    const container = map.getContainer()
    ;(container.querySelector('[data-action="delete"]') as HTMLElement).click()
    expect(maps.regions).toHaveLength(1)
    ;(container.querySelector('[data-action="confirm-delete"]') as HTMLElement).click()
    await until(() => maps.regions.length === 0)
    await until(() => !!container.querySelector('.tsmap-offline-empty'))
  })

  test('says so when the connection drops, and whether the map is downloaded here', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tileServer().fetch })
    const map = makeMap()
    control.offlineMaps({ maps }).addTo(map)
    expect(map.getContainer().querySelector('.tsmap-offline-pill')).toBeNull()

    online = false
    window.dispatchEvent(new Event('offline'))
    expect(map.getContainer().querySelector('.tsmap-offline-pill')?.textContent).toBe('You’re Offline')

    await maps.download({ bounds: [-122.43, 37.77, -122.41, 37.79], minZoom: 16, map })
    await until(() => map.getContainer().querySelector('.tsmap-offline-pill')?.textContent === 'Offline · Using Downloaded Maps')

    online = true
    window.dispatchEvent(new Event('online'))
    expect(map.getContainer().querySelector('.tsmap-offline-pill')).toBeNull()
  })
})

describe('image tiles', () => {
  test('come from downloaded maps before the network', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tileServer().fetch })
    setOfflineMaps(maps)
    const map = makeMap()
    const layer = Object.values((map as any)._layers).find((l: any) => l instanceof TileLayer) as TileLayer
    await maps.download({ bounds: [-122.43, 37.77, -122.41, 37.79], minZoom: 15, maxZoom: 15, map })

    const tile = layer.createTile(Object.assign({ x: 5241, y: 12664, z: 15 }) as any, () => {}) as HTMLImageElement
    const url = layer.getTileUrl({ x: 5241, y: 12664, z: 15 } as any)
    expect(await maps.lookup(url)).toBeDefined()
    await until(() => tile.src.startsWith('blob:'))
  })

  test('with only offline maps, a tile not downloaded fails rather than fetching', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tileServer().fetch })
    setOfflineMaps(maps)
    const map = makeMap()
    const layer = Object.values((map as any)._layers).find((l: any) => l instanceof TileLayer) as TileLayer
    await maps.download({ bounds: [-122.421, 37.779, -122.419, 37.781], minZoom: 16, maxZoom: 16, map })
    maps.onlyOffline = true
    let error: unknown
    const tile = layer.createTile({ x: 1, y: 1, z: 15 } as any, (err) => { error = err }) as HTMLImageElement
    await until(() => error !== undefined)
    expect(String(error)).toContain('Only using offline maps')
    expect(tile.getAttribute('src') ?? '').not.toContain('img.test')
  })
})

describe('for the framework bindings', () => {
  test('sync follows open and onlyOffline, and listen hears both', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tileServer().fetch })
    const map = makeMap()
    const offline = control.offlineMaps({ maps }).addTo(map)
    const heard: Array<[string, unknown]> = []
    const stop = offline.listen((type, e) => heard.push([type, e]))

    offline.sync({ open: true })
    expect(offline.isOpen).toBe(true)
    offline.sync({ onlyOffline: true })
    expect(maps.onlyOffline).toBe(true)
    // Left out is left alone.
    offline.sync({})
    expect(offline.isOpen).toBe(true)
    expect(maps.onlyOffline).toBe(true)
    offline.sync({ open: false, onlyOffline: false })
    expect(offline.isOpen).toBe(false)

    await maps.download({ bounds: [-122.421, 37.779, -122.419, 37.781], minZoom: 16, map })
    stop()
    maps.onlyOffline = true

    const types = heard.map(([type]) => type)
    expect(types).toContain('openchange')
    expect(types).toContain('modechange')
    expect(types).toContain('complete')
    expect(heard.filter(([t]) => t === 'modechange')).toHaveLength(2)
    expect(heard.filter(([t]) => t === 'openchange').map(([, e]) => (e as any).open)).toEqual([true, false])
  })

  test('the switch in the panel reports the change', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: tileServer().fetch })
    const map = makeMap()
    const offline = control.offlineMaps({ maps }).addTo(map)
    const modes: boolean[] = []
    offline.listen((type, e) => type === 'modechange' && modes.push(e.onlyOffline))
    offline.open()
    const toggle = map.getContainer().querySelector<HTMLInputElement>('.tsmap-offline-switch')!
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    expect(modes).toEqual([true])
  })

  test('events reduce to plain data', () => {
    const region = { id: 'r', name: 'R', bounds: [0, 0, 1, 1], status: 'complete' }
    expect(OfflineMapsControl.plainEvent('progress', { region })).toEqual({ region })
    expect(OfflineMapsControl.plainEvent('error', { region, error: new Error('boom') })).toEqual({ region, message: 'boom' })
    expect(OfflineMapsControl.plainEvent('modechange', { onlyOffline: true })).toEqual({ onlyOffline: true })
    expect(OfflineMapsControl.plainEvent('delete', { id: 'r' })).toEqual({ id: 'r' })
    expect(Object.keys(OFFLINE_MAPS_EVENTS)).toEqual(['change', 'progress', 'complete', 'error', 'delete', 'modechange', 'openchange'])
  })
})
