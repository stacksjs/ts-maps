/**
 * Integration tests covering the glue between the map's 3D / atmosphere
 * state and the WebGL render loop.
 *
 * The previous tests covered APIs in isolation (setTerrain, setFog,
 * setSky, addCustomLayer store state; buildTerrainMesh + drawTerrain
 * work in a unit sense). These tests assert the pipeline is wired:
 *
 *   - adding a custom layer actually causes `render()` to be invoked
 *     when a tile is drawn with WebGL.
 *   - setFog / setSky produce a visible DOM overlay and the overlay's
 *     opacity tracks pitch (0 at top-down, non-zero when tilted).
 *   - the per-tile terrain hook draws nothing into a tile: the terrain is
 *     drawn for the whole view by TerrainView, not tile by tile.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Map } from '../src/core-map/map/index'

function makeStubGL(): { gl: any, calls: Record<string, any[]> } {
  const calls: Record<string, any[]> = {
    useProgram: [],
    drawArrays: [],
    drawElements: [],
    viewport: [],
    clear: [],
    bindBuffer: [],
    bufferData: [],
    createBuffer: [],
    uniformMatrix4fv: [],
    uniform4f: [],
    uniform1f: [],
  }
  let bufId = 0
  const gl = {
    TRIANGLES: 4,
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044,
    UNSIGNED_INT: 5125,
    FLOAT: 5126,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    COLOR_BUFFER_BIT: 16384,
    DEPTH_BUFFER_BIT: 256,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    createShader: () => ({ id: 'shader' }),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    deleteShader: () => {},
    createProgram: () => ({ id: 'program' }),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    deleteProgram: () => {},
    useProgram: (p: any) => { calls.useProgram.push(p) },
    getUniformLocation: (_p: any, n: string) => ({ name: n }),
    getAttribLocation: () => 0,
    createBuffer: () => {
      const b = { id: `buf-${bufId++}` }
      calls.createBuffer.push(b)
      return b
    },
    bindBuffer: (t: number, b: any) => { calls.bindBuffer.push([t, b]) },
    bufferData: (t: number, d: any) => { calls.bufferData.push([t, d?.byteLength ?? d?.length]) },
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    deleteBuffer: () => {},
    drawArrays: (...args: unknown[]) => { calls.drawArrays.push(args) },
    drawElements: (mode: number, count: number, type: number) => {
      calls.drawElements.push({ mode, count, type })
    },
    uniformMatrix4fv: (l: any, _t: boolean, v: Float32Array) => { calls.uniformMatrix4fv.push([l, v]) },
    uniform4f: (...args: unknown[]) => { calls.uniform4f.push(args) },
    uniform1f: (...args: unknown[]) => { calls.uniform1f.push(args) },
    viewport: () => {},
    clearColor: () => {},
    clear: () => { calls.clear.push(1) },
    enable: () => {},
    disable: () => {},
    blendFunc: () => {},
  }
  return { gl, calls }
}

describe('Map atmosphere overlay — sky + fog', () => {
  let container: HTMLElement
  let map: Map

  beforeEach(() => {
    container = document.createElement('div')
    container.style.width = '300px'
    container.style.height = '200px'
    document.body.appendChild(container)
    map = new Map(container, { center: [0, 0], zoom: 3, pitch: 40 })
  })

  afterEach(() => {
    map.remove()
    container.remove()
  })

  test('no overlay exists by default', () => {
    expect(container.querySelector('.ts-maps-atmosphere')).toBeNull()
  })

  test('setSky creates the atmosphere overlay inside the container', () => {
    map.setSky({ 'sky-color': '#2563eb', 'horizon-color': '#fef3c7' })
    const overlay = container.querySelector('.ts-maps-atmosphere') as HTMLElement | null
    expect(overlay).not.toBeNull()
    expect(overlay!.style.position).toBe('absolute')
    expect(overlay!.style.pointerEvents).toBe('none')
    expect(overlay!.style.background).toContain('#2563eb')
  })

  test('setFog creates the atmosphere overlay and includes the fog colour', () => {
    map.setFog({ color: 'rgb(255, 200, 180)' })
    const overlay = container.querySelector('.ts-maps-atmosphere') as HTMLElement
    expect(overlay).not.toBeNull()
    expect(overlay.style.background).toContain('rgb(255, 200, 180)')
  })

  test('both sky and fog stack in a single overlay', () => {
    map.setSky({ 'sky-color': '#2563eb' })
    map.setFog({ color: 'rgb(255, 200, 180)' })
    const overlay = container.querySelector('.ts-maps-atmosphere') as HTMLElement
    expect(overlay.style.background).toContain('#2563eb')
    expect(overlay.style.background).toContain('rgb(255, 200, 180)')
  })

  test('clearing both sky and fog removes the overlay', () => {
    map.setSky({ 'sky-color': '#2563eb' })
    map.setFog({ color: '#ff0000' })
    expect(container.querySelector('.ts-maps-atmosphere')).not.toBeNull()
    map.setSky(null)
    // Still there — fog is still active.
    expect(container.querySelector('.ts-maps-atmosphere')).not.toBeNull()
    map.setFog(null)
    // Both gone → overlay removed.
    expect(container.querySelector('.ts-maps-atmosphere')).toBeNull()
  })

  test('overlay is hidden at pitch 0 and visible at high pitch', () => {
    const flatMap = new Map(
      (() => {
        const d = document.createElement('div')
        d.style.width = '200px'
        d.style.height = '120px'
        document.body.appendChild(d)
        return d
      })(),
      { center: [0, 0], zoom: 3, pitch: 0 },
    )
    flatMap.setSky({ 'sky-color': '#000' })
    const overlay = flatMap.getContainer().querySelector('.ts-maps-atmosphere') as HTMLElement
    expect(overlay.style.display).toBe('none')
    flatMap.remove()

    const tiltedMap = new Map(
      (() => {
        const d = document.createElement('div')
        d.style.width = '200px'
        d.style.height = '120px'
        document.body.appendChild(d)
        return d
      })(),
      { center: [0, 0], zoom: 3, pitch: 50 },
    )
    tiltedMap.setSky({ 'sky-color': '#000' })
    const overlay2 = tiltedMap.getContainer().querySelector('.ts-maps-atmosphere') as HTMLElement
    expect(overlay2.style.display).toBe('block')
    expect(Number.parseFloat(overlay2.style.opacity)).toBeGreaterThan(0)
    tiltedMap.remove()
  })

  test('setPitch updates the overlay opacity live', () => {
    map.setSky({ 'sky-color': '#fff' })
    const overlay = container.querySelector('.ts-maps-atmosphere') as HTMLElement
    const before = Number.parseFloat(overlay.style.opacity)

    map.setPitch(55)
    const after = Number.parseFloat(overlay.style.opacity)
    expect(after).toBeGreaterThan(before)
  })
})

describe('Map custom-layer render hook', () => {
  let container: HTMLElement
  let map: Map

  beforeEach(() => {
    container = document.createElement('div')
    container.style.width = '256px'
    container.style.height = '256px'
    document.body.appendChild(container)
    map = new Map(container, { center: [0, 0], zoom: 3 })
  })

  afterEach(() => {
    map.remove()
    container.remove()
  })

  test('_invokeCustomLayerRender calls render on every registered layer', () => {
    const calls: string[] = []
    const proj = new Float32Array(16)
    const gl = makeStubGL().gl as unknown as WebGL2RenderingContext

    map.addCustomLayer({
      id: 'a',
      type: 'custom',
      render: (_gl, _proj) => { calls.push('a') },
    })
    map.addCustomLayer({
      id: 'b',
      type: 'custom',
      render: (_gl, _proj) => { calls.push('b') },
    })

    map._invokeCustomLayerRender(gl, proj)
    expect(calls).toEqual(['a', 'b'])
  })

  test('_invokeCustomLayerRender forwards the supplied gl + projection', () => {
    let seenGl: unknown = null
    let seenProj: unknown = null
    const proj = new Float32Array(16)
    proj[0] = 99
    const gl = makeStubGL().gl as unknown as WebGL2RenderingContext

    map.addCustomLayer({
      id: 'x',
      type: 'custom',
      render: (g, p) => { seenGl = g; seenProj = p },
    })
    map._invokeCustomLayerRender(gl, proj)
    expect(seenGl).toBe(gl)
    expect(seenProj).toBe(proj)
  })

  test('a throwing custom layer does not stop subsequent ones', () => {
    const calls: string[] = []
    const proj = new Float32Array(16)
    const gl = makeStubGL().gl as unknown as WebGL2RenderingContext

    map.addCustomLayer({
      id: 'bad',
      type: 'custom',
      render: () => { throw new Error('boom') },
    })
    map.addCustomLayer({
      id: 'good',
      type: 'custom',
      render: () => { calls.push('good') },
    })
    // Must not throw.
    map._invokeCustomLayerRender(gl, proj)
    expect(calls).toEqual(['good'])
  })

  test('no custom layers = no-op, no crash', () => {
    const proj = new Float32Array(16)
    const gl = makeStubGL().gl as unknown as WebGL2RenderingContext
    expect(() => map._invokeCustomLayerRender(gl, proj)).not.toThrow()
  })
})

describe('Map terrain draw hook', () => {
  let container: HTMLElement
  let map: Map

  beforeEach(() => {
    container = document.createElement('div')
    container.style.width = '256px'
    container.style.height = '256px'
    document.body.appendChild(container)
    map = new Map(container, { center: [0, 0], zoom: 3 })
  })

  afterEach(() => {
    map.remove()
    container.remove()
  })

  test('is a no-op when terrain is not enabled', () => {
    // Import here so the Renderer stubs are scoped to this test.
    const { WebGLTileRenderer } = require('../src/core-map/renderer/webgl/WebGLTileRenderer')
    const { gl, calls } = makeStubGL()
    const canvas = { getContext: () => gl } as unknown as HTMLCanvasElement
    const r = new WebGLTileRenderer(canvas)
    const proj = new Float32Array(16)
    map._drawTerrainForTile(r, { z: 0, x: 0, y: 0 }, 256, proj)
    expect(calls.drawElements).toHaveLength(0)
  })

  test('is a no-op when terrain is enabled but no DEM tile is loaded', () => {
    const { WebGLTileRenderer } = require('../src/core-map/renderer/webgl/WebGLTileRenderer')
    map.setTerrain({ source: 'dem' })
    const { gl, calls } = makeStubGL()
    const canvas = { getContext: () => gl } as unknown as HTMLCanvasElement
    const r = new WebGLTileRenderer(canvas)
    const proj = new Float32Array(16)
    map._drawTerrainForTile(r, { z: 5, x: 10, y: 12 }, 256, proj)
    expect(calls.drawElements).toHaveLength(0)
  })

  test('draws nothing into a tile even with its DEM tile loaded', () => {
    // The terrain is drawn for the whole view by TerrainView; a tile drawn
    // with WebGL gets no flat terrain mesh painted into it.
    const { WebGLTileRenderer } = require('../src/core-map/renderer/webgl/WebGLTileRenderer')
    map.setTerrain({ source: 'dem' })
    const src = map.getTerrainSource()!
    const demSize = 256
    const elev = new Float32Array(demSize * demSize)
    for (let i = 0; i < elev.length; i++)
      elev[i] = (i % demSize) * 2
    src.addTileElevation({ z: 5, x: 10, y: 12 }, elev)

    const { gl, calls } = makeStubGL()
    const canvas = { getContext: () => gl } as unknown as HTMLCanvasElement
    const r = new WebGLTileRenderer(canvas)
    map._drawTerrainForTile(r, { z: 5, x: 10, y: 12 }, 256, new Float32Array(16))
    expect(calls.drawElements).toHaveLength(0)
  })

  test('addTerrainTile(pixels) decodes into heights the map answers with', () => {
    map.setTerrain({ source: 'dem' })
    // Mapbox RGB: (0, 0, 0) → -10000 m. All-zero pixels is valid.
    const px = new Uint8Array(256 * 256 * 4)
    for (let i = 3; i < px.length; i += 4)
      px[i] = 255
    map.addTerrainTile({ z: 0, x: 0, y: 0 }, px)
    expect(map.queryTerrainElevation({ lat: 10, lng: 10 })).toBeCloseTo(-10000, 3)
  })

  test('addTerrainTile is a no-op when terrain is disabled', () => {
    const px = new Uint8Array(256 * 256 * 4)
    // Does NOT throw; also doesn't create a source.
    map.addTerrainTile({ z: 0, x: 0, y: 0 }, px)
    expect(map.getTerrainSource()).toBeUndefined()
  })
})
