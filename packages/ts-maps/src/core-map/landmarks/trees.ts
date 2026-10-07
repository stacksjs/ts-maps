import type { BuildingMesh, Vec3 } from '../renderer/webgl/BuildingOverlay'
import { MeshWriter } from '../renderer/webgl/BuildingOverlay'
import { sceneChanged, sceneOf } from './scene'

/**
 * Trees, standing in the woods and parks a basemap already has.
 *
 * Apple Maps plants low-poly trees across its cities' parks once the map
 * tilts. Basemap tiles do not have the trees themselves, but they do have
 * the woods: `landcover` class `wood` in OpenMapTiles, `kind: forest` in
 * Protomaps and Shortbread. Those are planted on a jittered grid (the same
 * trees in the same places every time, and none twice across a tile edge),
 * and a source that carries single trees (OpenStreetMap `natural=tree`)
 * gets those as well.
 *
 * Each tile's trees are baked into one mesh in the building pass: a trunk
 * and a crown of a dozen triangles each, a few greens. They come in as the
 * map tilts past `minPitch` and the zoom passes `minZoom`, and stop short of
 * the haze, where they would be a pixel each.
 */
export interface TreesOptions {
  /** Metres between trees in a wood. Default 9. */
  spacing?: number
  /**
   * Most trees a tile plants. A tile that could hold more (zoomed out, it
   * covers more ground) plants each wood more thinly, at the same rate
   * everywhere at that zoom so no tile edge shows. Default 3000.
   */
  maxPerTile?: number
  /** Default 15. */
  minZoom?: number
  /** Degrees of tilt before trees appear. Default 20. */
  minPitch?: number
  /** Crown colours, picked between per tree. */
  colors?: string[]
  /** Metres. Default [7, 14]. */
  height?: [number, number]
  /**
   * Which features are woods to plant and which are single trees. The
   * default knows OpenMapTiles, Protomaps, Shortbread and Mapbox Streets.
   */
  match?: (layer: string, properties: Record<string, unknown>) => 'wood' | 'tree' | undefined
}

const WOOD = new Set(['wood', 'forest', 'woodland'])
const WOOD_LAYERS = new Set(['landcover', 'landuse', 'land', 'natural', 'park', 'landuse_overlay'])

/** The default `match`. */
export function treeKind(layer: string, properties: Record<string, unknown>): 'wood' | 'tree' | undefined {
  const kind = String(properties.class ?? properties.kind ?? properties.subclass ?? properties.natural ?? properties.landuse ?? '')
  if (kind === 'tree' || properties.natural === 'tree')
    return 'tree'
  if (WOOD_LAYERS.has(layer) && (WOOD.has(kind) || WOOD.has(String(properties.subclass ?? ''))))
    return 'wood'
  return undefined
}

export interface TreeFeature {
  kind: 'wood' | 'tree'
  /** Rings for a wood, one point for a tree, in tile pixels. */
  geometry: Array<Array<{ x: number, y: number }>>
}

export interface TreeTile {
  x: number
  y: number
  z: number
  size: number
  /** Metres to a pixel of this tile. */
  mpp: number
}

/** A number in [0, 1) for a grid cell and a salt: the same every time. */
function hash(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27D4EB2D) ^ Math.imul(y | 0, 0x165667B1) ^ Math.imul(salt, 0x9E3779B9)
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function inside(rings: Array<Array<{ x: number, y: number }>>, x: number, y: number): boolean {
  // Even–odd over every ring: holes are clearings.
  let hit = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!
      const b = ring[j]!
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
        hit = !hit
    }
  }
  return hit
}

/** Where a tile's trees stand, in its pixels, with a seed each for its size and colour. */
export function plantTrees(features: TreeFeature[], tile: TreeTile, options: TreesOptions = {}): Array<{ x: number, y: number, seed: number }> {
  const spacing = options.spacing ?? 9
  const cap = options.maxPerTile ?? 3000
  const cells = Math.max(1, Math.round((tile.size * tile.mpp) / spacing))
  const cell = tile.size / cells
  // The share of cells planted: all of them, unless a tile of solid forest
  // would be over the budget.
  const keep = Math.min(1, cap / (cells * cells))
  const planted: Array<{ x: number, y: number, seed: number }> = []
  for (const feature of features) {
    if (feature.kind === 'tree') {
      const p = feature.geometry[0]?.[0]
      if (p && p.x >= 0 && p.y >= 0 && p.x < tile.size && p.y < tile.size)
        planted.push({ x: p.x, y: p.y, seed: hash(Math.round(p.x * 16), Math.round(p.y * 16), 7) })
      continue
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const ring of feature.geometry) {
      for (const p of ring) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
    }
    const i0 = Math.max(0, Math.floor(minX / cell))
    const i1 = Math.min(cells - 1, Math.floor(maxX / cell))
    const j0 = Math.max(0, Math.floor(minY / cell))
    const j1 = Math.min(cells - 1, Math.floor(maxY / cell))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        // Cells numbered across the world, so a wood over a tile edge is
        // planted the same from either side.
        const gx = tile.x * cells + i
        const gy = tile.y * cells + j
        if (keep < 1 && hash(gx, gy, 4) >= keep)
          continue
        const x = (i + 0.15 + 0.7 * hash(gx, gy, 1)) * cell
        const y = (j + 0.15 + 0.7 * hash(gx, gy, 2)) * cell
        if (inside(feature.geometry, x, y))
          planted.push({ x, y, seed: hash(gx, gy, 3) })
      }
    }
  }
  return planted
}

