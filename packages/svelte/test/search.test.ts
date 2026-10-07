import { describe, expect, test } from 'bun:test'
import { flushSync, mount, unmount } from 'svelte'

const place = { text: 'Ferry Building, The Embarcadero, San Francisco', center: { lat: 37.7955, lng: -122.3937 }, properties: { name: 'Ferry Building', osm_value: 'attraction' } }
const provider = { name: 'fake', search: async () => [place], reverse: async () => [] }
const settle = async (): Promise<void> => {
  flushSync()
  await new Promise(r => setTimeout(r, 0))
  flushSync()
}

describe('@ts-maps/svelte Search', () => {
  test('follows query, reports results and choices, and removes itself', async () => {
    const WithSearch = (await import('./fixtures/WithSearch.svelte')).default
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const events: Array<[string, unknown]> = []
    const app = mount(WithSearch, { target: el, props: { provider, events } }) as any

    await settle()
    expect(el.querySelector('.tsmap-search-input')).not.toBeNull()
    app.setQuery('ferry')
    await settle()
    expect(events).toContainEqual(['results', ['Ferry Building']])
    const control = app.getControl()
    control.select(control.results[0])
    expect(events).toContainEqual(['select', 'Ferry Building'])
    app.setQuery('')
    await settle()
    expect(el.querySelectorAll('.tsmap-search-pin')).toHaveLength(0)

    unmount(app)
    flushSync()
    expect(el.querySelector('.tsmap-search-input')).toBeNull()
    el.remove()
  })

  test('follows provider, categories and position after mount', async () => {
    const WithSearch = (await import('./fixtures/WithSearch.svelte')).default
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = mount(WithSearch, { target: el, props: { provider, events: [] } }) as any

    await settle()
    const other = { name: 'other', search: async () => [], reverse: async () => [] }
    const coffee = { id: 'coffee', label: 'Coffee', icon: 'cafe', kinds: ['cafe'], synonyms: [] }
    app.setProvider(other)
    app.setCategories([coffee])
    app.setPosition('topright')
    await settle()
    const control = app.getControl()
    expect(control.engine.provider).toBe(other)
    expect(control.options.categories).toEqual([coffee])
    expect(el.querySelector('.tsmap-top.tsmap-right .tsmap-search-input')).not.toBeNull()

    unmount(app)
    flushSync()
    el.remove()
  })

  test('reports a chosen place\'s details from the details provider', async () => {
    const WithSearch = (await import('./fixtures/WithSearch.svelte')).default
    const el = document.createElement('div')
    document.body.appendChild(el)
    const found = { openingHours: 'Mo-Su 07:00-22:00', phone: '+1 415 983 8000' }
    const details = { name: 'fake', details: async () => found }
    const events: Array<[string, unknown]> = []
    const app = mount(WithSearch, { target: el, props: { provider, details, events } }) as any

    await settle()
    app.setQuery('ferry')
    await settle()
    const control = app.getControl()
    control.select(control.results[0])
    await settle()
    expect(events).toContainEqual(['details', found])

    unmount(app)
    flushSync()
    el.remove()
  })
})
