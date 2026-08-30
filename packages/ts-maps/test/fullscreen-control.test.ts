import { afterEach, describe, expect, test } from 'bun:test'
import { control, TsMap } from '../src/core-map'

function makeMap(): TsMap {
  const container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  const map = new TsMap(container, { zoomAnimation: false })
  map.setView([0, 0], 5)
  return map
}

/** Installs a Fullscreen API that reports success without a real display. */
function stubFullscreenApi(): { element: () => Element | null } {
  let current: Element | null = null
  ;(Element.prototype as any).requestFullscreen = function (this: Element) {
    current = this
    ;(document as any).fullscreenElement = current
    document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  }
  ;(document as any).exitFullscreen = () => {
    current = null
    ;(document as any).fullscreenElement = null
    document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  }
  return { element: () => current }
}

afterEach(() => {
  delete (Element.prototype as any).requestFullscreen
  delete (document as any).exitFullscreen
  delete (document as any).fullscreenElement
})

describe('FullscreenControl', () => {
  test('uses the Fullscreen API when it is available', async () => {
    const api = stubFullscreenApi()
    const map = makeMap()
    const fullscreen: any = control.fullscreen().addTo(map)

    const events: string[] = []
    map.on('fullscreenstart', () => events.push('start'))
    map.on('fullscreenend', () => events.push('end'))

    fullscreen.toggle()
    await Promise.resolve()

    expect(api.element()).toBe(map.getContainer())
    expect(fullscreen.isFullscreen()).toBe(true)
    // The pseudo fallback must stay out of the way when the API works.
    expect(map.getContainer().classList.contains('tsmap-pseudo-fullscreen')).toBe(false)
    expect(events).toEqual(['start'])

    fullscreen.toggle()
    await Promise.resolve()

    expect(fullscreen.isFullscreen()).toBe(false)
    expect(events).toEqual(['start', 'end'])
  })

  test('falls back to a fixed full-viewport class when the API is missing', () => {
    const map = makeMap()
    const fullscreen: any = control.fullscreen().addTo(map)

    const events: string[] = []
    map.on('fullscreenstart', () => events.push('start'))
    map.on('fullscreenend', () => events.push('end'))

    fullscreen.toggle()

    expect(map.getContainer().classList.contains('tsmap-pseudo-fullscreen')).toBe(true)
    expect(fullscreen.isFullscreen()).toBe(true)
    expect(events).toEqual(['start'])

    fullscreen.toggle()

    expect(map.getContainer().classList.contains('tsmap-pseudo-fullscreen')).toBe(false)
    expect(events).toEqual(['start', 'end'])
  })

  test('the map re-measures on every change', () => {
    const map = makeMap()
    let measured = 0
    ;(map as any).invalidateSize = () => { measured += 1 }

    const fullscreen: any = control.fullscreen().addTo(map)
    fullscreen.toggle()
    fullscreen.toggle()

    expect(measured).toBe(2)
  })

  test('the button reflects the state for assistive tech', () => {
    const fullscreen: any = control.fullscreen().addTo(makeMap())

    expect(fullscreen._button.getAttribute('aria-pressed')).toBe('false')
    expect(fullscreen._button.title).toBe('View fullscreen')

    fullscreen.toggle()

    expect(fullscreen._button.getAttribute('aria-pressed')).toBe('true')
    expect(fullscreen._button.title).toBe('Exit fullscreen')
  })

  test('an exit driven by the browser (Escape) is noticed', async () => {
    stubFullscreenApi()
    const map = makeMap()
    const fullscreen: any = control.fullscreen().addTo(map)

    fullscreen.toggle()
    await Promise.resolve()
    expect(fullscreen.isFullscreen()).toBe(true)

    // What Escape looks like from here: the document clears its element and
    // fires the event without the control being asked.
    ;(document as any).fullscreenElement = null
    document.dispatchEvent(new Event('fullscreenchange'))

    expect(fullscreen.isFullscreen()).toBe(false)
    expect(fullscreen._button.getAttribute('aria-pressed')).toBe('false')
  })

  test('removing the control leaves nothing expanded behind', () => {
    const map = makeMap()
    const fullscreen: any = control.fullscreen().addTo(map)

    fullscreen.toggle()
    fullscreen.remove()

    expect(map.getContainer().classList.contains('tsmap-pseudo-fullscreen')).toBe(false)
  })

  test('expands a caller-supplied element instead of the map container', () => {
    const wrapper = document.createElement('div')
    document.body.appendChild(wrapper)
    const map = makeMap()
    const fullscreen: any = control.fullscreen({ container: wrapper }).addTo(map)

    fullscreen.toggle()

    expect(wrapper.classList.contains('tsmap-pseudo-fullscreen')).toBe(true)
    expect(map.getContainer().classList.contains('tsmap-pseudo-fullscreen')).toBe(false)
  })
})
