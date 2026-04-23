import type { CustomLayerInterface, FogOptions, SkyOptions } from '../src/core-map/map/Map'
import { describe, expect, test } from 'bun:test'
import { TsMap } from '../src/core-map/map/Map'

function makeContainer(): HTMLElement {
  const el = document.createElement('div')
  el.style.width = '400px'
  el.style.height = '300px'
  document.body.appendChild(el)
  return el
}

// Canvas stub that hands back a bare object for `getContext('webgl2')`.
// The map uses it in `_getCustomLayerGL()` to decide whether to fire
// `onAdd` / `onRemove` on custom layers.
function attachWebGLCanvas(container: HTMLElement): { gl: object } {
  const canvas = document.createElement('canvas')
  const gl = {}
  ;(canvas as HTMLCanvasElement & { getContext: (type: string) => unknown }).getContext = ((type: string) => {
    if (type === 'webgl2')
      return gl
    return null
  }) as HTMLCanvasElement['getContext']
  container.appendChild(canvas)
  return { gl }
}

describe('TsMap.setFog / getFog', () => {
  test('setFog stores the options and getFog returns the same shape', () => {
    const map = new TsMap(makeContainer())
    const fog: FogOptions = {
      'color': 'rgb(10, 20, 30)',
      'horizon-blend': 0.2,
      'range': [0.6, 12],
      'high-color': '#ffccee',
      'star-intensity': 0.5,
    }
    map.setFog(fog)
    const got = map.getFog()
    expect(got).not.toBeNull()
    expect(got!.color).toBe('rgb(10, 20, 30)')
    expect(got!['horizon-blend']).toBe(0.2)
    expect(got!.range).toEqual([0.6, 12])
    expect(got!['high-color']).toBe('#ffccee')
    expect(got!['star-intensity']).toBe(0.5)
  })

  test('setFog(null) clears the stored fog', () => {
    const map = new TsMap(makeContainer())
    map.setFog({ color: 'white' })
    expect(map.getFog()).not.toBeNull()
    map.setFog(null)
    expect(map.getFog()).toBeNull()
  })

  test('fogchange event fires on setFog', () => {
    const map = new TsMap(makeContainer())
    let fired = 0
    let lastPayload: unknown
    map.on('fogchange', (e: unknown) => {
      fired++
      lastPayload = e
    })
    map.setFog({ color: 'white' })
    expect(fired).toBe(1)
    expect(lastPayload).toBeDefined()
    map.setFog(null)
    expect(fired).toBe(2)
  })

  test('invalid range throws RangeError', () => {
    const map = new TsMap(makeContainer())
    expect(() => map.setFog({ range: [5, 5] })).toThrow(RangeError)
    expect(() => map.setFog({ range: [10, 2] })).toThrow(RangeError)
  })

  test('negative star-intensity throws RangeError', () => {
    const map = new TsMap(makeContainer())
    expect(() => map.setFog({ 'star-intensity': -0.01 })).toThrow(RangeError)
  })
})

describe('TsMap.setSky / getSky', () => {
  test('setSky round-trips through getSky', () => {
    const map = new TsMap(makeContainer())
    const sky: SkyOptions = {
      'sky-color': '#123456',
      'horizon-color': '#abcdef',
      'fog-ground-blend': 0.5,
      'sun-position': [45, 30],
      'sun-intensity': 0.4,
    }
    map.setSky(sky)
    const got = map.getSky()
    expect(got).not.toBeNull()
    expect(got!['sky-color']).toBe('#123456')
    expect(got!['horizon-color']).toBe('#abcdef')
    expect(got!['fog-ground-blend']).toBe(0.5)
    expect(got!['sun-position']).toEqual([45, 30])
    expect(got!['sun-intensity']).toBe(0.4)
  })

  test('fog-ground-blend of 1.5 is clamped to 1', () => {
    const map = new TsMap(makeContainer())
    map.setSky({ 'fog-ground-blend': 1.5 })
    expect(map.getSky()!['fog-ground-blend']).toBe(1)
  })

  test('sun-intensity of -0.3 is clamped to 0', () => {
    const map = new TsMap(makeContainer())
    map.setSky({ 'sun-intensity': -0.3 })
    expect(map.getSky()!['sun-intensity']).toBe(0)
  })

  test('NaN values throw RangeError', () => {
    const map = new TsMap(makeContainer())
    expect(() => map.setSky({ 'fog-ground-blend': Number.NaN })).toThrow(RangeError)
    expect(() => map.setSky({ 'sun-intensity': Number.NaN })).toThrow(RangeError)
    expect(() => map.setSky({ 'sun-position': [Number.NaN, 10] })).toThrow(RangeError)
  })

  test('setSky(null) clears the stored sky and fires skychange', () => {
    const map = new TsMap(makeContainer())
    let fired = 0
    map.on('skychange', () => { fired++ })
    map.setSky({ 'sky-color': '#000' })
    expect(map.getSky()).not.toBeNull()
    map.setSky(null)
    expect(map.getSky()).toBeNull()
    expect(fired).toBe(2)
  })
})

