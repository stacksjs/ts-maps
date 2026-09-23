// A self-hosted place search: GeoNames populated places in SQLite with an
// FTS5 index, ranked in process. It answers "San Diego", "san die",
// "Portland, ME", "München" and "Munich" without a network call, a key or a
// rate limit, and hands back the same GeocodingResult shape as every other
// ts-maps geocoder.

import type { GeocoderOptions, GeocoderProvider, GeocodingResult, LatLngLike } from '../core-map/services/types'
import type { GeoNamesSources } from './geonames'
import { Database } from 'bun:sqlite'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { parseGeoNamesAdmin1, parseGeoNamesCities, parseGeoNamesCountries } from './geonames'

export interface BuildGazetteerOptions {
  /** Leave out places smaller than this. Default 0: keep the whole dump. */
  minPopulation?: number
}

export interface GazetteerSearchOptions extends GeocoderOptions {
  // `limit`, `proximity`, `countries` and `bbox` are honoured; `language` is
  // not — every alternate name is searchable, and labels use the local name.
}

export interface GazetteerPlaceProperties {
  id: number
  name: string
  region: string | null
  regionCode: string | null
  country: string
  countryName: string | null
  population: number
  timezone: string | null
  /** Distance from `proximity` or the reverse-geocoded point, in km. */
  distanceKm?: number
}

interface PlaceRow {
  id: number
  name: string
  ascii: string
  region: string | null
  region_code: string | null
  country: string
  country_name: string | null
  lat: number
  lng: number
  population: number
  timezone: string | null
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS gazetteer_places (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    ascii TEXT NOT NULL,
    region TEXT,
    region_code TEXT,
    country TEXT NOT NULL,
    country_name TEXT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    population INTEGER NOT NULL DEFAULT 0,
    feature TEXT,
    timezone TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS gazetteer_places_lat_lng ON gazetteer_places (lat, lng)',
  // Contentless: the names live in gazetteer_places; the index only has to
  // answer MATCH with rowids. Diacritics fold so "Zurich" finds "Zürich".
  `CREATE VIRTUAL TABLE IF NOT EXISTS gazetteer_fts USING fts5(
    name, ascii, alternates,
    content='',
    tokenize='unicode61 remove_diacritics 2',
    prefix='2 3 4'
  )`,
  `CREATE TABLE IF NOT EXISTS gazetteer_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
]

/**
 * Load GeoNames into `db`, replacing any gazetteer already there. One
 * transaction: a reader sees the old data or the new, never half of it.
 */
export function buildGazetteer(db: Database, sources: GeoNamesSources, opts: BuildGazetteerOptions = {}): { places: number } {
  const minPopulation = opts.minPopulation ?? 0
  const regions = sources.admin1 ? parseGeoNamesAdmin1(sources.admin1) : new Map<string, string>()
  const countries = sources.countries ? parseGeoNamesCountries(sources.countries) : new Map<string, string>()
  const places = parseGeoNamesCities(sources.cities).filter(p => p.population >= minPopulation)

  let count = 0
  db.transaction(() => {
    db.run('DROP TABLE IF EXISTS gazetteer_fts')
    db.run('DROP TABLE IF EXISTS gazetteer_places')
    db.run('DROP TABLE IF EXISTS gazetteer_meta')
    for (const statement of SCHEMA)
      db.run(statement)

    const insertPlace = db.prepare(`INSERT INTO gazetteer_places
      (id, name, ascii, region, region_code, country, country_name, lat, lng, population, feature, timezone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const insertName = db.prepare('INSERT INTO gazetteer_fts (rowid, name, ascii, alternates) VALUES (?, ?, ?, ?)')
    for (const p of places) {
      const regionCode = p.admin1 && p.admin1 !== '00' ? p.admin1 : null
      insertPlace.run(
        p.id,
        p.name,
        p.ascii,
        regionCode ? regions.get(`${p.country}.${regionCode}`) ?? null : null,
        regionCode,
        p.country,
        countries.get(p.country) ?? null,
        p.lat,
        p.lng,
        p.population,
        p.feature || null,
        p.timezone || null,
      )
      insertName.run(p.id, p.name, p.ascii, p.alternates.join(' '))
      count++
    }
    const setMeta = db.prepare('INSERT INTO gazetteer_meta (key, value) VALUES (?, ?)')
    setMeta.run('places', String(count))
    setMeta.run('built_at', new Date().toISOString())
  })()
  return { places: count }
}

/**
 * Build a gazetteer into its own database file. Written beside `path` and
 * renamed into place, so a server holding the old file open keeps working
 * and a failed build leaves the previous file untouched.
 */
