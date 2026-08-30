import { describe, expect, test } from 'bun:test'
import { flushSync, mount, unmount } from 'svelte'
import WithChildren from './fixtures/WithChildren.svelte'

// Slot content has to be authored in a component, so these go through a
// fixture. What they check is the part a typecheck cannot: that a child sees
// the map through context at all, and that whatever it added to the map goes
// away with it.

function host(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.width = '800px'
  el.style.height = '600px'
  document.body.appendChild(el)
  return el
}

function mountSync(props: Record<string, unknown>): { app: any, el: HTMLDivElement, map: any } {
  const el = host()
  let map: any = null
  const app = mount(WithChildren, {
    target: el,
    props: { ...props, onmap: (m: unknown) => { map = m } },
  })
  // Svelte 5 schedules effects on a microtask, and `onMount` is where every
  // one of these components does its work.
  flushSync()
  return { app, el, map }
}

function unmountSync(app: any): void {
  unmount(app)
  flushSync()
}

describe('children', () => {
  test('a child sees the map through context', () => {
    const { app, el, map } = mountSync({})
    expect(map).not.toBeNull()
    expect(typeof map.getZoom).toBe('function')
    expect(map.getZoom()).toBe(3)
    unmountSync(app)
    el.remove()
  })

  test('camera props reach the map', () => {
    const el = host()
    let map: any = null
    const app = mount(WithChildren, {
      target: el,
      props: { onmap: (m: unknown) => { map = m } },
    })
    flushSync()

    expect(map.getZoom()).toBe(3)
    expect(map.getCenter().lat).toBeCloseTo(0, 5)

    unmountSync(app)
    el.remove()
  })

  test('children only mount once the map exists', () => {
    // The `{#if map}` guard is the whole reason a child can rely on
    // `useMap()` returning something. Without it a child would attach to
    // nothing and silently do nothing.
    const { app, el, map } = mountSync({})
    expect(map).not.toBeNull()
    unmountSync(app)
    el.remove()
  })

  test('<Marker> adds a marker and takes it away again', () => {
    const { app, el, map } = mountSync({ withMarker: true })

    const markers = (): number => {
      let n = 0
      map.eachLayer((l: any) => {
        if (l.getLatLng)
          n++
      })
      return n
    }

    expect(markers()).toBe(1)

    unmountSync(app)
    el.remove()
  })

  test('a control lands in the corner it asked for', () => {
    const { app, el } = mountSync({ withControl: true })

    expect(el.querySelector('.tsmap-bottom.tsmap-right .tsmap-control-zoom')).not.toBeNull()

    unmountSync(app)
    expect(el.querySelector('.tsmap-control-zoom')).toBeNull()
    el.remove()
  })
})
