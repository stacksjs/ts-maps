// Translating a style-spec `heatmap` layer into a `HeatmapLayer`.
//
// The two describe the same picture in different terms. The spec expresses the
// colour ramp as an `interpolate` expression over `heatmap-density` — a value
// from 0 to 1 — while `HeatmapLayer` takes a table of stops. Sampling the
// expression at a handful of densities converts one to the other, and works
// for any ramp a style can write rather than only the shapes we anticipated.
//
// Where a property has no equivalent it is left alone rather than
// approximated: `heatmap-weight` is per feature and is read from the data,
// while `heatmap-intensity` scales the whole field.

import type { HeatmapPoint } from '../layer/HeatmapLayer'
import { compile, isExpression } from '../style-spec/expressions'

/** Sample a `heatmap-color` ramp into the stop table the layer wants. */
export function heatmapGradient(color: unknown, stops = 8): Record<number, string> | undefined {
  if (color === undefined || color === null)
    return undefined

  // A plain colour is a flat ramp, which is legal though unusual.
  if (typeof color === 'string')
    return { 0: color, 1: color }

  if (!isExpression(color))
    return undefined

  let compiled
  try {
    compiled = compile(color, 'value', [])
  }
  catch {
    // A ramp that will not compile is the style's problem to fix; drawing the
    // default gradient beats drawing nothing.
    return undefined
  }

  const gradient: Record<number, string> = {}
  for (let i = 0; i <= stops; i++) {
    const density = i / stops
    try {
      const value = compiled.evaluate({ zoom: 0, heatmapDensity: density })
      if (typeof value === 'string')
        gradient[density] = value
    }
    catch {
      // One bad stop should not lose the rest of the ramp.
    }
  }

  return Object.keys(gradient).length > 1 ? gradient : undefined
}

/**
 * Pull point positions out of GeoJSON.
 *
 * Only points carry meaning for a density field. A line or polygon in the
 * source is skipped rather than reduced to its centroid, which would put
 * weight where the data does not claim any.
 */
export function heatmapPoints(data: unknown, weightKey?: string): HeatmapPoint[] {
  const features: any[] = (data as any)?.type === 'FeatureCollection'
    ? ((data as any).features ?? [])
    : Array.isArray(data) ? data : data ? [data] : []

  const points: HeatmapPoint[] = []
  for (const feature of features) {
    const geometry = feature?.geometry ?? feature
    if (!geometry)
      continue

    const weight = weightKey ? Number(feature?.properties?.[weightKey]) : undefined

    if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
      points.push({
        lng: geometry.coordinates[0],
        lat: geometry.coordinates[1],
        weight: Number.isFinite(weight) ? weight : undefined,
      })
    }
    else if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) {
      for (const coordinate of geometry.coordinates) {
        points.push({
          lng: coordinate[0],
          lat: coordinate[1],
          weight: Number.isFinite(weight) ? weight : undefined,
        })
      }
    }
  }

  return points
}

/** The property name a simple `["get", k]` weight reads, if that is what it is. */
export function heatmapWeightKey(weight: unknown): string | undefined {
  if (Array.isArray(weight) && weight[0] === 'get' && typeof weight[1] === 'string')
    return weight[1]
  return undefined
}
