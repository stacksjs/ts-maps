// The runtime-agnostic half of answering tile requests over HTTP.
//
// Two servers sit on top of a PMTiles reader: `ts-maps/server` (Bun, local
// files and private buckets) and `ts-maps/worker` (Cloudflare Workers over an
// R2 binding). They differ in where bytes come from and how responses are
// cached, but agree on what a tile request *means*: which coordinates are
// inside the archive, how an ETag is compared, what a client will accept.
// That shared meaning lives here, free of `node:*` and Bun imports, so the
// Worker bundle can use it too.

import type { PMTilesHeader } from './header'
import { tileBounds } from './tileid'

/** What the whole Web Mercator world looks like as `[west, south, east, north]`. */
const WORLD: [number, number, number, number] = [-180, -85.0511287798066, 180, 85.0511287798066]

/**
 * Does the client accept `coding`? Honours `q=0` refusals and `*`, which is
 * all a tile server needs from RFC 9110's content negotiation.
 */
export function acceptsEncoding(header: string | null, coding: string): boolean {
  if (!header)
    return false
  let wildcard: boolean | undefined
  for (const part of header.split(',')) {
    const [rawName, ...params] = part.split(';')
    const name = rawName!.trim().toLowerCase()
    const q = params.map(p => p.trim()).find(p => p.startsWith('q='))
    const ok = !q || Number(q.slice(2)) > 0
    if (name === coding)
      return ok
    if (name === '*')
      wildcard = ok
  }
  return wildcard ?? false
}

/** Does `If-None-Match` (or `If-Match`) name `etag`? Weak comparison, per RFC 9110 §13.1.2. */
export function matchesEtag(header: string | null, etag: string): boolean {
  if (!header)
    return false
  if (header.trim() === '*')
    return true
  const bare = etag.replace(/^W\//, '')
  return header.split(',').some(tag => tag.trim().replace(/^W\//, '') === bare)
}

/** The archive's bounds as `[west, south, east, north]`. */
export function archiveBounds(header: PMTilesHeader): [number, number, number, number] {
  const { minLon, minLat, maxLon, maxLat } = header
  // An archive that does not know its bounds writes zeros; one crossing the
  // antimeridian has west > east. Both are treated as "the whole world".
  if ((minLon === 0 && minLat === 0 && maxLon === 0 && maxLat === 0) || minLon >= maxLon || minLat >= maxLat)
    return [...WORLD]
  return [minLon, minLat, maxLon, maxLat]
}

/**
 * Is `z/x/y` inside the archive's zoom range and bounds? Inside, a tile the
 * archive does not store is *empty* (open sea): a `204`. Outside, it is not
 * this archive's to answer: a `404`, which tells a client to overzoom from
 * the parent tile instead.
 */
export function tileInArchive(header: PMTilesHeader, z: number, x: number, y: number): boolean {
  if (z < header.minZoom || z > header.maxZoom)
    return false
  const [w, s, e, n] = archiveBounds(header)
  const [tw, ts, te, tn] = tileBounds(z, x, y)
  return tw < e && te > w && ts < n && tn > s
}
