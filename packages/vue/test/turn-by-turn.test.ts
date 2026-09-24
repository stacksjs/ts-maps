import { describe, expect, test } from 'bun:test'
import { createApp, h, nextTick, ref } from 'vue'
import { Map } from '../src/Map'
import { TurnByTurn } from '../src/TurnByTurn'

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
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
}

describe('@ts-maps/vue TurnByTurn', () => {
  test('from and to preview the routes; active starts and ends guidance', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const active = ref(false)
    const events: string[] = []
    const app = createApp({
      render: () => h(Map as any, { containerClass: 'ts-map-host', center: P(2, 0), zoom: 15 }, () => [
        h(TurnByTurn as any, {
          from: P(0, 0),
          to: P(5, 3),
          active: active.value,
          directions,
          voice: false,
          onPreview: () => events.push('preview'),
          onStart: () => events.push('start'),
          onEnd: () => events.push('end'),
        }),
      ]),
    })
    app.mount(host)
    const mapEl = host.querySelector('.ts-map-host') as HTMLElement
    mapEl.style.width = '430px'
    mapEl.style.height = '800px'

    await settle()
    expect(host.querySelector('.tsmap-nav-preview')).not.toBeNull()
    active.value = true
    await settle()
    expect(host.querySelector('.tsmap-nav-banner')).not.toBeNull()
    active.value = false
    await settle()
    expect(host.querySelector('.tsmap-nav-banner')).toBeNull()
    expect(events).toEqual(['preview', 'start', 'end', 'preview'])

    app.unmount()
    expect(host.querySelector('.tsmap-nav-preview')).toBeNull()
    host.remove()
  })
})