const CROWN = ['#5b8c3a', '#4e7f34', '#6a9a46', '#46732f']
const TRUNK: [number, number, number, number] = [0.42, 0.31, 0.21, 1]

function rgba(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = Number.parseInt(full.slice(0, 6), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
}

/** A tile's trees as building geometry: a trunk and a crown each. */
export function buildTreeMesh(trees: Array<{ x: number, y: number, seed: number }>, tile: TreeTile, options: TreesOptions = {}): BuildingMesh {
  const out = new MeshWriter(Math.max(64, trees.length * 54))
  const colors = (options.colors?.length ? options.colors : CROWN).map(rgba)
  const [low, high] = options.height ?? [7, 14]
  const mpp = tile.mpp
  const SIDES = 6
  for (const tree of trees) {
    const height = low + (high - low) * tree.seed
    const radius = (height * 0.3) / mpp
    const trunk = (height * 0.05) / mpp
    const crownFoot = height * 0.3
    const crownBelly = height * 0.6
    const turn = tree.seed * Math.PI * 2
    const ring = (r: number, h: number, n: number): Vec3[] => Array.from({ length: n }, (_, k) => {
      const a = turn + (k / n) * Math.PI * 2
      return [tree.x + Math.cos(a) * r, tree.y + Math.sin(a) * r, h]
    })

    // Trunk: three sides up to the crown.
    out.color(TRUNK)
    const foot = ring(trunk, 0, 3)
    const neck = ring(trunk, crownFoot, 3)
    for (let k = 0; k < 3; k++) {
      const n = (k + 1) % 3
      // Pixels run south, so counter-clockwise from outside is k+1 first.
      out.face(foot[k]!, neck[n]!, foot[n]!, mpp)
      out.face(foot[k]!, neck[k]!, neck[n]!, mpp)
    }

    // Crown: a six-sided double cone, wide at its belly.
    const shade = colors[Math.floor(tree.seed * 7919) % colors.length]!
    const vary = 0.9 + 0.2 * ((tree.seed * 104729) % 1)
    out.color([shade[0] * vary, shade[1] * vary, shade[2] * vary, 1])
    const belly = ring(radius, crownBelly, SIDES)
    const bottom: Vec3 = [tree.x, tree.y, crownFoot]
    const top: Vec3 = [tree.x, tree.y, height]
    for (let k = 0; k < SIDES; k++) {
      const n = (k + 1) % SIDES
      out.face(belly[k]!, top, belly[n]!, mpp)
      out.face(belly[k]!, belly[n]!, bottom, mpp)
    }
  }
  return out.finish()
}

/** Trees on a map: one per map, turned on with `addTo`. */
export class Trees {
  options: TreesOptions
  _map?: any

  constructor(options: TreesOptions = {}) {
    this.options = { ...options }
  }

  addTo(map: any): this {
    const scene = sceneOf(map)
    if (scene.trees && scene.trees !== this)
      scene.trees.remove()
    this._map = map
    scene.trees = this
    sceneChanged(map, true)
    return this
  }

  remove(): this {
    const map = this._map
    if (!map)
      return this
    const scene = sceneOf(map)
    if (scene.trees === this)
      scene.trees = undefined
    this._map = undefined
    sceneChanged(map, true)
    return this
  }

  setOptions(options: TreesOptions): this {
    this.options = { ...this.options, ...options }
    sceneChanged(this._map, true)
    return this
  }

  /** How much of the trees to show for a zoom and tilt: 0 hidden, 1 all there. */
  visibility(zoom: number, pitch: number): number {
    const minZoom = this.options.minZoom ?? 15
    const minPitch = this.options.minPitch ?? 20
    if (zoom < minZoom || pitch < minPitch)
      return 0
    // Faded in over the first ten degrees of tilt past the threshold.
    return Math.min(1, (pitch - minPitch) / 10 + 0.1)
  }
}

export function trees(options: TreesOptions = {}): Trees {
  return new Trees(options)
}
