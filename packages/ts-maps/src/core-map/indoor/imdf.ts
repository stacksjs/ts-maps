/**
 * Indoor maps in IMDF, Apple's Indoor Mapping Data Format: what Apple Maps
 * shows inside airports and malls.
 *
 * An IMDF archive is a zip of GeoJSON files, one per feature type: the
 * `venue`, its `level`s (each with an `ordinal`, 0 the ground floor), the
 * `unit`s on each level (rooms, shops, corridors, each with a category),
 * `opening`s (doors), `amenity` points (toilets, lifts, gates) and
 * `occupant`s (the shop or gate a unit is, placed by an `anchor`).
 *
 * `loadIMDF` reads one from a zip, a folder of its files, or the files
 * already parsed, into an `IndoorVenue`: its levels in order, and each
 * level's features ready to draw and search.
 */

import type { LatLngLike } from '../services/types'

export interface IMDFFeature {
  type: 'Feature'
  id: string
  feature_type: string
  geometry: { type: string, coordinates: any } | null
  properties: Record<string, any>
}

export interface IndoorLevel {
  id: string
  /** 0 the ground floor, 1 the one above, -1 the one below. */
  ordinal: number
  name: string
  /** What the picker says: "1", "G", "B1". */
  shortName: string
  outdoor: boolean
}

/** A named thing inside, for search: a shop, a gate, a lift. */
export interface IndoorPlace {
  id: string
  name: string
  category: string
  center: LatLngLike
  level: number
  levelName: string
}

export interface IndoorVenue {
  id: string
  name: string
  category: string
  /** `[west, south, east, north]`. */
  bounds: [number, number, number, number]
  center: LatLngLike
  /** Lowest first. */
  levels: IndoorLevel[]
  /** Units, openings, amenities, occupants and fixtures, by level ordinal. */
  features: Map<number, IMDFFeature[]>
  places: IndoorPlace[]
}

/** IMDF's localised strings: `{ en: 'Gate 12' }`. The language asked for, else English, else any. */
export function label(value: unknown, language?: string): string | undefined {
  if (typeof value === 'string')
    return value
  if (!value || typeof value !== 'object')
    return undefined
  const labels = value as Record<string, string>
  const lang = language?.toLowerCase()
  return (lang && (labels[lang] ?? labels[lang.split('-')[0]!])) ?? labels.en ?? Object.values(labels)[0]
}

// ---------------------------------------------------------------------------
// A zip, read with nothing but DecompressionStream
// ---------------------------------------------------------------------------

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined')
    throw new Error('IMDF: reading a zip needs DecompressionStream, which this runtime lacks')
  const stream = new DecompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  void writer.write(bytes as Uint8Array<ArrayBuffer>).then(() => writer.close()).catch(() => {})
  return new Uint8Array(await new Response(stream.readable).arrayBuffer())
}

/** The files in a zip, by name: stored and deflated entries, which is what IMDF archives use. */
export async function unzip(data: ArrayBuffer | Uint8Array): Promise<Map<string, Uint8Array>> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // The end of central directory record, searched for from the end: a
  // comment of up to 64 KiB may follow it.
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054B50) {
      end = i
      break
    }
  }
  if (end < 0)
    throw new Error('IMDF: not a zip archive')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const files = new Map<string, Uint8Array>()
  const decoder = new TextDecoder()
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014B50)
      throw new Error('IMDF: damaged zip directory')
    const method = view.getUint16(at + 10, true)
    const size = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const offset = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/'))
      continue
    // The local header has its own name and extra lengths.
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    const body = bytes.subarray(start, start + size)
    if (method === 0)
      files.set(name, body)
    else if (method === 8)
      files.set(name, await inflateRaw(body))
  }
  return files
}

// ---------------------------------------------------------------------------
// Reading the venue
// ---------------------------------------------------------------------------

const FILES = ['venue', 'level', 'unit', 'opening', 'amenity', 'anchor', 'occupant', 'fixture', 'kiosk', 'section', 'footprint', 'building'] as const

