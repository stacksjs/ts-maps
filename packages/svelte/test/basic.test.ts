import { describe, expect, test } from 'bun:test'
import { flushSync, mount, unmount } from 'svelte'
import { MAP_CONTEXT_KEY } from '../src/context'
import Map from '../src/Map.svelte'

// A `.svelte` file has to go through Svelte's compiler before anything can run
// it, so this package had a typecheck and nothing else. What follows are the
// three things a typecheck cannot answer: does the component mount, is the map
// torn down with it, and do children ever see the map.

/**
 * Mount, then run the effects.
 *
 * Svelte 5 schedules effects on a microtask, so a component's `onMount` has
 * not run by the time `mount` returns — and `onMount` is where every one of
 * these components does its work.
 */
function mountSync<P extends Record<string, unknown>>(
  component: any,
  target: HTMLElement,
  props: P,
): ReturnType<typeof mount> {
  const app = mount(component, { target, props })
  flushSync()
  return app
}

function unmountSync(app: ReturnType<typeof mount>): void {
  unmount(app)
  flushSync()
}

function host(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.width = '800px'
  el.style.height = '600px'
  document.body.appendChild(el)
  return el
}

describe('<Map>', () => {
  test('mounts a map into its own container', () => {
    const el = host()
    const app = mountSync(Map, el, { center: [0, 0], zoom: 3 })

    const container = el.querySelector('.ts-map') as HTMLElement
    expect(container).not.toBeNull()
    expect(container.classList.contains('tsmap-container')).toBe(true)
    expect(container.querySelector('.tsmap-pane')).not.toBeNull()

    unmountSync(app)
    el.remove()
  })

  test('unmounting removes the map', () => {
    const el = host()
    const app = mountSync(Map, el, { center: [0, 0], zoom: 3 })
    expect(el.querySelector('.tsmap-pane')).not.toBeNull()

    unmountSync(app)
    // Panes left behind are a leak: remounting would stack a second map on
    // top of the first.
    expect(el.querySelector('.tsmap-pane')).toBeNull()
    el.remove()
  })

  test('mounting twice into one host keeps the maps separate', () => {
    const el = host()
    const a = mountSync(Map, el, { center: [0, 0], zoom: 3 })
    const b = mountSync(Map, el, { center: [1, 1], zoom: 4 })

    expect(el.querySelectorAll('.ts-map').length).toBe(2)

    unmountSync(a)
    expect(el.querySelectorAll('.ts-map').length).toBe(1)
    unmountSync(b)
    el.remove()
  })
})

describe('context', () => {
  test('the key is a symbol, so it cannot collide with an app key', () => {
    expect(typeof MAP_CONTEXT_KEY).toBe('symbol')
  })
})
