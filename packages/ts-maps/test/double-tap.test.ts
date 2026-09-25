import { describe, expect, test } from 'bun:test'
import * as DomEvent from '../src/core-map/dom/DomEvent'

function tapTarget(): { el: HTMLElement, marker: HTMLElement, count: () => number } {
  const el = document.createElement('div')
  const marker = document.createElement('div')
  marker.className = 'tsmap-marker-icon'
  el.appendChild(marker)
  document.body.appendChild(el)
  let fired = 0
  DomEvent.on(el, 'dblclick', () => fired++)
  return { el, marker, count: () => fired }
}

function tap(target: HTMLElement, x: number, y: number): void {
  target.dispatchEvent(new PointerEvent('click', { detail: 1, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }))
}

describe('double-tap on a touch screen', () => {
  test('two quick taps in one place are a double-tap', () => {
    const { el, count } = tapTarget()
    tap(el, 100, 100)
    tap(el, 108, 104)
    expect(count()).toBe(1)
  })

  test('two quick taps far apart are two taps', () => {
    const { el, count } = tapTarget()
    tap(el, 100, 100)
    tap(el, 300, 260)
    expect(count()).toBe(0)
  })

  test('a tap on a marker does not count toward a double-tap on the map', () => {
    const { el, marker, count } = tapTarget()
    tap(marker, 100, 100)
    tap(el, 100, 100)
    expect(count()).toBe(0)
  })
})
