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
})
