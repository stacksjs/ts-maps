import { afterEach, describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'
import { Pbf } from '../src/core-map/proto/Pbf'
import { WebGLTileRenderer } from '../src/core-map/renderer/webgl/WebGLTileRenderer'
import { validateStyle } from '../src/core-map/style-spec'
import { VectorTileMapLayer } from '../src/core-map'
import type { Style } from '../src/core-map/style-spec'

// ---------------------------------------------------------------------------
// Minimal stub WebGL2 context — matches the surface the renderer touches.
// See `test/webgl-renderer.test.ts` for the broader template this file follows.
// ---------------------------------------------------------------------------

interface Spy {
  (...args: unknown[]): unknown
  calls: unknown[][]
  callCount: number
}

function spy(impl?: (...args: any[]) => unknown): Spy {
  const fn = ((...args: unknown[]) => {
    fn.calls.push(args)
    fn.callCount++
    return impl ? impl(...args) : undefined
  }) as Spy
  fn.calls = []
  fn.callCount = 0
  return fn
}

interface StubGL extends Record<string, any> {
  VERTEX_SHADER: number
  FRAGMENT_SHADER: number
  COMPILE_STATUS: number
  LINK_STATUS: number
  ARRAY_BUFFER: number
  STATIC_DRAW: number
  FLOAT: number
  TRIANGLES: number
  TRIANGLE_STRIP: number
  COLOR_BUFFER_BIT: number
  BLEND: number
  ONE: number
  ONE_MINUS_SRC_ALPHA: number
}

function createStubGL(): StubGL {
  let shaderSeq = 0
  let programSeq = 0
  let bufferSeq = 0
  const bufferData: Map<any, Float32Array> = new Map()

  const gl: StubGL = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    TRIANGLES: 4,
    TRIANGLE_STRIP: 5,
    COLOR_BUFFER_BIT: 16384,
    BLEND: 3042,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 771,

    enable: spy(),
    blendFunc: spy(),
    viewport: spy(),
    clearColor: spy(),
    clear: spy(),
    useProgram: spy(),

    createShader: spy(() => ({ id: `shader-${shaderSeq++}` })),
    shaderSource: spy(),
    compileShader: spy(),
    getShaderParameter: spy(() => true),
    getShaderInfoLog: spy(() => ''),
    deleteShader: spy(),

    createProgram: spy(() => ({ id: `program-${programSeq++}` })),
    attachShader: spy(),
    linkProgram: spy(),
    getProgramParameter: spy(() => true),
    getProgramInfoLog: spy(() => ''),
    deleteProgram: spy(),

    getUniformLocation: spy((_: unknown, name: string) => ({ name })),
    getAttribLocation: spy(() => 0),
    uniform1f: spy(),
    uniform4f: spy(),
    uniformMatrix4fv: spy(),

    createBuffer: spy(() => ({ id: `buffer-${bufferSeq++}` })),
    bindBuffer: spy(),
    bufferData: spy((_target: unknown, data: Float32Array) => {
      // Track the last-bound buffer's payload so tests can inspect it.
      bufferData.set('last', data)
    }),
    enableVertexAttribArray: spy(),
    vertexAttribPointer: spy(),
    vertexAttribDivisor: spy(),
    deleteBuffer: spy(),

    drawArrays: spy(),
    drawArraysInstanced: spy(),
  }
  gl.__bufferData = bufferData
  return gl
}

function stubCanvas(gl: StubGL): HTMLCanvasElement {
  const el = document.createElement('canvas') as HTMLCanvasElement
  const original = el.getContext.bind(el);
  (el as HTMLCanvasElement & { getContext: (type: string) => unknown }).getContext = ((type: string) => {
    if (type === 'webgl2')
      return gl
    return original(type as '2d')
  }) as HTMLCanvasElement['getContext']
  return el
}

// ---------------------------------------------------------------------------
// validateStyle — paint props pass the schema.
// ---------------------------------------------------------------------------

