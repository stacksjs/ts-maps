import { describe, expect, test } from 'bun:test'
import { Polygon, TsMap } from '../src/core-map'

function makeMap(): TsMap {
  const container = document.createElement('div')
  container.style.width = '400px'
  container.style.height = '300px'
  document.body.appendChild(container)
  return new TsMap(container, { center: [0, 0], zoom: 1 })
}

const ring: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0]]

describe('path paint', () => {
  test('a plain colour stays a presentation attribute', () => {
    const map = makeMap()
    const shape = new Polygon(ring, { color: '#123456', fillColor: '#abcdef' }).addTo(map) as any
    expect(shape._path.getAttribute('fill')).toBe('#abcdef')
    expect(shape._path.getAttribute('stroke')).toBe('#123456')
    expect(shape._path.style.getPropertyValue('fill')).toBe('')
  })

  test('a custom property goes on style, where it can resolve', () => {
    // As an attribute, var() is a parse error and the path paints black.
    const map = makeMap()
    const shape = new Polygon(ring, { color: 'var(--edge)', fillColor: 'var(--land)' }).addTo(map) as any
    expect(shape._path.hasAttribute('fill')).toBe(false)
    expect(shape._path.style.getPropertyValue('fill')).toBe('var(--land)')
    expect(shape._path.style.getPropertyValue('stroke')).toBe('var(--edge)')
  })

  test('restyling from a custom property back to a colour clears the style value', () => {
    // Otherwise the stale style would outrank the new attribute forever.
    const map = makeMap()
    const shape = new Polygon(ring, { fillColor: 'var(--land)' }).addTo(map) as any
    shape.setStyle({ fillColor: '#abcdef' })
    expect(shape._path.style.getPropertyValue('fill')).toBe('')
    expect(shape._path.getAttribute('fill')).toBe('#abcdef')
  })
})
