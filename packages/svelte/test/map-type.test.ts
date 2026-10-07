import { describe, expect, test } from 'bun:test'
import { flushSync, mount, unmount } from 'svelte'
import { mapTypes, TrafficLayer, trafficSources } from 'ts-maps'

const types = mapTypes({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf', imagery: 'https://imagery.test/{z}/{y}/{x}.jpg' })
const settle = async (): Promise<void> => {
  flushSync()
  await new Promise(r => setTimeout(r, 0))
  flushSync()
}

describe('@ts-maps/svelte MapType', () => {
  test('follows value and open, binds them back, and reports a choice', async () => {
    const WithMapType = (await import('./fixtures/WithMapType.svelte')).default
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const events: Array<[string, unknown]> = []
    const app = mount(WithMapType, { target: el, props: { types, events } }) as any

    await settle()
    expect(el.querySelector('.tsmap-maptype-button')).not.toBeNull()
    app.setValue('driving')
    app.setOpen(true)
    await settle()
    expect(app.getControl().value).toBe('driving')
    expect(el.querySelector('.tsmap-maptype-card')).not.toBeNull()

    // Chosen on the card: the bound value follows.
    ;(el.querySelector('[data-type="satellite"]') as HTMLElement).click()
    await settle()
    expect(events.filter(([type]) => type === 'change')).toEqual([['change', 'driving'], ['change', 'satellite']])
    expect(app.state().value).toBe('satellite')

    // Closed by its own ✕: the bound value follows.
    ;(el.querySelector('.tsmap-maptype-close') as HTMLElement).click()
    await settle()
    expect(el.querySelector('.tsmap-maptype-card')).toBeNull()
    expect(app.state().open).toBe(false)

    unmount(app)
    flushSync()
    expect(el.querySelector('.tsmap-maptype-button')).toBeNull()
    el.remove()
  })

  test('follows showTraffic, and binds the Traffic switch back', async () => {
    const WithMapType = (await import('./fixtures/WithMapType.svelte')).default
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const traffic = new TrafficLayer({ source: trafficSources.mapbox('pk.test'), refresh: 0 })
    const events: Array<[string, unknown]> = []
    const app = mount(WithMapType, { target: el, props: { types, events, traffic } }) as any

    await settle()
    expect(traffic.active).toBe(false)
    app.setShowTraffic(true)
    await settle()
    expect(traffic.active).toBe(true)
    expect(app.getControl()._map.getStyle().layers.map((l: any) => l.id)).toContain('ts-maps-traffic')
    app.setShowTraffic(false)
    await settle()
    expect(traffic.active).toBe(false)

    // Turned on the card: the bound value follows.
    app.getControl().open()
    const toggle = el.querySelector<HTMLInputElement>('[data-setting="traffic"]')!
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    await settle()
    expect(traffic.active).toBe(true)
    expect(app.state().showTraffic).toBe(true)
    expect(events).toContainEqual(['trafficchange', true])

    unmount(app)
    traffic.remove()
    el.remove()
  })
})
