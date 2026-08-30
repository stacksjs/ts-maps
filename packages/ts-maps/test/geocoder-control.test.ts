import type { GeocoderOptions, GeocoderProvider, GeocodingResult } from '../src/core-map/services/types'
import { describe, expect, test } from 'bun:test'
import { control, TsMap } from '../src/core-map'

function makeMap(): TsMap {
  const container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  const map = new TsMap(container, { zoomAnimation: false })
  map.setView([0, 0], 5)
  return map
}

function result(text: string, lat: number, lng: number, bbox?: [number, number, number, number]): GeocodingResult {
  return { text, center: { lat, lng }, bbox }
}

/** Records every call and lets a test resolve them out of order. */
class FakeProvider implements GeocoderProvider {
  name = 'fake'
  calls: Array<{ query: string, opts?: GeocoderOptions, resolve: (r: GeocodingResult[]) => void, reject: (e: any) => void }> = []

  search(query: string, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    return new Promise((resolve, reject) => {
      this.calls.push({ query, opts, resolve, reject })
    })
  }

  reverse(): Promise<GeocodingResult[]> {
    return Promise.resolve([])
  }
}

function type(geocoder: any, text: string): void {
  geocoder._input.value = text
  geocoder._input.dispatchEvent(new Event('input'))
}

function key(geocoder: any, name: string): void {
  geocoder._input.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
}

