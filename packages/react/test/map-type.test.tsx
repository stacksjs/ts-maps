import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { mapTypes } from 'ts-maps'
import { Map, MapType } from '../src'

const types = mapTypes({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf', imagery: 'https://imagery.test/{z}/{y}/{x}.jpg' })

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
      root.render(createElement(Map, { center: [37.78, -122.42], zoom: 13, containerStyle: { width: '430px', height: '800px' } },
        createElement(MapType, { types, ...props } as any)))
    }),
  }
}

describe('@ts-maps/react MapType', () => {
  test('follows value and open, and reports a choice', () => {
    const { host, render } = mount()
    const changes: string[] = []
    let control: any
    const handlers = { onChange: (e: any) => changes.push(e.value), onReady: (c: any) => (control = c) }
    render({ ...handlers, value: 'explore' })
    expect(host.querySelector('.tsmap-maptype-button')).not.toBeNull()
    render({ ...handlers, value: 'driving', open: true })
    expect(control.value).toBe('driving')
    expect(host.querySelector('.tsmap-maptype-card')).not.toBeNull()
    host.querySelector<HTMLElement>('[data-type="satellite"]')!.click()
    expect(changes).toEqual(['driving', 'satellite'])
    render({ ...handlers, value: 'driving', open: false })
    expect(host.querySelector('.tsmap-maptype-card')).toBeNull()
  })
})
