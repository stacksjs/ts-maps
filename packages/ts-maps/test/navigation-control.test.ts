import { describe, expect, test } from 'bun:test'
import { control, TsMap } from '../src/core-map'

function makeMap(options: Record<string, unknown> = {}): TsMap {
  const container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  const map = new TsMap(container, { zoomAnimation: false, ...options })
  map.setView([0, 0], 5)
  return map
}

describe('NavigationControl', () => {
  test('renders zoom buttons and a compass by default', () => {
    const nav: any = control.navigation().addTo(makeMap())
    expect(nav._zoomInButton).toBeDefined()
    expect(nav._zoomOutButton).toBeDefined()
    expect(nav._compassButton).toBeDefined()
    expect(nav._needle).toBeDefined()
  })

  test('either half can be turned off', () => {
    const map = makeMap()
    const zoomOnly: any = control.navigation({ showCompass: false }).addTo(map)
    expect(zoomOnly._compassButton).toBeUndefined()

    const compassOnly: any = control.navigation({ showZoom: false }).addTo(map)
    expect(compassOnly._zoomInButton).toBeUndefined()
    expect(compassOnly._compassButton).toBeDefined()
  })

  test('the needle counter-rotates so it keeps pointing north', () => {
    const map = makeMap()
    const nav: any = control.navigation().addTo(map)

    map.setBearing(90)
    expect(nav._needle.style.transform).toBe('rotate(-90deg)')

    map.setBearing(200)
    expect(nav._needle.style.transform).toBe('rotate(-200deg)')
  })

  test('clicking the compass returns the map to north', () => {
    const map = makeMap()
    // resetDuration 0 so the swing is synchronous; the animated path is
    // easeTo's, which has its own tests.
    const nav: any = control.navigation({ resetDuration: 0 }).addTo(map)

    map.setBearing(120)
    nav._resetNorth()

    expect(map.getBearing()).toBe(0)
    expect(nav._needle.style.transform).toBe('rotate(0deg)')
  })

  test('visualizePitch tilts the needle and resets pitch with the bearing', () => {
    const map = makeMap()
    const nav: any = control.navigation({ visualizePitch: true, resetDuration: 0 }).addTo(map)

    map.setPitch(40)
    expect(nav._needle.style.transform).toBe('rotateX(40deg) rotate(0deg)')

    nav._resetNorth()
    expect(map.getPitch()).toBe(0)
  })

  test('zoom buttons drive the map and disable at the limits', () => {
    const map = makeMap({ minZoom: 4, maxZoom: 6 })
    const nav: any = control.navigation().addTo(map)

    nav._zoomIn({})
    expect(map.getZoom()).toBe(6)
    expect(nav._zoomInButton.classList.contains('tsmap-disabled')).toBe(true)
    expect(nav._zoomInButton.getAttribute('aria-disabled')).toBe('true')

    // Already at max: the click must not push the map past it.
    nav._zoomIn({})
    expect(map.getZoom()).toBe(6)

    nav._zoomOut({})
    nav._zoomOut({})
    expect(map.getZoom()).toBe(4)
    expect(nav._zoomOutButton.classList.contains('tsmap-disabled')).toBe(true)
    expect(nav._zoomInButton.classList.contains('tsmap-disabled')).toBe(false)
  })

  test('removing the control stops it tracking the camera', () => {
    const map = makeMap()
    const nav: any = control.navigation().addTo(map)
    map.setBearing(90)
    const before = nav._needle.style.transform

    nav.remove()
    map.setBearing(180)

    expect(nav._needle.style.transform).toBe(before)
  })
})
