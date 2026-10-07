import type { LatLng, LatLngLike } from '../geo/LatLng'
import type { BuildingCamera, BuildingDraw, BuildingMesh } from '../renderer/webgl/BuildingOverlay'
import type { Occluder, OcclusionSource } from '../symbols/BuildingOcclusion'
import type { LandmarkModel, LoadModelOptions, ModelSource } from './gltf'
import { toLatLng } from '../geo/LatLng'
import { buildingMatrix, MeshWriter } from '../renderer/webgl/BuildingOverlay'
import { OccluderIndex } from '../symbols/BuildingOcclusion'
import { loadModel } from './gltf'
import { sceneChanged, sceneOf } from './scene'

/**
 * A hand-made model of a building, standing where the building is.
 *
 * Apple Maps swaps the extruded box of a famous building for a model of it:
 * the Transamerica Pyramid, Coit Tower, the Ferry Building. `landmark()`
 * does the same with a glTF model placed by coordinate. It is drawn in the
 * building pass (lit, fogged and depth-tested with the buildings) and hides
 * the labels behind it. By default the extruded building it stands on is
 * left out, so the model is not drawn through a box.
 */
export interface LandmarkOptions extends LoadModelOptions {
  /** A `.glb` or `.gltf` URL, a `.glb`'s bytes, or a parsed glTF. */
  model: ModelSource
  /** Where the model's origin stands. */
  position: LatLngLike
  /** Metres above the ground. Default 0. */
  altitude?: number
  /** Degrees clockwise. A glTF model faces south at 0. */
  rotation?: number
  /** Default 1: glTF is in metres. */
  scale?: number
  /** Leave out the extruded building under it. Default true. */
  replace?: boolean
  /** Hidden zoomed out further than this. Default 15. */
  minZoom?: number
  opacity?: number
}

const EARTH = 40075016.686

export class Landmark {
  options: LandmarkOptions
  model?: LandmarkModel
  mesh?: BuildingMesh
  position: LatLng
  error?: unknown
  _map?: any
  _loading: Promise<LandmarkModel>
  /** The footprint, for hiding labels: metres from its own corner. */
  _occluders?: { index: OccluderIndex, minX: number, minY: number }

  constructor(options: LandmarkOptions) {
    // Options left undefined keep their defaults, as a binding passes them.
    const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) as unknown as LandmarkOptions
    this.options = { altitude: 0, rotation: 0, scale: 1, replace: true, minZoom: 15, opacity: 1, ...given }
    this.position = toLatLng(options.position)
    this._loading = loadModel(options.model, options)
    this._loading.then((model) => {
      this.model = model
      this._build()
      sceneChanged(this._map, !!this.options.replace)
    }, (error) => {
      this.error = error
      console.warn('[ts-maps] landmark model failed to load:', error)
    })
  }

  /** Resolves once the model is read. */
  async ready(): Promise<this> {
    await this._loading
    return this
  }

  addTo(map: any): this {
    if (this._map)
      this.remove()
    this._map = map
    sceneOf(map).landmarks.add(this)
    sceneChanged(map, !!this.options.replace)
    return this
  }

  remove(): this {
    const map = this._map
    if (!map)
      return this
    sceneOf(map).landmarks.delete(this)
    this._map = undefined
    sceneChanged(map, !!this.options.replace)
    return this
  }

  setPosition(position: LatLngLike): this {
    this.position = toLatLng(position)
    sceneChanged(this._map, !!this.options.replace)
    return this
  }

  setRotation(degrees: number): this {
    this.options.rotation = degrees
    this._build()
    sceneChanged(this._map, false)
    return this
  }

  setScale(scale: number): this {
    this.options.scale = scale
    this._build()
    sceneChanged(this._map, false)
    return this
  }

  setAltitude(metres: number): this {
    this.options.altitude = metres
    this._build()
    sceneChanged(this._map, false)
    return this
  }

  setOpacity(opacity: number): this {
    this.options.opacity = opacity
    sceneChanged(this._map, false)
    return this
  }

  /**
   * Bring the landmark into line with a declarative description: what
   * bindings call as props change. A different `model` needs a new landmark.
   */
  sync(target: Partial<Pick<LandmarkOptions, 'position' | 'rotation' | 'scale' | 'altitude' | 'opacity'>>): this {
    if (target.position !== undefined) {
      const next = toLatLng(target.position)
      if (!next.equals(this.position))
        this.setPosition(next)
    }
    if (target.rotation !== undefined && target.rotation !== this.options.rotation)
      this.setRotation(target.rotation)
    if (target.scale !== undefined && target.scale !== this.options.scale)
      this.setScale(target.scale)
    if (target.altitude !== undefined && target.altitude !== this.options.altitude)
      this.setAltitude(target.altitude)
    if (target.opacity !== undefined && target.opacity !== this.options.opacity)
      this.setOpacity(target.opacity)
    return this
  }

  /** The model turned, scaled and lifted, as building geometry in metres from its origin. */
  _build(): void {
    const model = this.model
    if (!model)
      return
    const turn = ((this.options.rotation ?? 0) * Math.PI) / 180
    const cos = Math.cos(turn)
    const sin = Math.sin(turn)
    const scale = this.options.scale ?? 1
    const lift = this.options.altitude ?? 0
    const out = new MeshWriter(Math.max(64, model.count))
    const footprint: Array<[number, number]> = []
    let top = -Infinity
    let base = Infinity
    for (let i = 0; i < model.count; i++) {
      const x = model.positions[i * 3]! * scale
      const y = model.positions[i * 3 + 1]! * scale
      const h = model.positions[i * 3 + 2]! * scale + lift
      // Clockwise on the map: east turns towards south.
      const ex = x * cos - y * sin
      const sy = x * sin + y * cos
      const nx = model.normals[i * 3]!
      const ny = model.normals[i * 3 + 1]!
      out.color([model.colors[i * 4]!, model.colors[i * 4 + 1]!, model.colors[i * 4 + 2]!, model.colors[i * 4 + 3]!])
      out.vertex(ex, sy, h, Math.round((nx * cos - ny * sin) * 127), Math.round((nx * sin + ny * cos) * 127), 255)
      footprint.push([ex, sy])
      top = Math.max(top, h)
      base = Math.min(base, h)
    }
    this.mesh = out.finish()

    let hull = convexHull(footprint)
    if (hull.length < 3 && footprint.length) {
      // A model with no footprint to speak of (a mast, a sign): its box, half a metre out.
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
      for (const [x, y] of footprint) {
        x0 = Math.min(x0, x - 0.5)
        y0 = Math.min(y0, y - 0.5)
        x1 = Math.max(x1, x + 0.5)
        y1 = Math.max(y1, y + 0.5)
      }
      hull = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    }
    if (hull.length >= 3) {
      const minX = Math.min(...hull.map(p => p[0]))
      const minY = Math.min(...hull.map(p => p[1]))
      const ring = new Float64Array(hull.length * 2)
      hull.forEach(([x, y], n) => {
        ring[n * 2] = x - minX
        ring[n * 2 + 1] = y - minY
      })
      const maxX = Math.max(...hull.map(p => p[0])) - minX
      const maxY = Math.max(...hull.map(p => p[1])) - minY
      const occluder: Occluder = { ring, minX: 0, minY: 0, maxX, maxY, top, base }
      this._occluders = { index: new OccluderIndex([occluder], Math.max(maxX, maxY, 1)), minX, minY }
    }
  }
}