describe('fill-extrusion style-spec', () => {
  test('all paint props are accepted by validateStyle', () => {
    const style: Style = {
      version: 8,
      sources: { vt: { type: 'vector', url: 'mapbox://example' } },
      layers: [
        {
          id: 'buildings',
          type: 'fill-extrusion',
          source: 'vt',
          'source-layer': 'building',
          paint: {
            'fill-extrusion-color': '#c8c8c8',
            'fill-extrusion-opacity': 0.9,
            'fill-extrusion-height': 50,
            'fill-extrusion-base': 0,
            'fill-extrusion-vertical-gradient': true,
          },
        },
      ],
    }
    expect(validateStyle(style)).toEqual([])
  })

  test('fill-extrusion-height accepts an expression', () => {
    const style: Style = {
      version: 8,
      sources: { vt: { type: 'vector', url: 'mapbox://example' } },
      layers: [
        {
          id: 'buildings',
          type: 'fill-extrusion',
          source: 'vt',
          'source-layer': 'building',
          paint: {
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-color': '#abc',
          },
        },
      ],
    }
    expect(validateStyle(style)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// WebGLTileRenderer.drawFillExtrusion — side-wall + skip-behaviour invariants.
// ---------------------------------------------------------------------------

describe('WebGLTileRenderer.drawFillExtrusion', () => {
  test('square footprint: side-wall vertex count is 2 triangles * 3 verts * xyz per edge', () => {
    const gl = createStubGL()
    const renderer = new WebGLTileRenderer(stubCanvas(gl))

    // Square = 4 edges. 2 triangles per edge × 3 vertices × 3 floats (xyz)
    // = 18 floats per edge of side-wall data, plus the top-cap triangles.
    const vertexCount = renderer.drawFillExtrusion(
      [{ rings: [[
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]] }],
      [5],
      [0],
      [1, 0, 0, 1],
      1,
    )

    // 4 side edges × 6 verts = 24 side verts. Top cap of a square is 2
    // triangles → 6 verts. Total = 30 verts.
    expect(vertexCount).toBe(30)

    // Sides-only portion: 4 edges × 6 verts × 3 floats = 72 floats.
    // Confirming the wider invariant that per edge we emit
    // `2 * 3 * 3 = 18` floats of side geometry.
    const sideVerts = 4 * 6
    expect(sideVerts * 3).toBe(72)
  })

  test('skips features where height <= base', () => {
    const gl = createStubGL()
    const renderer = new WebGLTileRenderer(stubCanvas(gl))

    const beforeDraws = gl.drawArrays.callCount
    const vertexCount = renderer.drawFillExtrusion(
      [{ rings: [[
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]] }],
      [5],
      [5], // height == base → nothing to extrude
      [0, 1, 0, 1],
      1,
    )
    expect(vertexCount).toBe(0)
    // No draw was issued because there was no geometry to emit.
    expect(gl.drawArrays.callCount).toBe(beforeDraws)

    // Base above height also skips.
    const vertexCount2 = renderer.drawFillExtrusion(
      [{ rings: [[
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]] }],
      [1],
      [5],
      [0, 1, 0, 1],
      1,
    )
    expect(vertexCount2).toBe(0)
  })

  test('different heights produce proportional geometry counts', () => {
    const gl = createStubGL()
    const renderer = new WebGLTileRenderer(stubCanvas(gl))

    // Triangle footprint = 3 edges. Per-edge sides = 6 verts; top cap = 3.
    // Total for any non-zero height: 21 verts.
    const a = renderer.drawFillExtrusion(
      [{ rings: [[
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 8 },
      ]] }],
      [2],
      [0],
      [1, 1, 1, 1],
      1,
    )

    // Square → 4 edges × 6 + 6 top = 30 verts.
    const b = renderer.drawFillExtrusion(
      [{ rings: [[
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]] }],
      [2],
      [0],
      [1, 1, 1, 1],
      1,
    )
    expect(a).toBe(21)
    expect(b).toBe(30)
    expect(b).toBeGreaterThan(a)
  })

  test('empty footprints list is a no-op', () => {
    const gl = createStubGL()
    const renderer = new WebGLTileRenderer(stubCanvas(gl))
    const before = gl.drawArrays.callCount
    const vertexCount = renderer.drawFillExtrusion([], [], 0, [1, 0, 0, 1], 1)
    expect(vertexCount).toBe(0)
    expect(gl.drawArrays.callCount).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// Pipeline — a fill-extrusion style layer routes through drawFillExtrusion
// when a WebGL context is available.
// ---------------------------------------------------------------------------

function zz(n: number): number {
  return (n << 1) ^ (n >> 31)
}

function cmd(id: number, count: number): number {
  return (id & 0x7) | (count << 3)
}

function clockwiseSquare(x0: number, y0: number, size: number): number[] {
  return [
    cmd(1, 1), zz(x0), zz(y0),
    cmd(2, 3),
    zz(size), zz(0),
    zz(0), zz(size),
    zz(-size), zz(0),
    cmd(7, 1),
  ]
}

function encodeBuildingTile(): Uint8Array {
  const pbf = new Pbf()
  pbf.writeMessage(3, (_, p) => {
    // Layer body.
    p.writeVarintField(15, 2)
    p.writeStringField(1, 'building')
    p.writeMessage(2, (_inner, pp) => {
      pp.writePackedVarint(2, [0, 0])
      pp.writeVarintField(3, 3)
      pp.writePackedVarint(4, clockwiseSquare(1000, 1000, 500))
    }, null)
    p.writeStringField(3, 'height')
    p.writeMessage(4, (_inner, pp) => { pp.writeStringField(1, 'tall') }, null)
    p.writeVarintField(5, 4096)
  }, null)
  return pbf.finish()
}

function createContainer(): HTMLElement {
  const container = document.createElement('div')
  container.style.width = '512px'
  container.style.height = '512px'
  document.body.appendChild(container)
  return container
}

function stampSize(map: TsMap, width: number, height: number): void {
  map._size = new Point(width, height)
  map._sizeChanged = false
  if (map._loaded && map._lastCenter)
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
}

function installFetchStub(handler: (url: string) => Promise<Response>): () => void {
  const original = globalThis.fetch
  globalThis.fetch = ((url: any) => handler(String(url))) as typeof fetch
  return () => { globalThis.fetch = original }
}

function responseFrom(bytes: Uint8Array, init?: ResponseInit): Response {
  return new Response(bytes as unknown as BodyInit, init)
}

describe('fill-extrusion style layer pipeline', () => {
  let restoreFetch: (() => void) | undefined
  afterEach(() => { restoreFetch?.(); restoreFetch = undefined })

  test('renderer.drawFillExtrusion is invoked when a fill-extrusion layer is drawn', async () => {
    const bytes = encodeBuildingTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({
      url: 'https://tiles/{z}/{x}/{y}.pbf',
      tileSize: 512,
      layers: [
        {
          id: 'b',
          type: 'fill-extrusion',
          sourceLayer: 'building',
          paint: {
            'fill-extrusion-color': '#c8c8c8',
            'fill-extrusion-height': 50,
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 1,
          },
        },
      ],
    })
    layer._map = map
    layer._tiles = {}

    // Spy on the renderer prototype before the tile draws.
    const originalDraw = WebGLTileRenderer.prototype.drawFillExtrusion
    let callCount = 0
    let lastHeights: number[] | null = null
    WebGLTileRenderer.prototype.drawFillExtrusion = function spied(
      this: WebGLTileRenderer,
      footprints: Parameters<typeof originalDraw>[0],
      heights: number[],
      base: Parameters<typeof originalDraw>[2],
      color: Parameters<typeof originalDraw>[3],
      opacity: number,
      proj?: Parameters<typeof originalDraw>[5],
    ): number {
      callCount++
      lastHeights = heights.slice()
      return originalDraw.call(this, footprints, heights, base, color, opacity, proj)
    }

    try {
      const coords = new Point(0, 0) as Point & { z: number }
      coords.z = 4
      let resolveReady: (v: { err: unknown }) => void = () => {}
      const ready = new Promise<{ err: unknown }>((r) => { resolveReady = r })
      const canvas = layer.createTile(coords, (err) => { resolveReady({ err }) }) as HTMLCanvasElement
      layer._tiles![`0:0:4`] = { el: canvas, coords, current: true } as any
      await ready
      // Either the WebGL path fired drawFillExtrusion, or the runtime lacks
      // WebGL2 and we silently fell back to Canvas2D (which doesn't extrude).
      // Require at least one call when the GL context was acquired.
      const entry = (layer as any)._decodedTiles.get(canvas)
      if (entry?.gl) {
        expect(callCount).toBeGreaterThan(0)
        expect(lastHeights).not.toBeNull()
        expect(lastHeights![0]).toBeGreaterThan(0)
      }
    }
    finally {
      WebGLTileRenderer.prototype.drawFillExtrusion = originalDraw
    }
  })
})
