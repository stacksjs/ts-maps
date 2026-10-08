// Terrain mesh generation. Given a DEM tile's decoded elevation grid, we
// build a regular-grid mesh that can be warped in 3D by a WebGL program.
//
// The mesh lives in tile-local pixel space:
//   `x ∈ [0, tileSize]` — east-west within the tile
//   `y ∈ [0, tileSize]` — north-south (top-down)
//   `z` — elevation in metres × `exaggeration`, converted to tile units so
//         height and lateral distance share a single coordinate system.
//
// The caller supplies a `unitsPerMeter` conversion (derived from the tile's
// zoom level and latitude) so the result drops straight into the tile's
// existing projection matrix.

import { sampleElevationBilinear } from './elevation'

export interface TerrainMeshOptions {
  /** Flat row-major elevation in metres, length `demSize * demSize`. */
  elevation: Float32Array
  /** Side length of the DEM grid in samples (typical: 256 or 512). */
  demSize: number
  /** Target tile side length in render units (typically = DEM tile size). */
  tileSize?: number
  /** Vertices per side = `resolution + 1`. Default 32 (→ 1089 vertices). */
  resolution?: number
  /** Vertical exaggeration factor applied to every z sample. Default 1. */
  exaggeration?: number
  /** Metres → z-axis render units. Default `1` (raw metres). */
  unitsPerMeter?: number
}

export interface TerrainMesh {
  /** Interleaved `[x, y, z, nx, ny, nz]` per vertex. */
  positions: Float32Array
  /** Index buffer — 2 triangles per cell, CCW when viewed from +Z. */
  indices: Uint32Array
  /** Number of vertices (= `(resolution + 1) ^ 2`). */
  vertexCount: number
  /** Number of indices (= `resolution^2 * 6`). */
  indexCount: number
  /** Copy of the resolution used (vertices per side = resolution + 1). */
  resolution: number
}

/**
 * Builds a terrain mesh for a single DEM tile. Pure function — no DOM /
 * WebGL calls. Returns typed arrays ready to feed to
 * `WebGLTileRenderer.drawTerrain`.
 */
export function buildTerrainMesh(opts: TerrainMeshOptions): TerrainMesh {
  const demSize = opts.demSize
  if (demSize < 2)
    throw new RangeError('demSize must be >= 2')
  if (opts.elevation.length < demSize * demSize)
    throw new RangeError(`elevation array is too small for demSize=${demSize}`)

  const tileSize = opts.tileSize ?? demSize
  const resolution = Math.max(1, Math.floor(opts.resolution ?? 32))
  const exaggeration = opts.exaggeration ?? 1
  const upm = opts.unitsPerMeter ?? 1

  const verticesPerSide = resolution + 1
  const vertexCount = verticesPerSide * verticesPerSide
  const positions = new Float32Array(vertexCount * 6)

  // Sample grid over [0, tileSize] inclusive on both axes.
  const step = tileSize / resolution
  const demStep = (demSize - 1) / resolution

  // Pass 1: positions.
  for (let j = 0; j < verticesPerSide; j++) {
    const y = j * step
    const dv = j * demStep
    for (let i = 0; i < verticesPerSide; i++) {
      const x = i * step
      const du = i * demStep
      const metres = sampleElevationBilinear(opts.elevation, demSize, du, dv)
      const z = metres * exaggeration * upm
      const vi = (j * verticesPerSide + i) * 6
      positions[vi] = x
      positions[vi + 1] = y
      positions[vi + 2] = z
      // Normals filled in pass 2.
      positions[vi + 3] = 0
      positions[vi + 4] = 0
      positions[vi + 5] = 1
    }
  }

  // Pass 2: central-difference normals. Gradient in tile units; normal is
  // `normalize(-dz/dx, -dz/dy, 1)`.
  for (let j = 0; j < verticesPerSide; j++) {
    for (let i = 0; i < verticesPerSide; i++) {
      const im = Math.max(0, i - 1)
      const ip = Math.min(verticesPerSide - 1, i + 1)
      const jm = Math.max(0, j - 1)
      const jp = Math.min(verticesPerSide - 1, j + 1)
      const zL = positions[(j * verticesPerSide + im) * 6 + 2]!
      const zR = positions[(j * verticesPerSide + ip) * 6 + 2]!
      const zU = positions[(jm * verticesPerSide + i) * 6 + 2]!
      const zD = positions[(jp * verticesPerSide + i) * 6 + 2]!
      const dx = (ip - im) * step || 1
      const dy = (jp - jm) * step || 1
      const nx = -(zR - zL) / dx
      const ny = -(zD - zU) / dy
      const nz = 1
      const len = Math.hypot(nx, ny, nz) || 1
      const base = (j * verticesPerSide + i) * 6
      positions[base + 3] = nx / len
      positions[base + 4] = ny / len
      positions[base + 5] = nz / len
    }
  }

  // Indices — two triangles per cell.
  //   (i,j)---(i+1,j)
  //     |  \     |
  //   (i,j+1)-(i+1,j+1)
  const indices = new Uint32Array(resolution * resolution * 6)
  let idx = 0
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const a = j * verticesPerSide + i
      const b = a + 1
      const c = a + verticesPerSide
      const d = c + 1
      indices[idx++] = a
      indices[idx++] = c
      indices[idx++] = b
      indices[idx++] = b
      indices[idx++] = c
      indices[idx++] = d
    }
  }

  return {
    positions,
    indices,
    vertexCount,
    indexCount: indices.length,
    resolution,
  }
}