export function buildGazetteerFile(path: string, sources: GeoNamesSources, opts: BuildGazetteerOptions = {}): { places: number } {
  const temp = `${path}.building`
  rmSync(temp, { force: true })
  const db = new Database(temp, { create: true })
  try {
    db.run('PRAGMA journal_mode = DELETE')
    const result = buildGazetteer(db, sources, opts)
    db.run('VACUUM')
    db.close()
    renameSync(temp, path)
    return result
  }
  catch (error) {
    db.close()
    rmSync(temp, { force: true })
    throw error
  }
}

/** Lowercase, strip accents, and reduce everything else to single spaces. */
export function normalizePlaceText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Words people shorten, both ways round: GeoNames names St. George, Utah
 * "Saint George" while a smaller Ontario town is literally "St. George", so
 * without this the abbreviation someone typed picks the wrong one.
 */
const WORD_FORMS: Record<string, string> = {
  st: 'saint',
  ste: 'sainte',
  mt: 'mount',
  ft: 'fort',
  pt: 'point',
}

/** A normalized name with the short forms written out, for comparing. */
function canonicalName(text: string): string {
  return normalizePlaceText(text)
    .split(' ')
    .map(word => WORD_FORMS[word] ?? word)
    .join(' ')
}

/** FTS5 term for one query word, matching its short and long form alike. */
function ftsTerm(token: string, prefix: boolean): string {
  const star = prefix ? '*' : ''
  const long = WORD_FORMS[token]
  const short = Object.keys(WORD_FORMS).find(key => WORD_FORMS[key] === token)
  const alternative = long ?? short
  return alternative
    ? `("${token}"${star} OR "${alternative}"${star})`
    : `"${token}"${star}`
}

/** Short forms people type for a country, beyond its ISO code and name. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US',
  america: 'US',
  uk: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  holland: 'NL',
}

const EARTH_RADIUS_KM = 6371

export function haversineKm(a: LatLngLike, b: LatLngLike): number {
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLng = (b.lng - a.lng) * toRad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export class Gazetteer implements GeocoderProvider {
  name: string = 'gazetteer'
  readonly db: Database
  private ownsDb: boolean

  /** Open a gazetteer file read-only, or wrap a database you already hold. */
  constructor(source: string | Database) {
    if (typeof source === 'string') {
      if (!existsSync(source))
        throw new Error(`No gazetteer at ${source}; build one with buildGazetteerFile()`)
      this.db = new Database(source, { readonly: true })
      this.ownsDb = true
    }
    else {
      this.db = source
      this.ownsDb = false
    }
  }

  /** How many places are loaded; 0 when the tables are missing. */
  get size(): number {
    try {
      const row = this.db.query('SELECT value FROM gazetteer_meta WHERE key = \'places\'').get() as { value: string } | null
      return row ? Number(row.value) : 0
    }
    catch {
      return 0
    }
  }

  async search(query: string, opts: GazetteerSearchOptions = {}): Promise<GeocodingResult[]> {
    return this.searchSync(query, opts)
  }

  /**
   * Ranked place search. The text before the first comma names the place;
   * anything after qualifies it — "Portland, ME", "Paris, France",
   * "Springfield, Illinois, USA".
   */
  searchSync(query: string, opts: GazetteerSearchOptions = {}): GeocodingResult[] {
    const limit = clampLimit(opts.limit)
    const [head, ...rest] = query.split(',')
    const typed = normalizePlaceText(head ?? '')
    const qualifiers = rest.map(normalizePlaceText).filter(Boolean)
    const tokens = typed.split(' ').filter(Boolean)
    if (!tokens.length || typed.length < 2)
      return []
    const primary = canonicalName(typed)
    const words = primary.split(' ')

    // Every word must match, the last as a prefix so typing "san die" works.
    // Explicit AND: FTS5 has no implicit AND after a parenthesised group.
    const match = tokens
      .map((token, i) => ftsTerm(token, i === tokens.length - 1))
      .join(' AND ')

    const where = ['gazetteer_fts MATCH ?']
    const params: (string | number)[] = [match]
    if (opts.countries?.length) {
      where.push(`p.country IN (${opts.countries.map(() => '?').join(', ')})`)
      params.push(...opts.countries.map(c => c.toUpperCase()))
    }
    if (opts.bbox) {
      const [w, s, e, n] = opts.bbox
      where.push('p.lat BETWEEN ? AND ?', 'p.lng BETWEEN ? AND ?')
      params.push(s, n, w, e)
    }

    let rows: PlaceRow[]
    try {
      rows = this.db.query(`SELECT p.id, p.name, p.ascii, p.region, p.region_code, p.country, p.country_name,
          p.lat, p.lng, p.population, p.timezone
        FROM gazetteer_fts JOIN gazetteer_places p ON p.id = gazetteer_fts.rowid
        WHERE ${where.join(' AND ')}
        ORDER BY p.population DESC
        LIMIT 300`).all(...params) as PlaceRow[]
    }
    catch {
      // Missing tables (never built) or a query FTS5 rejects: no results,
      // not a 500 in the middle of someone typing.
      return []
    }

    const scored = rows.map((row) => {
      const name = canonicalName(row.name)
      const ascii = canonicalName(row.ascii)
      let score = Math.log10(row.population + 1)

      if (name === primary || ascii === primary)
        score += 4
      else if (name.startsWith(primary) || ascii.startsWith(primary))
        score += 2
      else if (!words.every(w => wordStartsWith(name, w) || wordStartsWith(ascii, w)))
        score -= 3 // matched only through an alternate name, some of them odd

      for (const q of qualifiers)
        score += qualifierMatches(q, row) ? 4 : -4

      let distanceKm: number | undefined
      if (opts.proximity) {
        distanceKm = haversineKm(opts.proximity, row)
        score -= Math.min(4, distanceKm / 250)
      }
      return { row, score, distanceKm }
    })

    scored.sort((a, b) => b.score - a.score || b.row.population - a.row.population)
    const top = scored.slice(0, limit)
    const best = top[0]?.score ?? 1
    return top.map(({ row, score, distanceKm }) => toResult(row, {
      relevance: best > 0 ? Math.max(0, Math.min(1, score / best)) : 0,
      distanceKm,
    }))
  }

  async reverse(center: LatLngLike, opts: GeocoderOptions = {}): Promise<GeocodingResult[]> {
    return this.reverseSync(center, opts)
  }

  /** The nearest places to a point, within 50 km. */
  reverseSync(center: LatLngLike, opts: GeocoderOptions = {}): GeocodingResult[] {
    if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng))
      return []
    const limit = clampLimit(opts.limit ?? 1)
    const radiusKm = 50
    const dLat = radiusKm / 111
    const dLng = radiusKm / (111 * Math.max(0.01, Math.cos(center.lat * Math.PI / 180)))
    let rows: PlaceRow[]
    try {
      rows = this.db.query(`SELECT id, name, ascii, region, region_code, country, country_name, lat, lng, population, timezone
        FROM gazetteer_places
        WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`)
        .all(center.lat - dLat, center.lat + dLat, center.lng - dLng, center.lng + dLng) as PlaceRow[]
    }
    catch {
      return []
    }
    return rows
      .map(row => ({ row, distanceKm: haversineKm(center, row) }))
      .filter(r => r.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit)
      .map(({ row, distanceKm }) => toResult(row, { distanceKm }))
  }

  close(): void {
    if (this.ownsDb)
      this.db.close()
  }
}

