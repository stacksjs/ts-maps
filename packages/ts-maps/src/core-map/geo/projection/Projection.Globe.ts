import type { ProjectionLike } from './Projection.LonLat'
import { Bounds } from '../../geometry/Bounds'
import { Point } from '../../geometry/Point'
import { LatLng } from '../LatLng'
import { SphericalMercator } from './Projection.SphericalMercator'

/**
 * Globe projection — renders tiles on a sphere at low zoom, transitioning
 * to flat Mercator around zoom 5.5 to match the common convention.
 *
 * The 2D `project`/`unproject` pair returns the Mercator projection for
 * compatibility with the rest of the pipeline (tile loading, pixel math).
 * The sphere warp is a vertex-shader effect and lives in the renderer —
 * this module exposes the helpers that shader needs: projection to 3D
 * world coords on the unit sphere, and a `globeToMercatorMix(zoom)`
 * easing that selects how much to warp.
 *
 * Keep everything zero-dep and pure-math so it composes with the WebGL
 * renderer without having to import DOM types.
 */

export interface GlobeVec3 {
  x: number
  y: number
  z: number
}

export interface GlobeProjection extends ProjectionLike {
  R: number
  GLOBE_START_ZOOM: number
  GLOBE_END_ZOOM: number
  toSphere: (latlng: any) => GlobeVec3
  fromSphere: (v: GlobeVec3) => LatLng
  globeToMercatorMix: (zoom: number) => number
}

const earthRadius = SphericalMercator.R

// Standard: longitude around Y axis, latitude tilts around the X axis.
// Coordinates are on a unit sphere so the renderer can scale to whatever
// world size it uses. +Z points toward lat=0, lng=0; +Y is north.
function latLngToUnitSphere(latlng: any): GlobeVec3 {
  const ll = new LatLng(latlng)
  const phi = ll.lat * Math.PI / 180
  const lambda = ll.lng * Math.PI / 180
  const cosPhi = Math.cos(phi)
  return {
    x: cosPhi * Math.sin(lambda),
    y: Math.sin(phi),
    z: cosPhi * Math.cos(lambda),
  }
}

function unitSphereToLatLng(v: GlobeVec3): LatLng {
  const r = Math.hypot(v.x, v.y, v.z) || 1
  const phi = Math.asin(Math.max(-1, Math.min(1, v.y / r)))
  const lambda = Math.atan2(v.x, v.z)
  return new LatLng(phi * 180 / Math.PI, lambda * 180 / Math.PI)
}

// Smoothly transition between globe view (low zoom) and Mercator (high zoom).
// Returns `1` = fully globe, `0` = fully flat Mercator. Linear blend with a
// cubic smoothstep between the two break zooms.
function globeMix(zoom: number, start: number, end: number): number {
  if (zoom <= start) return 1
  if (zoom >= end) return 0
  const t = (zoom - start) / (end - start)
  // 1 - smoothstep
  return 1 - t * t * (3 - 2 * t)
}

export const Globe: GlobeProjection = {
  R: earthRadius,

  // Default crossover window — matches Mapbox GL JS v3 behavior.
  GLOBE_START_ZOOM: 5.5,
  GLOBE_END_ZOOM: 6.0,

  // The 2D projection funnels through the same Mercator as tile loading so
  // every downstream consumer (tile grid, pixel math, label placement)
  // stays compatible. The spherical warp happens in the renderer.
  project(latlng: any): Point {
    return SphericalMercator.project(latlng)
  },
  unproject(point: any): LatLng {
    return SphericalMercator.unproject(point)
  },

  bounds: SphericalMercator.bounds as Bounds,

  toSphere: latLngToUnitSphere,
  fromSphere: unitSphereToLatLng,
  globeToMercatorMix(zoom: number): number {
    return globeMix(zoom, this.GLOBE_START_ZOOM, this.GLOBE_END_ZOOM)
  },
}
