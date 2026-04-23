import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  buildTerrainMesh,
  decodeElevationGrid,
  decodeMapboxRGB,
  decodeTerrariumRGB,
  LatLng,
  sampleElevationBilinear,
  TerrainSource,
} from '../src/core-map/geo/index'
import { TsMap } from '../src/core-map/map/index'
import { WebGLTileRenderer } from '../src/core-map/renderer/webgl/index'

// ---------------------------------------------------------------------------
// Elevation encoding helpers
// ---------------------------------------------------------------------------

describe('elevation decoders', () => {
  test('Mapbox RGB encodes 0m baseline at (0, 0, 0) offset minus 10000', () => {
    // Mapbox formula: -10000 + (r*65536 + g*256 + b) * 0.1
    // Pure (0,0,0) → -10000m, as per spec.
    expect(decodeMapboxRGB(0, 0, 0)).toBeCloseTo(-10000, 6)
    // One green unit ≈ 25.6m step.
    expect(decodeMapboxRGB(0, 1, 0)).toBeCloseTo(-10000 + 25.6, 6)
  })

  test('Terrarium RGB baseline', () => {
    // (r=128, g=0, b=0) → 128*256 - 32768 = 0 metres.
    expect(decodeTerrariumRGB(128, 0, 0)).toBeCloseTo(0, 6)
    // 1 unit of b is 1/256m.
    expect(decodeTerrariumRGB(128, 0, 1)).toBeCloseTo(1 / 256, 6)
  })

  test('decodeElevationGrid walks an RGBA pixel buffer', () => {
    // 2×2 Mapbox tile — each pixel chosen so the elevation is the index × 10.
    // Mapbox: elev = -10000 + (r*65536 + g*256 + b)*0.1
    // Solve for (r,g,b) that gives exactly 0, 10, 20, 30 m:
    function pxForElev(m: number): [number, number, number] {
      const raw = Math.round((m + 10000) / 0.1)
      return [(raw >> 16) & 0xff, (raw >> 8) & 0xff, raw & 0xff]
    }
    const px = new Uint8Array(4 * 4)
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = pxForElev(i * 10)
      px[i * 4] = r
      px[i * 4 + 1] = g
      px[i * 4 + 2] = b
      px[i * 4 + 3] = 255
    }
    const elev = decodeElevationGrid(px, 'mapbox')
    expect(elev.length).toBe(4)
    for (let i = 0; i < 4; i++)
      expect(elev[i]).toBeCloseTo(i * 10, 5)
  })
})

