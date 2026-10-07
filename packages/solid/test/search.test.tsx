import { describe, expect, test } from 'bun:test'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { Map } from '../src/Map'
import { Search } from '../src/Search'

const place = { text: 'Ferry Building, The Embarcadero, San Francisco', center: { lat: 37.7955, lng: -122.3937 }, properties: { name: 'Ferry Building', osm_value: 'attraction' } }
const provider = { name: 'fake', search: async () => [place], reverse: async () => [] }
const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0))

describe('@ts-maps/solid Search', () => {
  test('follows query, reports results and choices, and removes itself', async () => {
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const [query, setQuery] = createSignal<string | undefined>(undefined)
    const results: string[][] = []
    const selected: string[] = []
    let control: any
    const dispose = render(() => (
      <Map class="map" center={[37.79, -122.4]} zoom={15}>
        <Search
          provider={provider}
          offline={null}
          recents={false}
          query={query()}
          onReady={(c) => { control = c }}
          onResults={e => results.push(e.places.map((p: any) => p.name))}
          onSelect={e => selected.push(e.place.name)}
        />
      </Map>
    ), el)

    await settle()
    expect(el.querySelector('.tsmap-search-input')).not.toBeNull()
    setQuery('ferry')
    await settle()
    expect(results).toEqual([['Ferry Building']])
    control.select(control.results[0])
    expect(selected).toEqual(['Ferry Building'])
    setQuery('')
    await settle()
    expect(el.querySelectorAll('.tsmap-search-pin')).toHaveLength(0)

    dispose()
    expect(el.querySelector('.tsmap-search-input')).toBeNull()
    el.remove()
  })

  test('follows provider, categories and position after mount', async () => {
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const other = { name: 'other', search: async () => [], reverse: async () => [] }
    const coffee = { id: 'coffee', label: 'Coffee', icon: 'cafe', kinds: ['cafe'], synonyms: [] }
    const [next, setNext] = createSignal(false)
    const results: string[][] = []
    let control: any
    const dispose = render(() => (
      <Map class="map" center={[37.79, -122.4]} zoom={15}>
        <Search
          provider={next() ? other : provider}
          categories={next() ? [coffee] : undefined}
          position={next() ? 'topright' : undefined}
          offline={null}
          recents={false}
          query="ferry"
          onReady={(c) => { control = c }}
          onResults={e => results.push(e.places.map((p: any) => p.name))}
        />
      </Map>
    ), el)

    await settle()
    expect(results).toEqual([['Ferry Building']])
    setNext(true)
    await settle()
    expect(control.engine.provider).toBe(other)
    expect(control.options.categories).toEqual([coffee])
    expect(el.querySelector('.tsmap-top.tsmap-right .tsmap-search-input')).not.toBeNull()
    // The query has not changed, so it is not searched again.
    expect(results).toEqual([['Ferry Building']])

    dispose()
    el.remove()
  })
})
