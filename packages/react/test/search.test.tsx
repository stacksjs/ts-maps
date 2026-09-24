import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Map, Search } from '../src'

const roots: Array<{ root: ReturnType<typeof createRoot>, host: HTMLElement }> = []
afterEach(() => {
  for (const { root, host } of roots.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
})

const place = { text: 'Ferry Building, The Embarcadero, San Francisco', center: { lat: 37.7955, lng: -122.3937 }, properties: { name: 'Ferry Building', osm_value: 'attraction' } }
const provider = { name: 'fake', search: async () => [place], reverse: async () => [] }
const settle = (): Promise<void> => act(async () => { await new Promise(r => setTimeout(r, 0)) })

function mount(): { host: HTMLElement, render: (props: Record<string, unknown>) => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push({ root, host })
  return {
    host,
    render: props => act(() => {
      root.render(createElement(Map, { center: [37.79, -122.40], zoom: 15, containerStyle: { width: '430px', height: '800px' } },
        createElement(Search, { provider, offline: null, recents: false, ...props })))
    }),
  }
}

describe('@ts-maps/react Search', () => {
  test('adds the field, follows query, and reports results and choices', async () => {
    const { host, render } = mount()
    const results: string[][] = []
    const selected: string[] = []
    let control: any
    const handlers = { onResults: (e: any) => results.push(e.places.map((p: any) => p.name)), onSelect: (e: any) => selected.push(e.place.name), onReady: (c: any) => (control = c) }

    render(handlers)
    expect(host.querySelector('.tsmap-search-input')).not.toBeNull()
    render({ ...handlers, query: 'ferry' })
    await settle()
    expect(results).toEqual([['Ferry Building']])
    expect(host.querySelectorAll('.tsmap-search-pin')).toHaveLength(1)

    control.select(control.results[0])
    expect(selected).toEqual(['Ferry Building'])
    expect(host.querySelector('.tsmap-search-place-name')?.textContent).toBe('Ferry Building')

    render({ ...handlers, query: '' })
    expect(host.querySelectorAll('.tsmap-search-pin')).toHaveLength(0)
  })

  test('Directions uses a TurnByTurn that arrives after mount', async () => {
    const { host, render } = mount()
    let control: any
    render({ onReady: (c: any) => (control = c) })
    const previews: unknown[] = []
    const nav = { options: {}, preview: async (_from: unknown, to: unknown) => { previews.push(to) } }
    render({ onReady: (c: any) => (control = c), turnByTurn: nav, origin: () => ({ lat: 37.79, lng: -122.4 }) })
    const [found] = await act(async () => control.search('ferry'))
    act(() => { control.select(found) })
    await act(async () => {
      host.querySelector<HTMLElement>('[data-action="directions"]')!.click()
      await new Promise(r => setTimeout(r, 0))
    })
    expect(previews).toEqual([place.center])
  })
})