describe('GeocoderControl', () => {
  test('waits for minLength before asking the provider', async () => {
    const provider = new FakeProvider()
    const geocoder: any = control.geocoder({ provider, debounce: 0, minLength: 3 }).addTo(makeMap())

    type(geocoder, 've')
    expect(provider.calls.length).toBe(0)

    type(geocoder, 'ven')
    expect(provider.calls.length).toBe(1)
    expect(provider.calls[0].query).toBe('ven')
  })

  test('renders results and reports them on the map', async () => {
    const provider = new FakeProvider()
    const map = makeMap()
    const geocoder: any = control.geocoder({ provider, debounce: 0 }).addTo(map)

    let reported: any
    map.on('geocoderesults', (event: any) => { reported = event })

    type(geocoder, 'venice')
    provider.calls[0].resolve([result('Venice Beach', 33.985, -118.469), result('Venice, Italy', 45.44, 12.31)])
    await Promise.resolve()

    const items = geocoder._list.querySelectorAll('li')
    expect(items.length).toBe(2)
    expect(items[0].textContent).toBe('Venice Beach')
    expect(reported.results.length).toBe(2)
    expect(geocoder._container.classList.contains('tsmap-control-geocoder-open')).toBe(true)
  })

  test('a superseded response cannot repopulate the list', async () => {
    const provider = new FakeProvider()
    const geocoder: any = control.geocoder({ provider, debounce: 0 }).addTo(makeMap())

    type(geocoder, 'venice')
    type(geocoder, 'venice beach')
    expect(provider.calls.length).toBe(2)
    expect(provider.calls[0].opts?.signal?.aborted).toBe(true)

    // The stale request answers last; its results must be discarded.
    provider.calls[1].resolve([result('Venice Beach', 33.985, -118.469)])
    await Promise.resolve()
    provider.calls[0].resolve([result('Stale', 0, 0), result('Also stale', 1, 1)])
    await Promise.resolve()

    const items = geocoder._list.querySelectorAll('li')
    expect(items.length).toBe(1)
    expect(items[0].textContent).toBe('Venice Beach')
  })

  test('Enter picks the top hit and moves the map', async () => {
    const provider = new FakeProvider()
    const map = makeMap()
    const geocoder: any = control.geocoder({ provider, debounce: 0, flyTo: false, marker: false }).addTo(map)

    let selected: any
    map.on('geocodeselect', (event: any) => { selected = event })

    type(geocoder, 'venice')
    provider.calls[0].resolve([result('Venice Beach', 33.985, -118.469)])
    await Promise.resolve()
    key(geocoder, 'Enter')

    expect(selected.result.text).toBe('Venice Beach')
    expect(map.getCenter().lat).toBeCloseTo(33.985, 3)
    expect(geocoder._input.value).toBe('Venice Beach')
    expect(geocoder._list.querySelectorAll('li').length).toBe(0)
  })

  test('a result with a bbox fits the bounds instead of using the default zoom', async () => {
    const provider = new FakeProvider()
    const map = makeMap()
    const geocoder: any = control.geocoder({ provider, debounce: 0, marker: false }).addTo(map)

    type(geocoder, 'venice')
    provider.calls[0].resolve([result('Venice Beach', 33.985, -118.469, [-118.5, 33.96, -118.44, 34.01])])
    await Promise.resolve()
    key(geocoder, 'Enter')

    expect(map.getCenter().lat).toBeCloseTo(33.985, 2)
    expect(map.getCenter().lng).toBeCloseTo(-118.47, 2)
  })

  test('arrow keys walk the list', async () => {
    const provider = new FakeProvider()
    const geocoder: any = control.geocoder({ provider, debounce: 0 }).addTo(makeMap())

    type(geocoder, 'venice')
    provider.calls[0].resolve([result('One', 1, 1), result('Two', 2, 2)])
    await Promise.resolve()

    key(geocoder, 'ArrowDown')
    expect(geocoder._selected).toBe(0)
    key(geocoder, 'ArrowDown')
    expect(geocoder._selected).toBe(1)
    // Wraps, rather than sticking at the end.
    key(geocoder, 'ArrowDown')
    expect(geocoder._selected).toBe(0)
    key(geocoder, 'ArrowUp')
    expect(geocoder._selected).toBe(1)
  })

  test('a provider failure is reported and leaves the list empty', async () => {
    const provider = new FakeProvider()
    const map = makeMap()
    const geocoder: any = control.geocoder({ provider, debounce: 0 }).addTo(map)

    let failure: any
    map.on('geocodeerror', (event: any) => { failure = event })

    type(geocoder, 'venice')
    provider.calls[0].reject(new Error('service unavailable'))
    await Promise.resolve()
    await Promise.resolve()

    expect(failure.error.message).toBe('service unavailable')
    expect(geocoder._list.querySelectorAll('li').length).toBe(0)
  })

  test('Escape clears the box and drops the marker', async () => {
    const provider = new FakeProvider()
    const map = makeMap()
    const geocoder: any = control.geocoder({ provider, debounce: 0 }).addTo(map)

    type(geocoder, 'venice')
    provider.calls[0].resolve([result('Venice Beach', 33.985, -118.469)])
    await Promise.resolve()
    key(geocoder, 'Enter')
    expect(geocoder._marker).toBeDefined()

    key(geocoder, 'Escape')

    expect(geocoder._input.value).toBe('')
    expect(geocoder._marker).toBeUndefined()
  })

  test('removing the control cancels pending work', async () => {
    const provider = new FakeProvider()
    const geocoder: any = control.geocoder({ provider, debounce: 0 }).addTo(makeMap())

    type(geocoder, 'venice')
    geocoder.remove()

    expect(provider.calls[0].opts?.signal?.aborted).toBe(true)
  })

  test('biases results towards the current view unless told not to', () => {
    const provider = new FakeProvider()
    const map = makeMap()
    map.setView([34.02, -118.47], 12)

    const geocoder: any = control.geocoder({ provider, debounce: 0 }).addTo(map)
    type(geocoder, 'pico')
    expect(provider.calls[0].opts?.proximity?.lat).toBeCloseTo(34.02, 3)

    const plain: any = control.geocoder({ provider, debounce: 0, proximity: false }).addTo(map)
    type(plain, 'pico')
    expect(provider.calls[1].opts?.proximity).toBeUndefined()
  })
})