describe('sampleElevationBilinear', () => {
  test('exact samples round-trip', () => {
    const e = new Float32Array([0, 10, 20, 30])
    expect(sampleElevationBilinear(e, 2, 0, 0)).toBe(0)
    expect(sampleElevationBilinear(e, 2, 1, 0)).toBe(10)
    expect(sampleElevationBilinear(e, 2, 0, 1)).toBe(20)
    expect(sampleElevationBilinear(e, 2, 1, 1)).toBe(30)
  })

  test('midpoint is average of the four corners', () => {
    const e = new Float32Array([0, 10, 20, 30])
    expect(sampleElevationBilinear(e, 2, 0.5, 0.5)).toBeCloseTo((0 + 10 + 20 + 30) / 4, 6)
  })

  test('clamps out-of-range coordinates to the border', () => {
    const e = new Float32Array([0, 10, 20, 30])
    expect(sampleElevationBilinear(e, 2, -5, -5)).toBe(0)
    expect(sampleElevationBilinear(e, 2, 999, 999)).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// Mesh builder
// ---------------------------------------------------------------------------

function makeFlatDEM(size: number, elev: number): Float32Array {
  const out = new Float32Array(size * size)
  out.fill(elev)
  return out
}

function makeRampDEM(size: number, maxElev: number): Float32Array {
  const out = new Float32Array(size * size)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++)
      out[j * size + i] = (i / (size - 1)) * maxElev
  }
  return out
}

describe('buildTerrainMesh', () => {
  test('flat DEM produces a flat mesh with upward normals', () => {
    const mesh = buildTerrainMesh({
      elevation: makeFlatDEM(4, 0),
      demSize: 4,
      tileSize: 256,
      resolution: 4,
    })
    // (resolution + 1)^2 = 25 vertices, 4^2 * 6 = 96 indices.
    expect(mesh.vertexCount).toBe(25)
    expect(mesh.indexCount).toBe(96)
    expect(mesh.positions.length).toBe(25 * 6)
    expect(mesh.indices.length).toBe(96)

    for (let i = 0; i < mesh.vertexCount; i++) {
      const base = i * 6
      expect(mesh.positions[base + 2]).toBe(0) // z
      expect(mesh.positions[base + 3]).toBeCloseTo(0, 5) // nx
      expect(mesh.positions[base + 4]).toBeCloseTo(0, 5) // ny
      expect(mesh.positions[base + 5]).toBeCloseTo(1, 5) // nz (up)
    }
  })

  test('sloped DEM produces non-trivial normals pointing against the gradient', () => {
    // Ramp in +x, so surface slopes up to the east. Outward normal should
    // have a negative x component (pointing up-and-west).
    const mesh = buildTerrainMesh({
      elevation: makeRampDEM(4, 100),
      demSize: 4,
      tileSize: 256,
      resolution: 4,
    })
    // Pick an interior vertex, not an edge.
    const verticesPerSide = 5
    const interior = 2 * verticesPerSide + 2 // (i=2, j=2)
    const base = interior * 6
    expect(mesh.positions[base + 3]!).toBeLessThan(0) // nx
    expect(Math.abs(mesh.positions[base + 4]!)).toBeLessThan(1e-3) // ny ~ 0
    expect(mesh.positions[base + 5]!).toBeGreaterThan(0) // nz > 0
  })

  test('tileSize scales vertex positions independently of DEM size', () => {
    const mesh = buildTerrainMesh({
      elevation: makeFlatDEM(4, 0),
      demSize: 4,
      tileSize: 512,
      resolution: 2,
    })
    // 2x2 grid → vertices at x ∈ {0, 256, 512}, y ∈ {0, 256, 512}.
    expect(mesh.positions[0]).toBe(0)
    expect(mesh.positions[6]).toBe(256)
    expect(mesh.positions[12]).toBe(512)
  })

  test('rejects demSize < 2', () => {
    expect(() => buildTerrainMesh({ elevation: new Float32Array(1), demSize: 1 })).toThrow(RangeError)
  })

  test('rejects undersized elevation buffers', () => {
    expect(() => buildTerrainMesh({ elevation: new Float32Array(3), demSize: 4 })).toThrow(RangeError)
  })
})

// ---------------------------------------------------------------------------
// TerrainSource
// ---------------------------------------------------------------------------

describe('TerrainSource', () => {
  test('defaults', () => {
    const src = new TerrainSource()
    expect(src.demSize).toBe(256)
    expect(src.encoding).toBe('mapbox')
    expect(src.exaggeration).toBe(1)
    expect(src.size()).toBe(0)
  })

  test('stores and retrieves pre-decoded tiles', () => {
    const src = new TerrainSource({ demSize: 4 })
    src.addTileElevation({ z: 0, x: 0, y: 0 }, makeFlatDEM(4, 42))
    expect(src.hasTile({ z: 0, x: 0, y: 0 })).toBe(true)
    expect(src.size()).toBe(1)
    expect(src.getTile({ z: 0, x: 0, y: 0 })![0]).toBe(42)
  })

  test('decodes raw pixels into elevation when asked', () => {
    const src = new TerrainSource({ demSize: 2 })
    // 4 pixels of (0,0,0) → -10000m under mapbox encoding.
    const px = new Uint8Array(16)
    px[3] = px[7] = px[11] = px[15] = 255
    src.addTilePixels({ z: 0, x: 0, y: 0 }, px)
    const tile = src.getTile({ z: 0, x: 0, y: 0 })!
    expect(tile.length).toBe(4)
    expect(tile[0]).toBeCloseTo(-10000, 2)
  })

  test('queryElevation returns null when no tile covers the point', () => {
    const src = new TerrainSource({ demSize: 4 })
    expect(src.queryElevation(10, 20, 5)).toBeNull()
  })

  test('queryElevation samples the loaded tile when present', () => {
    // Whole-world tile z=0 covers everything with a flat 500m DEM.
    const src = new TerrainSource({ demSize: 256 })
    src.addTileElevation({ z: 0, x: 0, y: 0 }, makeFlatDEM(256, 500))
    const e = src.queryElevation(0, 0, 0)
    expect(e).not.toBeNull()
    expect(e!).toBeCloseTo(500, 2)
  })

  test('queryElevation walks up the pyramid when preferred zoom is missing', () => {
    const src = new TerrainSource({ demSize: 256 })
    src.addTileElevation({ z: 0, x: 0, y: 0 }, makeFlatDEM(256, 123))
    // Ask at zoom 5 — tile (5, ~16, ~16) isn't loaded, but z=0 is.
    expect(src.queryElevation(0, 0, 5)).toBeCloseTo(123, 2)
  })

  test('setExaggeration rejects non-finite values', () => {
    const src = new TerrainSource()
    expect(() => src.setExaggeration(Number.NaN)).toThrow(RangeError)
    expect(() => src.setExaggeration(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

// ---------------------------------------------------------------------------
// TsMap.setTerrain / getTerrain / queryTerrainElevation
// ---------------------------------------------------------------------------

describe('TsMap terrain API', () => {
  let container: HTMLElement
  let map: TsMap

  beforeEach(() => {
    container = document.createElement('div')
    container.style.width = '300px'
    container.style.height = '200px'
    document.body.appendChild(container)
    map = new TsMap(container, { center: [0, 0], zoom: 3 })
  })

  afterEach(() => {
    map.remove()
    container.remove()
  })

  test('getTerrain returns null by default', () => {
    expect(map.getTerrain()).toBeNull()
    expect(map.getTerrainSource()).toBeUndefined()
  })

  test('setTerrain stores config and creates a TerrainSource', () => {
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 })
    const t = map.getTerrain()
    expect(t).not.toBeNull()
    expect(t!.source).toBe('terrain-dem')
    expect(t!.exaggeration).toBe(1.5)
    const src = map.getTerrainSource()
    expect(src).toBeDefined()
    expect(src!.exaggeration).toBe(1.5)
  })

  test('setTerrain(null) clears state and fires terrainchange', () => {
    let fires = 0
    map.on('terrainchange', () => { fires++ })
    map.setTerrain({ source: 'dem' })
    map.setTerrain(null)
    expect(map.getTerrain()).toBeNull()
    expect(fires).toBe(2)
  })

  test('setTerrain validates source', () => {
    expect(() => map.setTerrain({ source: '' } as any)).toThrow(TypeError)
    expect(() => map.setTerrain({ source: 123 } as any)).toThrow(TypeError)
  })

  test('setTerrain rejects NaN / negative exaggeration', () => {
    expect(() => map.setTerrain({ source: 'd', exaggeration: Number.NaN })).toThrow(RangeError)
    expect(() => map.setTerrain({ source: 'd', exaggeration: -1 })).toThrow(RangeError)
  })

  test('queryTerrainElevation returns null when terrain is disabled', () => {
    expect(map.queryTerrainElevation(new LatLng(0, 0))).toBeNull()
  })

  test('queryTerrainElevation samples the in-memory terrain source when tiles are loaded', () => {
    map.setTerrain({ source: 'dem' })
    const src = map.getTerrainSource()!
    const flat = new Float32Array(256 * 256)
    flat.fill(250)
    src.addTileElevation({ z: 0, x: 0, y: 0 }, flat)
    const e = map.queryTerrainElevation(new LatLng(0, 0))
    expect(e).not.toBeNull()
    expect(e!).toBeCloseTo(250, 2)
  })
})

// ---------------------------------------------------------------------------
// WebGLTileRenderer.drawTerrain
// ---------------------------------------------------------------------------

function createStubGL(): { gl: any, calls: Record<string, any[]> } {
  const calls: Record<string, any[]> = {
    drawElements: [],
    bufferData: [],
    useProgram: [],
    uniformMatrix4fv: [],
    uniform4f: [],
    uniform1f: [],
    createBuffer: [],
    bindBuffer: [],
  }
  let bufferId = 0
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
      const b = { id: `buf-${bufferId++}` }
      calls.createBuffer.push(b)
      return b
    },
    bindBuffer: (t: number, b: any) => { calls.bindBuffer.push([t, b]) },
    bufferData: (t: number, d: any) => { calls.bufferData.push([t, d?.byteLength ?? d?.length]) },
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    deleteBuffer: () => {},
    drawArrays: () => {},
    drawElements: (mode: number, count: number, type: number) => {
      calls.drawElements.push({ mode, count, type })
    },
    uniformMatrix4fv: (l: any, _t: boolean, v: Float32Array) => { calls.uniformMatrix4fv.push([l, v]) },
    uniform4f: (l: any, ...rest: number[]) => { calls.uniform4f.push([l, ...rest]) },
    uniform1f: (l: any, v: number) => { calls.uniform1f.push([l, v]) },
    viewport: () => {},
    clearColor: () => {},
    clear: () => {},
    enable: () => {},
    disable: () => {},
    blendFunc: () => {},
  }
  return { gl, calls }
}

describe('WebGLTileRenderer.drawTerrain', () => {
  test('returns 0 for empty mesh', () => {
    const { gl } = createStubGL()
    const canvas = { getContext: () => gl } as unknown as HTMLCanvasElement
    const r = new WebGLTileRenderer(canvas)
    expect(r.drawTerrain(new Float32Array(0), new Uint32Array(0), [1, 0, 0, 1], 1)).toBe(0)
  })

  test('issues drawElements with UNSIGNED_INT index type and the provided count', () => {
    const { gl, calls } = createStubGL()
    const canvas = { getContext: () => gl } as unknown as HTMLCanvasElement
    const r = new WebGLTileRenderer(canvas)

    const mesh = buildTerrainMesh({
      elevation: makeFlatDEM(8, 100),
      demSize: 8,
      tileSize: 256,
      resolution: 4,
    })
    const drawn = r.drawTerrain(mesh.positions, mesh.indices, [0.5, 0.6, 0.7, 1], 1)
    expect(drawn).toBe(mesh.indexCount)

    const draw = calls.drawElements.at(-1)!
    expect(draw.mode).toBe(gl.TRIANGLES)
    expect(draw.count).toBe(mesh.indexCount)
    expect(draw.type).toBe(gl.UNSIGNED_INT)

    // Element array buffer must have been uploaded.
    const elemUpload = calls.bufferData.find((entry: any[]) => entry[0] === gl.ELEMENT_ARRAY_BUFFER)
    expect(elemUpload).toBeDefined()
    expect(elemUpload![1]).toBe(mesh.indices.byteLength)
  })

  test('passes projection matrix, color and opacity to uniforms', () => {
    const { gl, calls } = createStubGL()
    const canvas = { getContext: () => gl } as unknown as HTMLCanvasElement
    const r = new WebGLTileRenderer(canvas)

    const mesh = buildTerrainMesh({
      elevation: makeFlatDEM(4, 0),
      demSize: 4,
      tileSize: 256,
      resolution: 2,
    })
    const proj = new Float32Array(16)
    proj[0] = 1
    r.drawTerrain(mesh.positions, mesh.indices, [0.1, 0.2, 0.3, 1], 0.8, proj)

    expect(calls.uniformMatrix4fv.length).toBeGreaterThan(0)
    expect(calls.uniform4f.length).toBeGreaterThan(0)
    expect(calls.uniform1f.length).toBeGreaterThan(0)
    const lastColor = calls.uniform4f.at(-1)!
    expect(lastColor[1]).toBeCloseTo(0.1, 5)
    expect(lastColor[2]).toBeCloseTo(0.2, 5)
    expect(lastColor[3]).toBeCloseTo(0.3, 5)
    expect(calls.uniform1f.at(-1)![1]).toBeCloseTo(0.8, 5)
  })
})
