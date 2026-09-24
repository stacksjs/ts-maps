import { describe, expect, test } from 'bun:test'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
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
const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0))

describe('@ts-maps/solid TurnByTurn', () => {
  test('from and to preview the routes; active starts and ends guidance', async () => {
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const [active, setActive] = createSignal(false)
    const events: string[] = []
    const dispose = render(() => (
      <Map class="map" center={P(2, 0)} zoom={15}>
        <TurnByTurn
          from={P(0, 0)}
          to={P(5, 3)}
          active={active()}
          directions={directions}
          voice={false}
          onPreview={() => events.push('preview')}
          onStart={() => events.push('start')}
          onEnd={() => events.push('end')}
        />
      </Map>
    ), el)

    await settle()
    expect(el.querySelector('.tsmap-nav-preview')).not.toBeNull()
    setActive(true)
    await settle()
    expect(el.querySelector('.tsmap-nav-banner')).not.toBeNull()
    setActive(false)
    await settle()
    expect(el.querySelector('.tsmap-nav-banner')).toBeNull()
    expect(events).toEqual(['preview', 'start', 'end', 'preview'])

    dispose()
    expect(el.querySelector('.tsmap-nav-preview')).toBeNull()
    el.remove()
  })
})
