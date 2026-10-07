import { describe, expect, test } from 'bun:test'
import { flushSync, mount, unmount } from 'svelte'

const settle = async (): Promise<void> => {
  flushSync()
  await new Promise(r => setTimeout(r, 0))
  flushSync()
}

describe('@ts-maps/svelte locale', () => {
  test('a map in German speaks German, and a control\'s own locale wins as it changes', async () => {
    const WithLocale = (await import('./fixtures/WithLocale.svelte')).default
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = mount(WithLocale, { target: el, props: { locale: 'de' } }) as any
    await settle()

    const input = (): Element | null => el.querySelector('.tsmap-search-input')
    const zoomIn = (corner: string): Element | null => el.querySelector(`.tsmap-top.tsmap-${corner} .tsmap-control-zoom-in`)
    expect(input()?.getAttribute('placeholder')).toBe('Karten durchsuchen')
    // The map's own zoom control, and one placed as a component.
    expect(zoomIn('left')?.getAttribute('title')).toBe('Vergrößern')
    expect(zoomIn('right')?.getAttribute('title')).toBe('Vergrößern')

    app.setOwn('en')
    await settle()
    expect(input()?.getAttribute('placeholder')).toBe('Search Maps')
    expect(zoomIn('right')?.getAttribute('title')).toBe('Zoom in')

    unmount(app)
    flushSync()
    el.remove()
  })
})