function clampLimit(limit: number | undefined): number {
  const n = Math.floor(Number(limit ?? 5))
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 25) : 5
}

function wordStartsWith(text: string, token: string): boolean {
  return text.split(' ').some(word => word.startsWith(token))
}

function qualifierMatches(qualifier: string, row: PlaceRow): boolean {
  if (qualifier === row.country.toLowerCase())
    return true
  if (COUNTRY_ALIASES[qualifier] === row.country)
    return true
  if (row.region_code && qualifier === row.region_code.toLowerCase())
    return true
  const region = row.region ? normalizePlaceText(row.region) : ''
  const country = row.country_name ? normalizePlaceText(row.country_name) : ''
  if (qualifier === region || qualifier === country)
    return true
  // "calif", "united" — a typed-out prefix of a longer name.
  return qualifier.length >= 3 && (region.startsWith(qualifier) || country.startsWith(qualifier))
}

function toResult(row: PlaceRow, extra: { relevance?: number, distanceKm?: number }): GeocodingResult {
  const properties: GazetteerPlaceProperties = {
    id: row.id,
    name: row.name,
    region: row.region,
    regionCode: row.region_code,
    country: row.country,
    countryName: row.country_name,
    population: row.population,
    timezone: row.timezone,
  }
  if (extra.distanceKm !== undefined)
    properties.distanceKm = Math.round(extra.distanceKm * 10) / 10
  const result: GeocodingResult = {
    text: [row.name, row.region, row.country_name ?? row.country].filter(Boolean).join(', '),
    center: { lat: row.lat, lng: row.lng },
    placeType: 'place',
    properties: properties as unknown as Record<string, unknown>,
  }
  if (extra.relevance !== undefined)
    result.relevance = Math.round(extra.relevance * 1000) / 1000
  return result
}
