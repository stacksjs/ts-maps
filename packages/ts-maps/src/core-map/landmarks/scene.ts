import type { Landmark } from './Landmark'
import type { Trees } from './trees'

/**
 * What a map stands in 3D besides its buildings: landmarks and trees.
 *
 * They are drawn in the building pass, through the same camera and depth
 * buffer as the extruded buildings, so a tower hides the block behind it and
 * labels behind a landmark are hidden as they are behind a building. One
 * vector tile layer draws them: the first one on the map that reads from a
 * tile server (the basemap, in a styled map), which is also where trees come
 * from.
 */
export interface Scene3D {
  landmarks: Set<Landmark>
  trees?: Trees
  /**
   * Ground cleared of buildings, `[west, south, east, north]`, by whoever
   * cleared it: an indoor venue showing its plan, where the building's
   * extruded shape would stand over it.
   */
  cleared?: Map<unknown, [number, number, number, number]>
}

export function sceneOf(map: any): Scene3D {
  map._scene3d ??= { landmarks: new Set() }
  return map._scene3d
}

/** Whether anything is standing in the scene. */
export function sceneBusy(map: any): boolean {
  const scene = map?._scene3d as Scene3D | undefined
  return !!scene && (scene.landmarks.size > 0 || !!scene.trees)
}

/**
 * Tell the layers. `rebuild` when tiles' meshes change too: a landmark that
 * replaces the building under it, or trees turned on.
 */
export function sceneChanged(map: any, rebuild: boolean): void {
  map?.fire?.('scene3dchange', { rebuild })
}

/** The layer drawing the scene: the first vector tile layer with a tile server. */
export function isSceneHost(map: any, layer: any): boolean {
  for (const candidate of Object.values(map?._layers ?? {}) as any[]) {
    if (typeof candidate?._buildingsFor === 'function' && !candidate.options?.localSource)
      return candidate === layer
  }
  return false
}

/**
 * Clear the buildings from `bounds`, or give the ground back with `null`.
 * Rebuilds the buildings only when something changed.
 */
export function clearGround(map: any, owner: unknown, bounds: [number, number, number, number] | null): void {
  if (!map)
    return
  const scene = sceneOf(map)
  const had = scene.cleared?.get(owner)
  if (bounds) {
    if (had && had.every((v, i) => v === bounds[i]))
      return
    scene.cleared ??= new Map()
    scene.cleared.set(owner, bounds)
  }
  else {
    if (!had)
      return
    scene.cleared!.delete(owner)
  }
  sceneChanged(map, true)
}