describe('TsMap custom layers', () => {
  test('addCustomLayer + getCustomLayer round-trips the object', () => {
    const map = new TsMap(makeContainer())
    const layer: CustomLayerInterface = {
      id: 'foo',
      type: 'custom',
      render: () => {},
    }
    map.addCustomLayer(layer)
    expect(map.getCustomLayer('foo')).toBe(layer)
  })

  test('adding twice with the same id throws', () => {
    const map = new TsMap(makeContainer())
    const layer: CustomLayerInterface = { id: 'dup', type: 'custom', render: () => {} }
    map.addCustomLayer(layer)
    expect(() => map.addCustomLayer(layer)).toThrow()
  })

  test('removeCustomLayer deletes the layer and fires customlayer:remove', () => {
    const map = new TsMap(makeContainer())
    const layer: CustomLayerInterface = { id: 'rm', type: 'custom', render: () => {} }
    map.addCustomLayer(layer)
    let removeFired = 0
    map.on('customlayer:remove', () => { removeFired++ })
    map.removeCustomLayer('rm')
    expect(map.getCustomLayer('rm')).toBeUndefined()
    expect(removeFired).toBe(1)
    // No-op on unknown ids.
    map.removeCustomLayer('does-not-exist')
    expect(removeFired).toBe(1)
  })

  test('onAdd / onRemove fire when GL is available', () => {
    const container = makeContainer()
    const map = new TsMap(container)
    const { gl } = attachWebGLCanvas(container)

    let addCall: { map: TsMap, gl: unknown } | null = null
    let removeCall: { map: TsMap, gl: unknown } | null = null
    const layer: CustomLayerInterface = {
      id: 'gl-aware',
      type: 'custom',
      onAdd(m, g) { addCall = { map: m, gl: g } },
      onRemove(m, g) { removeCall = { map: m, gl: g } },
      render: () => {},
    }
    map.addCustomLayer(layer)
    expect(addCall).not.toBeNull()
    expect(addCall!.map).toBe(map)
    expect(addCall!.gl).toBe(gl)

    map.removeCustomLayer('gl-aware')
    expect(removeCall).not.toBeNull()
    expect(removeCall!.gl).toBe(gl)
  })

  test('customlayer:add event fires', () => {
    const map = new TsMap(makeContainer())
    let addFired = 0
    map.on('customlayer:add', () => { addFired++ })
    map.addCustomLayer({ id: 'evt', type: 'custom', render: () => {} })
    expect(addFired).toBe(1)
  })

  test('getCustomLayers returns all registered layers', () => {
    const map = new TsMap(makeContainer())
    const a: CustomLayerInterface = { id: 'a', type: 'custom', render: () => {} }
    const b: CustomLayerInterface = { id: 'b', type: 'custom', render: () => {} }
    const c: CustomLayerInterface = { id: 'c', type: 'custom', render: () => {} }
    map.addCustomLayer(a)
    map.addCustomLayer(b)
    map.addCustomLayer(c)
    const all = map.getCustomLayers()
    expect(all).toEqual([a, b, c])
    map.removeCustomLayer('b')
    expect(map.getCustomLayers()).toEqual([a, c])
  })
})