/**
 * The shape the map's 3D terrain draws each ground patch with: a square grid
 * of `resolution` cells a side, plus a skirt.
 *
 * Heights are not baked in. The grid is the same for every patch, so it is
 * built once and shared; each patch brings its own heights, one per vertex,
 * read from the DEM where that vertex falls (`TerrainView`).
 *
 * The skirt is a strip hanging down from every edge. Neighbouring patches at
 * different levels of detail do not share their edge vertices, so a slope can
 * open a hairline crack between them; the skirt closes it with ground of the
 * same picture.
 */
export interface TerrainGrid {
  /**
   * Per vertex, `u, v, skirt`: where in the patch it is, 0–1 east and south,
   * and 1 for a skirt vertex, which is pulled down below its edge.
   */
  vertices: Float32Array
  /**
   * For each vertex, which grid vertex's height it takes — itself, or for a
   * skirt vertex the edge vertex it hangs from. Grid vertices come first,
   * row by row, so a patch's heights are read for those alone.
   */
  heightIndex: Uint32Array
  /** Triangles; 16-bit, so it draws without a WebGL extension. */
  indices: Uint16Array
  /** Vertices per side of the grid: `resolution + 1`. */
  side: number
  vertexCount: number
  indexCount: number
}

export function buildTerrainGrid(resolution: number): TerrainGrid {
  const n = Math.max(1, Math.floor(resolution))
  const side = n + 1
  const gridCount = side * side
  // Each of the four edges' vertices again, hanging below.
  const skirtCount = 4 * side
  const vertexCount = gridCount + skirtCount
  if (vertexCount > 65536)
    throw new RangeError(`resolution ${n} needs more vertices than 16-bit indices reach`)

  const vertices = new Float32Array(vertexCount * 3)
  const heightIndex = new Uint32Array(vertexCount)
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const v = j * side + i
      vertices[v * 3] = i / n
      vertices[v * 3 + 1] = j / n
      heightIndex[v] = v
    }
  }

  // The four edges, each walked so its triangles face the same way as the
  // grid's: north west to east, east north to south, south east to west,
  // west south to north.
  const edges: number[][] = [[], [], [], []]
  for (let k = 0; k < side; k++) {
    edges[0]!.push(k)
    edges[1]!.push(k * side + n)
    edges[2]!.push(n * side + (n - k))
    edges[3]!.push((n - k) * side)
  }

  const indices = new Uint16Array(n * n * 6 + 4 * n * 6)
  let idx = 0
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * side + i
      const b = a + 1
      const c = a + side
      const d = c + 1
      indices[idx++] = a
      indices[idx++] = c
      indices[idx++] = b
      indices[idx++] = b
      indices[idx++] = c
      indices[idx++] = d
    }
  }

  let next = gridCount
  for (const edge of edges) {
    const first = next
    for (const top of edge) {
      vertices[next * 3] = vertices[top * 3]!
      vertices[next * 3 + 1] = vertices[top * 3 + 1]!
      vertices[next * 3 + 2] = 1
      heightIndex[next] = top
      next++
    }
    for (let k = 0; k < n; k++) {
      const a = edge[k]!
      const b = edge[k + 1]!
      const c = first + k
      const d = first + k + 1
      indices[idx++] = a
      indices[idx++] = c
      indices[idx++] = b
      indices[idx++] = b
      indices[idx++] = c
      indices[idx++] = d
    }
  }

  return { vertices, heightIndex, indices, side, vertexCount, indexCount: indices.length }
}
