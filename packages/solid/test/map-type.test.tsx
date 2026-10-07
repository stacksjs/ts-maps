import { describe, expect, test } from 'bun:test'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { mapTypes, TrafficLayer, trafficSources } from 'ts-maps'
import { Map } from '../src/Map'
import { MapType } from '../src/MapType'

const types = mapTypes({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf', imagery: 'https://imagery.test/{z}/{y}/{x}.jpg' })
const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0))

describe('@ts-maps/solid MapType', () => {
  test('follows value and open, and reports a choice', async () => {
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const [value, setValue] = createSignal('explore')
    const [open, setOpen] = createSignal(false)
    const changes: string[] = []
    let control: any
    const dispose = render(() => (
      <Map class="map" center={[37.78, -122.42]} zoom={13}>
        <MapType
          types={types}
          value={value()}
          open={open()}
          onReady={(c) => { control = c }}
          onChange={e => changes.push(e.value)}
        />
      </Map>
    ), el)

    await settle()
    expect(el.querySelector('.tsmap-maptype-button')).not.toBeNull()
    setValue('driving')
    setOpen(true)
    await settle()
    expect(control.value).toBe('driving')
    expect(el.querySelector('.tsmap-maptype-card')).not.toBeNull()
    ;(el.querySelector('[data-type="satellite"]') as HTMLElement).click()
    expect(changes).toEqual(['driving', 'satellite'])
    setOpen(false)
    await settle()
    expect(el.querySelector('.tsmap-maptype-card')).toBeNull()

    dispose()
    expect(el.querySelector('.tsmap-maptype-button')).toBeNull()
    el.remove()
  })

  test('follows showTraffic, and reports the Traffic switch', async () => {
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const traffic = new TrafficLayer({ source: trafficSources.mapbox('pk.test'), refresh: 0 })
    const [showTraffic, setShowTraffic] = createSignal(false)
    const changes: boolean[] = []
    let control: any
    const dispose = render(() => (
      <Map class="map" center={[37.78, -122.42]} zoom={13}>
        <MapType
          types={types}
          value="explore"
          traffic={traffic}
          showTraffic={showTraffic()}
          onReady={(c) => { control = c }}
          onTrafficChange={e => changes.push(e.traffic)}
        />
      </Map>
    ), el)

    await settle()
    expect(traffic.active).toBe(false)
    setShowTraffic(true)
    await settle()
    expect(traffic.active).toBe(true)
    expect(control._map.getStyle().layers.map((l: any) => l.id)).toContain('ts-maps-traffic')
    setShowTraffic(false)
    await settle()
    expect(traffic.active).toBe(false)

    control.open()
    const toggle = el.querySelector<HTMLInputElement>('[data-setting="traffic"]')!
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    expect(traffic.active).toBe(true)
    expect(changes).toEqual([true])

    dispose()
    traffic.remove()
    el.remove()
  })
})
