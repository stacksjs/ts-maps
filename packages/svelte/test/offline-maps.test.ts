import { describe, expect, test } from 'bun:test'
import { flushSync, mount, unmount } from 'svelte'
import { MemoryOfflineStore, OfflineMaps as Manager } from 'ts-maps'

const png = async (): Promise<Response> => new Response(new Uint8Array([137, 80, 78, 71]) as unknown as BodyInit, { headers: { 'content-type': 'image/png' } })
const settle = async (): Promise<void> => {
  flushSync()
  await new Promise(r => setTimeout(r, 0))
  flushSync()
}

describe('@ts-maps/svelte OfflineMaps', () => {
  test('follows open and onlyOffline, binds them back, and reports downloads', async () => {
    const WithOfflineMaps = (await import('./fixtures/WithOfflineMaps.svelte')).default
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const maps = new Manager({ store: new MemoryOfflineStore(), fetch: png })
    const events: Array<[string, unknown]> = []
    const app = mount(WithOfflineMaps, { target: el, props: { maps, events } }) as any

    await settle()
    expect(el.querySelector('.tsmap-offline-button')).not.toBeNull()
    app.setOpen(true)
    app.setOnlyOffline(true)
    await settle()
    expect(el.querySelector('.tsmap-offline-card')).not.toBeNull()
    expect(maps.onlyOffline).toBe(true)

    // Closed by its own ✕: the bound value follows.
    ;(el.querySelector('.tsmap-offline-close') as HTMLElement).click()
    await settle()
    expect(app.state().open).toBe(false)
    expect(events).toContainEqual(['openchange', false])

    await maps.download({ bounds: [-122.421, 37.779, -122.419, 37.781], minZoom: 16, maxZoom: 16, sources: [{ url: 'https://img.test/{z}/{x}/{y}.png' }], name: 'Block' })
    expect(events).toContainEqual(['complete', 'Block'])

    unmount(app)
    flushSync()
    expect(el.querySelector('.tsmap-offline-button')).toBeNull()
    el.remove()
  })
})
