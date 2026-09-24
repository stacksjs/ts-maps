import { describe, expect, test } from 'bun:test'
import { flushSync, mount, unmount } from 'svelte'

const P = (north: number, east: number): [number, number] => [north * 0.0009, east * 0.0009]
const ll = (p: [number, number]) => ({ lat: p[0], lng: p[1] })
const route = {
  distance: 800,
  duration: 100,
  geometry: [P(0, 0), P(5, 0), P(5, 3)].map(ll),
  steps: [
    { distance: 500, duration: 60, instruction: '', geometry: [P(0, 0), P(5, 0)].map(ll), maneuver: 'depart', name: 'Main Street' },
    { distance: 300, duration: 40, instruction: '', geometry: [P(5, 0), P(5, 3)].map(ll), maneuver: 'turn-right', name: 'Market Street' },
    { distance: 0, duration: 0, instruction: '', geometry: [P(5, 3)].map(ll), maneuver: 'arrive' },
  ],
}
const directions = { name: 'fake', getDirections: async () => [route] }
const settle = async (): Promise<void> => {
  flushSync()
  await new Promise(r => setTimeout(r, 0))
  flushSync()
}

describe('@ts-maps/svelte TurnByTurn', () => {
  test('from and to preview the routes; active starts and ends guidance', async () => {
    const WithTurnByTurn = (await import('./fixtures/WithTurnByTurn.svelte')).default
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const events: string[] = []
    const app = mount(WithTurnByTurn, { target: el, props: { directions, from: P(0, 0), to: P(5, 3), events } }) as any

    await settle()
    expect(el.querySelector('.tsmap-nav-preview')).not.toBeNull()
    app.setActive(true)
    await settle()
    expect(el.querySelector('.tsmap-nav-banner')).not.toBeNull()
    app.setActive(false)
    await settle()
    expect(el.querySelector('.tsmap-nav-banner')).toBeNull()
    expect(events).toEqual(['preview', 'start', 'end', 'preview'])

    unmount(app)
    flushSync()
    expect(el.querySelector('.tsmap-nav-preview')).toBeNull()
    el.remove()
  })
})
