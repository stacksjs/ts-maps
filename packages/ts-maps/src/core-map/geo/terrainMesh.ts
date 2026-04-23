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
