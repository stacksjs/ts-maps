import { beforeEach, describe, expect, test } from 'bun:test'
import { TsMap } from '../src/core-map/map/Map'
import { compile } from '../src/core-map/style-spec/expressions'

// ---------------------------------------------------------------------------
// Minimal TsMap harness — we don't need a full style to poke the feature-state
// API; the store lives on the map itself and is independent of the Style.
// ---------------------------------------------------------------------------

function makeMap(): TsMap {
  const container = document.createElement('div')
  container.style.width = '256px'
  container.style.height = '256px'
  document.body.appendChild(container)
  return new TsMap(container, { center: [0, 0], zoom: 0 } as any)
}

describe('TsMap feature-state API', () => {
  let map: TsMap

  beforeEach(() => {
    map = makeMap()
  })

  test('set → get round-trips', () => {
    map.setFeatureState({ source: 'places', id: 7 }, { hover: true })
    expect(map.getFeatureState({ source: 'places', id: 7 })).toEqual({ hover: true })
  })

  test('subsequent set merges rather than replaces', () => {
    map.setFeatureState({ source: 'places', id: 1 }, { hover: true })
    map.setFeatureState({ source: 'places', id: 1 }, { selected: true })
    expect(map.getFeatureState({ source: 'places', id: 1 })).toEqual({ hover: true, selected: true })
  })

  test('numeric and string ids are distinct keys', () => {
    map.setFeatureState({ source: 'places', id: 1 }, { tag: 'num' })
    map.setFeatureState({ source: 'places', id: '1' }, { tag: 'str' })
    expect(map.getFeatureState({ source: 'places', id: 1 })).toEqual({ tag: 'num' })
    expect(map.getFeatureState({ source: 'places', id: '1' })).toEqual({ tag: 'str' })
  })

  test('removeFeatureState with a key deletes that key only', () => {
    map.setFeatureState({ source: 's', id: 2 }, { a: 1, b: 2 })
    map.removeFeatureState({ source: 's', id: 2 }, 'a')
    expect(map.getFeatureState({ source: 's', id: 2 })).toEqual({ b: 2 })
  })

  test('removeFeatureState without a key drops the whole entry', () => {
    map.setFeatureState({ source: 's', id: 3 }, { a: 1 })
    map.removeFeatureState({ source: 's', id: 3 })
    expect(map.getFeatureState({ source: 's', id: 3 })).toEqual({})
  })

  test('sourceLayer participates in the key', () => {
    map.setFeatureState({ source: 's', sourceLayer: 'a', id: 1 }, { v: 1 })
    map.setFeatureState({ source: 's', sourceLayer: 'b', id: 1 }, { v: 2 })
    expect(map.getFeatureState({ source: 's', sourceLayer: 'a', id: 1 })).toEqual({ v: 1 })
    expect(map.getFeatureState({ source: 's', sourceLayer: 'b', id: 1 })).toEqual({ v: 2 })
  })
})

describe('feature-state expression integration', () => {
  test('["feature-state", key] resolves against the evaluation context', () => {
    const c = compile(['feature-state', 'hover'], 'value')
    expect(c.dependsOnFeatureState).toBe(true)
    const result = c.evaluate({ zoom: 0, featureState: { hover: true } })
    expect(result).toBe(true)
    const absent = c.evaluate({ zoom: 0 })
    expect(absent).toBeUndefined()
  })
})