export function landmark(options: LandmarkOptions): Landmark {
  return new Landmark(options)
}

/** Pixels per metre at a latitude, for a world `worldSize` pixels round. */
export function pixelsPerMetre(worldSize: number, lat: number): number {
  return worldSize / (EARTH * Math.cos((lat * Math.PI) / 180))
}

/**
 * This frame's landmark draws and their label occlusion, for the camera the
 * building pass uses. Landmarks past `fogEnd` (camera distance, pixels) or
 * below their zoom are left out.
 */
export function landmarkDraws(map: any, landmarks: Iterable<Landmark>, camera: BuildingCamera, fogEnd: number): { draws: BuildingDraw[], occlusion: OcclusionSource[] } {
  const draws: BuildingDraw[] = []
  const occlusion: OcclusionSource[] = []
  const zoom = map.getZoom()
  const origin = map.getPixelOrigin()
  const crs = map.options?.crs
  const worldSize = crs?.scale ? crs.scale(zoom) : 256 * 2 ** zoom
  for (const item of landmarks) {
    if (!item.mesh?.count || zoom < (item.options.minZoom ?? 15))
      continue
    const opacity = Math.max(0, Math.min(1, item.options.opacity ?? 1))
    if (!opacity)
      continue
    // In double precision, as for tiles: layer pixels run to eight digits.
    const at = map.project(item.position, zoom)
    const anchor: [number, number] = [at.x - origin.x, at.y - origin.y]
    const ppm = pixelsPerMetre(worldSize, item.position.lat)
    const matrix = buildingMatrix(camera, ppm, anchor)
    // w at the model's origin: its distance from the camera.
    if (matrix[15]! > fogEnd)
      continue
    draws.push({ key: item, mesh: item.mesh, matrix, heightScale: ppm, opacity })
    if (item._occluders && opacity >= 0.5) {
      const { index, minX, minY } = item._occluders
      occlusion.push({ index, scale: ppm, origin: [anchor[0] + minX * ppm, anchor[1] + minY * ppm], pxPerMetre: ppm })
    }
  }
  return { draws, occlusion }
}

/**
 * Where landmarks that replace their building stand, in a tile's pixels: the
 * extruded footprints containing one are left out of the tile's mesh.
 */
export function replacedPoints(map: any, landmarks: Iterable<Landmark>, tile: { x: number, y: number, z: number }, tileSize: number): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (const item of landmarks) {
    if (!item.options.replace || !item.model)
      continue
    const p = map.project(item.position, tile.z)
    const x = p.x - tile.x * tileSize
    const y = p.y - tile.y * tileSize
    if (x >= -tileSize * 0.1 && y >= -tileSize * 0.1 && x <= tileSize * 1.1 && y <= tileSize * 1.1)
      points.push([x, y])
  }
  return points
}

/** Whether (x, y) is inside a ring of points. */
export function insideRing(ring: ReadonlyArray<{ x: number, y: number }>, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside
  }
  return inside
}

/** Andrew's monotone chain. */
function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length < 3)
    return sorted
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Array<[number, number]> = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Array<[number, number]> = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0)
      upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}
