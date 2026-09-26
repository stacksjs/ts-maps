import { afterEach, describe, expect, test } from 'bun:test'
import { TsMap } from '../src/core-map'

function makeContainer(): HTMLElement {
  const container = document.createElement('div')
  container.style.width = '400px'
  container.style.height = '300px'
  document.body.appendChild(container)
  return container
}

/** A minimal matchMedia whose match state can be flipped from a test. */
function stubMatchMedia(initial: boolean): { flip: (matches: boolean) => void, listeners: number } {
  const handlers = new Set<(event: MediaQueryListEvent) => void>()
  const query = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, handler: any) => { handlers.add(handler) },
    removeEventListener: (_type: string, handler: any) => { handlers.delete(handler) },
  }
  ;(globalThis as any).matchMedia = () => query
  return {
    flip(matches: boolean) {
      query.matches = matches
      for (const handler of handlers)
        handler({ matches } as MediaQueryListEvent)
    },
    get listeners() {
      return handlers.size
    },
  }
}

describe('map theme', () => {
  afterEach(() => {
    delete (globalThis as any).matchMedia
    const root = document.documentElement
    root.removeAttribute('data-theme')
    root.removeAttribute('data-color-mode')
    root.classList.remove('dark', 'light')
  })

  test('defaults to light chrome', () => {
    const map = new TsMap(makeContainer())
    expect(map.getTheme()).toBe('light')
    expect(map.getContainer().classList.contains('tsmap-dark')).toBe(false)
  })

  test('theme: dark applies the class at construction', () => {
    const map = new TsMap(makeContainer(), { theme: 'dark' })
    expect(map.getTheme()).toBe('dark')
    expect(map.getContainer().classList.contains('tsmap-dark')).toBe(true)
  })

  test('setTheme toggles both ways and fires themechange', () => {
    const map = new TsMap(makeContainer())
    const seen: Array<{ theme: string, dark: boolean }> = []
    map.on('themechange', (event: any) => seen.push({ theme: event.theme, dark: event.dark }))

    map.setTheme('dark')
    expect(map.getContainer().classList.contains('tsmap-dark')).toBe(true)

    map.setTheme('light')
    expect(map.getContainer().classList.contains('tsmap-dark')).toBe(false)

    expect(seen).toEqual([
      { theme: 'dark', dark: true },
      { theme: 'light', dark: false },
    ])
  })

  test('theme: auto follows prefers-color-scheme and keeps following it', () => {
    const media = stubMatchMedia(true)
    const map = new TsMap(makeContainer(), { theme: 'auto' })

    expect(map.getTheme()).toBe('auto')
    expect(map.getContainer().classList.contains('tsmap-dark')).toBe(true)

    media.flip(false)
    expect(map.getContainer().classList.contains('tsmap-dark')).toBe(false)

    // The reported theme stays 'auto' — it is the configured mode, not the
    // mode it happens to have resolved to.
    expect(map.getTheme()).toBe('auto')
  })

  test('leaving auto detaches the media listener', () => {
    const media = stubMatchMedia(true)
    const map = new TsMap(makeContainer(), { theme: 'auto' })
    expect(media.listeners).toBe(1)

    map.setTheme('light')
    expect(media.listeners).toBe(0)

    // A later OS change must not reach a map that no longer follows it.
    media.flip(true)
    expect(map.getContainer().classList.contains('tsmap-dark')).toBe(false)
  })

  test('remove() cleans the class and the listener off the container', () => {
    const media = stubMatchMedia(true)
    const container = makeContainer()
    const map = new TsMap(container, { theme: 'auto' })

    map.remove()

    expect(container.classList.contains('tsmap-dark')).toBe(false)
    expect(media.listeners).toBe(0)
  })

  test('theme: auto prefers the page\'s declared theme over the OS', () => {
    // A site toggle is the reader's explicit choice, and prefers-color-scheme
    // cannot see it: a dark OS with the page switched to light must not get
    // dark map chrome inside a light page.
    stubMatchMedia(true)
    document.documentElement.setAttribute('data-theme', 'light')
    const map = new TsMap(makeContainer(), { theme: 'auto' })
    expect(map.getContainer().classList.contains('tsmap-dark')).toBe(false)
  })

  test('theme: auto tracks the page toggle as it flips', async () => {
    stubMatchMedia(false)
    const map = new TsMap(makeContainer(), { theme: 'auto' })
    const container = map.getContainer()
    expect(container.classList.contains('tsmap-dark')).toBe(false)

    document.documentElement.setAttribute('data-theme', 'dark')
    await Promise.resolve()
    expect(container.classList.contains('tsmap-dark')).toBe(true)

    // A class toggle (the Tailwind convention) counts too.
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.add('light')
    await Promise.resolve()
    expect(container.classList.contains('tsmap-dark')).toBe(false)
  })

  test('a value that is not light or dark falls through to the OS', () => {
    stubMatchMedia(true)
    document.documentElement.setAttribute('data-theme', 'system')
    const map = new TsMap(makeContainer(), { theme: 'auto' })
    expect(map.getContainer().classList.contains('tsmap-dark')).toBe(true)
  })

  test('leaving auto stops watching the page', async () => {
    stubMatchMedia(false)
    const map = new TsMap(makeContainer(), { theme: 'auto' })
    map.setTheme('light')

    document.documentElement.setAttribute('data-theme', 'dark')
    await Promise.resolve()
    expect(map.getContainer().classList.contains('tsmap-dark')).toBe(false)
  })
})

describe('container background', () => {
  test('a map with no style keeps the background its host set', () => {
    // _syncStyleBackground runs on every zoomend. It used to remove the inline
    // background-color whenever no style layer supplied one, which wiped the
    // host's own colour on the first fitBounds.
    const container = makeContainer()
    container.style.backgroundColor = 'rgb(8, 11, 18)'
    const map = new TsMap(container, { center: [0, 0], zoom: 1 })
    map.setView([10, 10], 2, { animate: false })
    map._syncStyleBackground()
    expect(container.style.backgroundColor).toBe('rgb(8, 11, 18)')
  })
})
