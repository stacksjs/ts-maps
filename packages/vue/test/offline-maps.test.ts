import { describe, expect, test } from 'bun:test'
import { MemoryOfflineStore, OfflineMaps as Manager } from 'ts-maps'
import { createApp, h, nextTick, ref } from 'vue'
import { Map } from '../src/Map'
import { OfflineMaps } from '../src/OfflineMaps'

const png = async (): Promise<Response> => new Response(new Uint8Array([137, 80, 78, 71]) as unknown as BodyInit, { headers: { 'content-type': 'image/png' } })
const settle = async (): Promise<void> => {
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
}

describe('@ts-maps/vue OfflineMaps', () => {
  test('follows open and onlyOffline, reports them for v-model, and emits downloads', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const maps = new Manager({ store: new MemoryOfflineStore(), fetch: png })
    const open = ref(false)
    const onlyOffline = ref(false)
    const updates: unknown[] = []
    const completed: string[] = []
    let control: any
    const app = createApp({
      render: () => h(Map as any, { containerClass: 'ts-map-host', center: [37.78, -122.42], zoom: 15 }, () => [
        h(OfflineMaps as any, {
          maps,
          open: open.value,
          onlyOffline: onlyOffline.value,
          'onUpdate:open': (v: boolean) => updates.push(['open', v]),
          'onUpdate:onlyOffline': (v: boolean) => updates.push(['onlyOffline', v]),
          'onComplete': (e: any) => completed.push(e.region.name),
          'onReady': (c: any) => (control = c),
        }),
      ]),
    })
    app.mount(host)
    await settle()
    expect(host.querySelector('.tsmap-offline-button')).not.toBeNull()
    expect(control.maps).toBe(maps)

    open.value = true
    onlyOffline.value = true
    await settle()
    expect(host.querySelector('.tsmap-offline-card')).not.toBeNull()
    expect(maps.onlyOffline).toBe(true)

    // Closed from inside, by the ✕: the parent hears about it.
    ;(host.querySelector('.tsmap-offline-close') as HTMLElement).click()
    expect(updates).toContainEqual(['open', false])
    expect(updates).toContainEqual(['onlyOffline', true])

    await maps.download({ bounds: [-122.421, 37.779, -122.419, 37.781], minZoom: 16, maxZoom: 16, sources: [{ url: 'https://img.test/{z}/{x}/{y}.png' }], name: 'Block' })
    expect(completed).toEqual(['Block'])

    app.unmount()
    expect(host.querySelector('.tsmap-offline-button')).toBeNull()
    host.remove()
  })
})
