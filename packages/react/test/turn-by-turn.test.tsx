import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Map, TurnByTurn } from '../src'

const P = (north: number, east: number): [number, number] => [north * 0.0009, east * 0.0009]
const route = {
  distance: 800,
  duration: 100,
  geometry: [P(0, 0), P(5, 0), P(5, 3)].map(([lat, lng]) => ({ lat, lng })),
  steps: [
    { distance: 500, duration: 60, instruction: '', geometry: [P(0, 0), P(5, 0)].map(([lat, lng]) => ({ lat, lng })), maneuver: 'depart', name: 'Main Street' },
    { distance: 300, duration: 40, instruction: '', geometry: [P(5, 0), P(5, 3)].map(([lat, lng]) => ({ lat, lng })), maneuver: 'turn-right', name: 'Market Street' },
    { distance: 0, duration: 0, instruction: '', geometry: [P(5, 3)].map(([lat, lng]) => ({ lat, lng })), maneuver: 'arrive' },
  ],
}
const directions = { name: 'fake', getDirections: async () => [route] }

const roots: Array<{ root: ReturnType<typeof createRoot>, host: HTMLElement }> = []
afterEach(() => {
  for (const { root, host } of roots.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
})

function render(host: HTMLElement, root: ReturnType<typeof createRoot>, props: Record<string, unknown>): void {
  act(() => {
    root.render(createElement(Map, { center: P(2, 0), zoom: 15, containerStyle: { width: '430px', height: '800px' } },
      createElement(TurnByTurn, { directions, voice: false, ...props })))
  })
}

const settle = (): Promise<void> => act(async () => { await new Promise(r => setTimeout(r, 0)) })

describe('@ts-maps/react TurnByTurn', () => {
  test('from and to preview the routes; active starts and ends guidance', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    roots.push({ root, host })

    const events: string[] = []
    const handlers = { onPreview: () => events.push('preview'), onStart: () => events.push('start'), onEnd: () => events.push('end') }

    render(host, root, { from: P(0, 0), to: P(5, 3), ...handlers })
    await settle()
    expect(host.querySelector('.tsmap-nav-preview')).not.toBeNull()

    render(host, root, { from: P(0, 0), to: P(5, 3), active: true, ...handlers })
    await settle()
    expect(host.querySelector('.tsmap-nav-banner')).not.toBeNull()

    render(host, root, { from: P(0, 0), to: P(5, 3), active: false, ...handlers })
    await settle()
    expect(host.querySelector('.tsmap-nav-banner')).toBeNull()
    expect(host.querySelector('.tsmap-nav-preview')).not.toBeNull()
    expect(events).toEqual(['preview', 'start', 'end', 'preview'])
  })

  test('progress reaches the event prop, and onReady hands over the instance', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    roots.push({ root, host })

    let nav: any = null
    const banners: string[] = []
    render(host, root, { from: P(0, 0), to: P(5, 3), active: true, onReady: (n: any) => { nav = n }, onProgress: (e: any) => banners.push(e.progress.banner) })
    await settle()
    nav.update({ lat: P(2, 0)[0], lng: P(2, 0)[1], time: 0 })
    expect(banners).toEqual(['Turn right onto Market St'])
  })

  test('unmounting clears the map', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    render(host, root, { from: P(0, 0), to: P(5, 3) })
    await settle()
    act(() => {
      root.render(createElement(Map, { center: P(2, 0), zoom: 15, containerStyle: { width: '430px', height: '800px' } }))
    })
    expect(host.querySelector('.tsmap-nav-preview')).toBeNull()
    expect(host.querySelector('.tsmap-nav-pin')).toBeNull()
    act(() => root.unmount())
    host.remove()
  })
})
