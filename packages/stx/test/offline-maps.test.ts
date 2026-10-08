import { describe, expect, test } from 'bun:test'
import { Map as MapInstance, MemoryOfflineStore, offlineMaps, OfflineMaps as Manager } from 'ts-maps'
import { mountChildren } from '../src/runtime'

const png = async (): Promise<Response> => new Response(new Uint8Array([137, 80, 78, 71]) as unknown as BodyInit, { headers: { 'content-type': 'image/png' } })
const tick = (): Promise<void> => new Promise(r => setTimeout(r, 0))

function setup(): { root: HTMLElement, map: MapInstance } {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const mapEl = document.createElement('div')
  mapEl.style.width = '430px'
  mapEl.style.height = '800px'
  root.appendChild(mapEl)
  return { root, map: new MapInstance(mapEl, { center: [37.78, -122.42], zoom: 15 }) }
}

describe('offline-maps child', () => {
  test('is built from markup, opens as asked, and reports through DOM events', async () => {
    const { root, map } = setup()

    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="offline-maps" data-options='${JSON.stringify({ open: true, position: 'topleft' })}'></span>`)

    let control: any = null
    const seen: Array<[string, unknown]> = []
    root.addEventListener('offlinemaps:ready', (e: any) => {
      control = e.detail.control
    })
    for (const name of ['openchange', 'modechange', 'complete'])
      root.addEventListener(`offlinemaps:${name}`, (e: any) => seen.push([name, name === 'openchange' ? e.detail.open : e.detail.onlyOffline]))

    const unmount = mountChildren(map, root)
    expect(control).not.toBeNull()
    expect(root.querySelector('.tsmap-top.tsmap-left .tsmap-offline-button')).not.toBeNull()
    expect(root.querySelector('.tsmap-offline-card')).not.toBeNull()
    expect(seen).toContainEqual(['openchange', true])

    control.sync({ onlyOffline: true })
    expect(seen).toContainEqual(['modechange', true])
    expect(control.maps).toBe(offlineMaps())
    control.sync({ onlyOffline: false })

    // A manager the page swaps in brings its events with it: the DOM events
    // come from the manager shown now, not the page's default.
    const mine = new Manager({ store: new MemoryOfflineStore(), fetch: png })
    const progress: string[] = []
    root.addEventListener('offlinemaps:progress', (e: any) => progress.push(e.detail.from))
    control.sync({ maps: mine })
    expect(control.maps).toBe(mine)
    offlineMaps().fire('progress', { from: 'default' })
    mine.fire('progress', { from: 'mine' })
    expect(progress).toEqual(['mine'])

    unmount()
    expect(root.querySelector('.tsmap-offline-button')).toBeNull()
    root.remove()
  })

  test('follows its props after mount, and keeps the manager the page gave it', async () => {
    const { root, map } = setup()
    const resources = ['https://tiles.test/tiles.json']
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="offline-maps" data-options='${JSON.stringify({ resources })}'></span>`)
    const el = root.querySelector('[data-ts-map-child="offline-maps"]')!
    const mine = new Manager({ store: new MemoryOfflineStore(), fetch: png })
    let control: any = null
    root.addEventListener('offlinemaps:ready', (e: any) => {
      control = e.detail.control
      control.sync({ maps: mine })
    })

    const unmount = mountChildren(map, root)
    el.setAttribute('data-options', JSON.stringify({ resources, position: 'bottomleft', title: 'Downloads' }))
    await tick()
    expect(root.querySelector('.tsmap-bottom.tsmap-left .tsmap-offline-button')?.getAttribute('title')).toBe('Downloads')
    expect(control.maps).toBe(mine)

    // A prop taken away goes back to its default.
    el.setAttribute('data-options', JSON.stringify({}))
    await tick()
    expect(root.querySelector('.tsmap-top.tsmap-right .tsmap-offline-button')?.getAttribute('title')).toBe('Offline Maps')
    expect(control.options.resources).toBeUndefined()
    expect(control.maps).toBe(mine)

    // Taken down with the map: later markup changes reach nothing.
    unmount()
    el.setAttribute('data-options', JSON.stringify({ open: true }))
    await tick()
    expect(root.querySelector('.tsmap-offline-card')).toBeNull()
    root.remove()
  })
})
