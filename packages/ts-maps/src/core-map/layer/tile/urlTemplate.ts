// Shared tile URL template helpers. Used by TileLayer and VectorTileMapLayer.
// Mirrors the substitution pattern from `TileLayer.getTileUrl`: `{z}`, `{x}`,
// `{y}`, `{s}` (subdomain), plus inverted-y (`{-y}`) for TMS-style schemes.

import type { Point } from '../../geometry/Point'
import * as Util from '../../core/Util'

export interface TileUrlData {
  x: number
  y: number
  z: number
  s: string
  r: string
  '-y'?: number
  [key: string]: any
}

// Pick a subdomain for a given tile coord. Stable, so the same tile always
// resolves to the same subdomain — important for HTTP-cache friendliness.
export function getSubdomain(tilePoint: Point, subdomains: string | string[]): string {
  const arr = typeof subdomains === 'string' ? subdomains.split('') : subdomains
  if (!arr || arr.length === 0)
    return ''
  const index = Math.abs(tilePoint.x + tilePoint.y) % arr.length
  return arr[index]
}

// Compose a URL from a template and a bag of variables. The template may
// reference any key provided in `data`; missing keys throw (so typos fail
// loudly rather than silently producing a broken URL).
export function composeTileUrl(template: string, data: TileUrlData): string {
  return Util.template(template, data)
}
