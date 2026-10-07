import { describe, expect, test } from 'bun:test'
import { createApp, h, nextTick, ref } from 'vue'
import { Map } from '../src/Map'
import { Search } from '../src/Search'

const place = { text: 'Ferry Building, The Embarcadero, San Francisco', center: { lat: 37.7955, lng: -122.3937 }, properties: { name: 'Ferry Building', osm_value: 'attraction' } }
const provider = { name: 'fake', search: async () => [place], reverse: async () => [] }
const settle = async (): Promise<void> => {
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
}

describe('@ts-maps/vue Search', () => {
  test('follows query, emits results and choices, and removes itself', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const query = ref<string | undefined>(undefined)
    const results: string[][] = []
    const selected: string[] = []
    let control: any
    const app = createApp({
      render: () => h(Map as any, { containerClass: 'ts-map-host', center: [37.79, -122.4], zoom: 15 }, () => [
        h(Search as any, {
          provider,
          offline: null,
          recents: false,
          details: null,
          query: query.value,
          onResults: (e: any) => results.push(e.places.map((p: any) => p.name)),
          onSelect: (e: any) => selected.push(e.place.name),
          onReady: (c: any) => (control = c),
        }),
      ]),
    })
    app.mount(host)
    await settle()
    expect(host.querySelector('.tsmap-search-input')).not.toBeNull()

    query.value = 'ferry'
    await settle()
    expect(results).toEqual([['Ferry Building']])
    control.select(control.results[0])
    expect(selected).toEqual(['Ferry Building'])

    query.value = ''
    await settle()
    expect(host.querySelectorAll('.tsmap-search-pin')).toHaveLength(0)

    app.unmount()
    expect(host.querySelector('.tsmap-search-input')).toBeNull()
    host.remove()
  })
  test('follows provider, categories and position after mount', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const other = { name: 'other', search: async () => [], reverse: async () => [] }
    const coffee = { id: 'coffee', label: 'Coffee', icon: 'cafe', kinds: ['cafe'], synonyms: [] }
    const changed = ref(false)
    let control: any
    const app = createApp({
      render: () => h(Map as any, { containerClass: 'ts-map-host', center: [37.79, -122.4], zoom: 15 }, () => [
        h(Search as any, {
          offline: null,
          recents: false,
          ...(changed.value ? { provider: other, categories: [coffee], position: 'topright' } : { provider }),
          onReady: (c: any) => (control = c),
        }),
      ]),
    })
    app.mount(host)
    await settle()

    changed.value = true
    await settle()
    expect(control.engine.provider).toBe(other)
    expect(control.options.categories).toEqual([coffee])
    expect(host.querySelector('.tsmap-top.tsmap-right .tsmap-search-input')).not.toBeNull()

    app.unmount()
    host.remove()
  })

  test('emits a chosen place\'s details from the details provider', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const found = { openingHours: 'Mo-Su 07:00-22:00', phone: '+1 415 983 8000' }
    const details = { name: 'fake', details: async () => found }
    const arrived: any[] = []
    let control: any
    const app = createApp({
      render: () => h(Map as any, { containerClass: 'ts-map-host', center: [37.79, -122.4], zoom: 15 }, () => [
        h(Search as any, {
          provider,
          offline: null,
          recents: false,
          details,
          query: 'ferry',
          onDetails: (e: any) => arrived.push(e),
          onReady: (c: any) => (control = c),
        }),
      ]),
    })
    app.mount(host)
    await settle()
    control.select(control.results[0])
    await settle()
    expect(arrived).toHaveLength(1)
    expect(arrived[0].place.name).toBe('Ferry Building')
    expect(arrived[0].details).toEqual(found)

    app.unmount()
    host.remove()
  })
})