export type IMDFSource
  = | string
    | ArrayBuffer
    | Uint8Array
    | Partial<Record<(typeof FILES)[number], { features?: any[] }>>

/** A point inside a feature to label it at: its display point, or the middle of its geometry. */
function centerOf(feature: IMDFFeature): LatLngLike | undefined {
  const display = feature.properties?.display_point?.coordinates
  if (Array.isArray(display))
    return { lat: display[1], lng: display[0] }
  const g = feature.geometry
  if (!g)
    return undefined
  if (g.type === 'Point')
    return { lat: g.coordinates[1], lng: g.coordinates[0] }
  const ring: number[][] = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.type === 'LineString' ? g.coordinates : []
  if (!ring.length)
    return undefined
  const [sx, sy] = ring.reduce(([x, y], p) => [x + p[0]!, y + p[1]!], [0, 0])
  return { lat: sy / ring.length, lng: sx / ring.length }
}

function boundsOf(features: IMDFFeature[]): [number, number, number, number] {
  let w = 180
  let s = 90
  let e = -180
  let n = -90
  const visit = (c: any): void => {
    if (typeof c[0] === 'number') {
      w = Math.min(w, c[0])
      e = Math.max(e, c[0])
      s = Math.min(s, c[1])
      n = Math.max(n, c[1])
    }
    else {
      for (const inner of c) visit(inner)
    }
  }
  for (const f of features) {
    if (f.geometry)
      visit(f.geometry.coordinates)
  }
  return [w, s, e, n]
}

async function readFiles(source: IMDFSource, fetcher: typeof fetch): Promise<Partial<Record<string, { features?: any[] }>>> {
  if (typeof source === 'string') {
    // A zip, or a folder of the archive's files.
    if (/\.zip(?:$|\?)/i.test(source)) {
      const response = await fetcher(source)
      if (!response.ok)
        throw new Error(`IMDF: HTTP ${response.status} fetching ${source}`)
      return readFiles(await response.arrayBuffer(), fetcher)
    }
    const base = source.endsWith('/') ? source : `${source}/`
    const out: Record<string, { features?: any[] }> = {}
    await Promise.all(FILES.map(async (name) => {
      const response = await fetcher(`${base}${name}.geojson`).catch(() => undefined)
      if (response?.ok)
        out[name] = await response.json()
    }))
    return out
  }
  if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
    const files = await unzip(source)
    const out: Record<string, { features?: any[] }> = {}
    const decoder = new TextDecoder()
    for (const [path, body] of files) {
      const name = path.split('/').pop()!.replace(/\.geojson$/i, '')
      if ((FILES as readonly string[]).includes(name))
        out[name] = JSON.parse(decoder.decode(body))
    }
    return out
  }
  return source
}

export interface LoadIMDFOptions {
  /** The language names are read in. Default English. */
  language?: string
  fetch?: typeof fetch
}

