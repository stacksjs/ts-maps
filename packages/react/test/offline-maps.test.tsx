import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryOfflineStore, OfflineMaps as Manager } from 'ts-maps'
import { Map, OfflineMaps } from '../src'

const png = async (): Promise<Response> => new Response(new Uint8Array([137, 80, 78, 71]) as unknown as BodyInit, { headers: { 'content-type': 'image/png' } })

const roots: Array<{ root: ReturnType<typeof createRoot>, host: HTMLElement }> = []
afterEach(() => {
  for (const { root, host } of roots.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
})

function mount(): { host: HTMLElement, render: (props: Record<string, unknown>) => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push({ root, host })
  return {
    host,
    render: props => act(() => {
      root.render(createElement(Map, { center: [37.78, -122.42], zoom: 15, containerStyle: { width: '430px', height: '800px' } },
        createElement(OfflineMaps, props)))
    }),
  }
}

describe('@ts-maps/react OfflineMaps', () => {
  test('adds the button, and follows open and onlyOffline', () => {
    const maps = new Manager({ store: new MemoryOfflineStore(), fetch: png })
    const { host, render } = mount()
    const opened: boolean[] = []
    const modes: boolean[] = []
    const handlers = { maps, onOpenChange: (e: any) => opened.push(e.open), onModeChange: (e: any) => modes.push(e.onlyOffline) }

    render(handlers)
    expect(host.querySelector('.tsmap-offline-button')).not.toBeNull()
    expect(host.querySelector('.tsmap-offline-card')).toBeNull()

    render({ ...handlers, open: true, onlyOffline: true })
    expect(host.querySelector('.tsmap-offline-card')).not.toBeNull()
    expect(maps.onlyOffline).toBe(true)

    render({ ...handlers, open: false, onlyOffline: false })
    expect(host.querySelector('.tsmap-offline-card')).toBeNull()
    expect(opened).toEqual([true, false])
    expect(modes).toEqual([true, false])
  })

  test('reports downloads, and hands over the control', async () => {
    const maps = new Manager({ store: new MemoryOfflineStore(), fetch: png })
    const { render } = mount()
    let ready: any
    const done: any[] = []
    render({ maps, onReady: (c: any) => (ready = c), onComplete: (e: any) => done.push(e.region) })
    expect(ready.maps).toBe(maps)

    await act(async () => {
      await maps.download({ bounds: [-122.421, 37.779, -122.419, 37.781], minZoom: 16, maxZoom: 16, sources: [{ url: 'https://img.test/{z}/{x}/{y}.png' }], name: 'Block' })
    })
    expect(done.map(r => r.name)).toEqual(['Block'])
  })

  test('removes itself on unmount', () => {
    const { host, render } = mount()
    render({ maps: new Manager({ store: new MemoryOfflineStore(), fetch: png }) })
    act(() => roots[0]!.root.render(createElement(Map, { center: [37.78, -122.42], zoom: 15 })))
    expect(host.querySelector('.tsmap-offline-button')).toBeNull()
  })
})
