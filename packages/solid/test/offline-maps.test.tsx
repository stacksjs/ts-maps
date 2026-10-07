import { describe, expect, test } from 'bun:test'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { MemoryOfflineStore, OfflineMaps as Manager } from 'ts-maps'
import { Map } from '../src/Map'
import { OfflineMaps } from '../src/OfflineMaps'

const png = async (): Promise<Response> => new Response(new Uint8Array([137, 80, 78, 71]) as unknown as BodyInit, { headers: { 'content-type': 'image/png' } })
const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0))

describe('@ts-maps/solid OfflineMaps', () => {
  test('follows open and onlyOffline, and reports what happens', async () => {
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const maps = new Manager({ store: new MemoryOfflineStore(), fetch: png })
    const [open, setOpen] = createSignal(false)
    const [only, setOnly] = createSignal(false)
    const opened: boolean[] = []
    const completed: string[] = []
    let control: any
    const dispose = render(() => (
      <Map class="map" center={[37.78, -122.42]} zoom={15}>
        <OfflineMaps
          maps={maps}
          open={open()}
          onlyOffline={only()}
          onReady={(c) => { control = c }}
          onOpenChange={e => opened.push(e.open)}
          onComplete={e => completed.push(e.region.name)}
        />
      </Map>
    ), el)

    await settle()
    expect(el.querySelector('.tsmap-offline-button')).not.toBeNull()
    expect(control.maps).toBe(maps)
    setOpen(true)
    setOnly(true)
    await settle()
    expect(el.querySelector('.tsmap-offline-card')).not.toBeNull()
    expect(maps.onlyOffline).toBe(true)
    setOpen(false)
    await settle()
    expect(el.querySelector('.tsmap-offline-card')).toBeNull()
    expect(opened).toEqual([true, false])

    await maps.download({ bounds: [-122.421, 37.779, -122.419, 37.781], minZoom: 16, maxZoom: 16, sources: [{ url: 'https://img.test/{z}/{x}/{y}.png' }], name: 'Block' })
    expect(completed).toEqual(['Block'])

    dispose()
    expect(el.querySelector('.tsmap-offline-button')).toBeNull()
    el.remove()
  })

  test('follows maps and position after mount, and leaves a closed panel closed', async () => {
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const first = new Manager({ store: new MemoryOfflineStore(), fetch: png })
    const second = new Manager({ store: new MemoryOfflineStore(), fetch: png })
    const [maps, setMaps] = createSignal(first)
    const [position, setPosition] = createSignal<'topright' | 'bottomleft'>('topright')
    const [title, setTitle] = createSignal('Offline Maps')
    const progress: string[] = []
    let control: any
    const dispose = render(() => (
      <Map class="map" center={[37.78, -122.42]} zoom={15}>
        <OfflineMaps
          maps={maps()}
          position={position()}
          title={title()}
          open
          onlyOffline
          resources={['https://tiles.test/tiles.json']}
          onReady={(c) => { control = c }}
          onProgress={e => progress.push(e.from)}
        />
      </Map>
    ), el)

    await settle()
    expect(first.onlyOffline).toBe(true)
    setMaps(second)
    setPosition('bottomleft')
    await settle()
    expect(control.maps).toBe(second)
    expect(second.onlyOffline).toBe(true)
    expect(el.querySelector('.tsmap-bottom.tsmap-left .tsmap-offline-button')).not.toBeNull()

    // Events come from the manager shown now, not the one shown at mount.
    first.fire('progress', { from: 'first' })
    second.fire('progress', { from: 'second' })
    expect(progress).toEqual(['second'])

    // Closed from inside the control, it stays closed when another prop changes.
    control.close()
    setTitle('Downloads')
    await settle()
    expect(el.querySelector('.tsmap-offline-button')?.getAttribute('title')).toBe('Downloads')
    expect(el.querySelector('.tsmap-offline-card')).toBeNull()

    dispose()
    el.remove()
  })
})