/** Read an IMDF archive: a `.zip` URL, a folder URL, the zip's bytes, or its files parsed. */
export async function loadIMDF(source: IMDFSource, options: LoadIMDFOptions = {}): Promise<IndoorVenue> {
  const files = await readFiles(source, options.fetch ?? fetch)
  const lang = options.language
  const features = (name: string): IMDFFeature[] => (files[name]?.features ?? []).map((f: any) => ({ ...f, feature_type: f.feature_type ?? name, properties: f.properties ?? {} }))
  const venue = features('venue')[0]
  if (!venue)
    throw new Error('IMDF: the archive has no venue')

  const levels: IndoorLevel[] = features('level')
    .map(f => ({
      id: f.id,
      ordinal: Number(f.properties.ordinal ?? 0),
      name: label(f.properties.name, lang) ?? `Level ${f.properties.ordinal}`,
      shortName: label(f.properties.short_name, lang) ?? String(f.properties.ordinal ?? 0),
      outdoor: !!f.properties.outdoor,
    }))
  const ordinalOf = new Map(levels.map(l => [l.id, l.ordinal]))
  // Several buildings can each have a level 0: one picker entry per ordinal.
  const byOrdinal = new Map<number, IndoorLevel>()
  for (const level of levels.sort((a, b) => a.ordinal - b.ordinal)) {
    if (!byOrdinal.has(level.ordinal) || (byOrdinal.get(level.ordinal)!.outdoor && !level.outdoor))
      byOrdinal.set(level.ordinal, level)
  }

  const perLevel = new Map<number, IMDFFeature[]>()
  const add = (ordinal: number | undefined, feature: IMDFFeature): void => {
    if (ordinal === undefined)
      return
    const list = perLevel.get(ordinal)
    if (list)
      list.push(feature)
    else
      perLevel.set(ordinal, [feature])
  }
  const units = features('unit')
  const unitLevel = new Map(units.map(u => [u.id, ordinalOf.get(u.properties.level_id)]))
  for (const feature of [...units, ...features('opening'), ...features('fixture'), ...features('kiosk'), ...features('section')])
    add(ordinalOf.get(feature.properties.level_id), feature)
  for (const amenity of features('amenity'))
    add(unitLevel.get(amenity.properties.unit_ids?.[0]), amenity)

  // An occupant is placed by its anchor, which is in a unit.
  const anchors = new Map(features('anchor').map(a => [a.id, a]))
  const places: IndoorPlace[] = []
  const levelName = (ordinal: number): string => byOrdinal.get(ordinal)?.name ?? `Level ${ordinal}`
  for (const occupant of features('occupant')) {
    const anchor = anchors.get(occupant.properties.anchor_id)
    const ordinal = anchor ? unitLevel.get(anchor.properties.unit_id) : undefined
    const center = anchor ? centerOf(anchor) : undefined
    const name = label(occupant.properties.name, lang)
    if (ordinal === undefined || !center || !name)
      continue
    // Drawn as a point where its anchor is.
    add(ordinal, { ...occupant, geometry: anchor!.geometry })
    places.push({ id: occupant.id, name, category: String(occupant.properties.category ?? 'occupant'), center, level: ordinal, levelName: levelName(ordinal) })
  }
  for (const [ordinal, list] of perLevel) {
    for (const feature of list) {
      if (feature.feature_type === 'occupant')
        continue
      const name = label(feature.properties.name, lang) ?? label(feature.properties.alt_name, lang)
      const center = centerOf(feature)
      if (name && center && (feature.feature_type === 'unit' || feature.feature_type === 'amenity'))
        places.push({ id: feature.id, name, category: String(feature.properties.category ?? feature.feature_type), center, level: ordinal, levelName: levelName(ordinal) })
    }
  }

  const outline = [venue, ...features('footprint'), ...features('building')]
  const bounds = boundsOf(outline.some(f => f.geometry) ? outline : [...perLevel.values()].flat())
  const center = centerOf(venue) ?? { lat: (bounds[1] + bounds[3]) / 2, lng: (bounds[0] + bounds[2]) / 2 }
  return {
    id: venue.id,
    name: label(venue.properties.name, lang) ?? 'Venue',
    category: String(venue.properties.category ?? 'venue'),
    bounds,
    center,
    levels: [...byOrdinal.values()],
    features: perLevel,
    places,
  }
}

/** The places in a venue whose names match `query`, best first. */
export function searchIndoor(venue: IndoorVenue, query: string, limit: number = 10): IndoorPlace[] {
  const fold = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = fold(query.trim())
  if (!q)
    return []
  return venue.places
    .map((place) => {
      const name = fold(place.name)
      const score = name === q ? 0 : name.startsWith(q) ? 1 : name.split(/[\s-]+/).some(w => w.startsWith(q)) ? 2 : name.includes(q) ? 3 : fold(place.category).includes(q) ? 4 : -1
      return { place, score }
    })
    .filter(r => r.score >= 0)
    .sort((a, b) => a.score - b.score || a.place.name.localeCompare(b.place.name))
    .slice(0, limit)
    .map(r => r.place)
}
