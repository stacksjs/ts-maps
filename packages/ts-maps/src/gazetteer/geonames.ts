// GeoNames source data: the populated-places dumps, first-level admin
// divisions ("California", "Bavaria") and country names.
//
// https://download.geonames.org/export/dump/readme.txt
// Licence: CC BY 4.0 — show GEONAMES_ATTRIBUTION wherever results appear.

import { inflateRawSync } from 'node:zlib'

/** Credit line the GeoNames licence requires next to search results. */
export const GEONAMES_ATTRIBUTION: string = 'Place data © GeoNames (geonames.org), CC BY 4.0'

/**
 * Which populated-places dump to use: every place with at least this many
 * people. `cities1000` (~150k places) finds any town a trip starts from;
 * `cities500` adds villages for about twice the size.
 */
export type GeoNamesDataset = 'cities500' | 'cities1000' | 'cities5000' | 'cities15000'

export interface GeoNamesSources {
  /** The `citiesN.txt` table, tab-separated. */
  cities: string
  /** `admin1CodesASCII.txt`: `US.CA<TAB>California<TAB>…`. */
  admin1?: string
  /** `countryInfo.txt`: ISO code and country name, `#` comment lines. */
  countries?: string
}

export interface GeoNamesPlace {
  id: number
  name: string
  ascii: string
  /** Other names the place is known by, in any language. */
  alternates: string[]
  lat: number
  lng: number
  /** GeoNames feature code, e.g. `PPLA2` (seat of a second-order division). */
  feature: string
  /** ISO-3166 alpha-2. */
  country: string
  /** First-level division code within the country, e.g. `CA`, `08`. */
  admin1: string
  population: number
  timezone: string
}

export interface DownloadGeoNamesOptions {
  dataset?: GeoNamesDataset
  baseUrl?: string
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch
}

const DEFAULT_BASE_URL = 'https://download.geonames.org/export/dump'

/** Fetch a populated-places dump plus the admin1 and country name tables. */
export async function downloadGeoNames(opts: DownloadGeoNamesOptions = {}): Promise<GeoNamesSources> {
  const dataset = opts.dataset ?? 'cities1000'
  const base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  const get = opts.fetch ?? fetch

  const fetchBytes = async (file: string): Promise<Uint8Array> => {
    const res = await get(`${base}/${file}`)
    if (!res.ok)
      throw new Error(`GeoNames download failed for ${file}: ${res.status} ${res.statusText}`)
    return new Uint8Array(await res.arrayBuffer())
  }

  const [zip, admin1, countries] = await Promise.all([
    fetchBytes(`${dataset}.zip`),
    fetchBytes('admin1CodesASCII.txt'),
    fetchBytes('countryInfo.txt'),
  ])
  const decoder = new TextDecoder()
  return {
    cities: decoder.decode(readZipEntry(zip, `${dataset}.txt`)),
    admin1: decoder.decode(admin1),
    countries: decoder.decode(countries),
  }
}

/** Parse `citiesN.txt`. Malformed lines are skipped, not fatal. */
export function parseGeoNamesCities(text: string): GeoNamesPlace[] {
  const places: GeoNamesPlace[] = []
  for (const line of text.split('\n')) {
    if (!line)
      continue
    const f = line.split('\t')
    if (f.length < 18)
      continue
    const id = Number(f[0])
    const lat = Number(f[4])
    const lng = Number(f[5])
    if (!Number.isInteger(id) || !Number.isFinite(lat) || !Number.isFinite(lng) || !f[1])
      continue
    places.push({
      id,
      name: f[1],
      ascii: f[2] || f[1],
      alternates: f[3] ? f[3].split(',').filter(Boolean) : [],
      lat,
      lng,
      feature: f[7] ?? '',
      country: (f[8] ?? '').toUpperCase(),
      admin1: f[10] ?? '',
      population: Number(f[14]) || 0,
      timezone: f[17] ?? '',
    })
  }
  return places
}

/** `admin1CodesASCII.txt` as `"US.CA" -> "California"`. */
export function parseGeoNamesAdmin1(text: string): Map<string, string> {
  const names = new Map<string, string>()
  for (const line of text.split('\n')) {
    const [code, name] = line.split('\t')
    if (code && name)
      names.set(code, name)
  }
  return names
}

/** `countryInfo.txt` as `"US" -> "United States"`. */
export function parseGeoNamesCountries(text: string): Map<string, string> {
  const names = new Map<string, string>()
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#'))
      continue
    const f = line.split('\t')
    if (f[0] && f[4])
      names.set(f[0].toUpperCase(), f[4])
  }
  return names
}

/**
 * Read one file out of a zip archive — enough of the format for the GeoNames
 * dumps (stored or deflated entries, no ZIP64), without a dependency or a
 * shell `unzip` the server may not have.
 */
export function readZipEntry(zip: Uint8Array, name: string): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const u16 = (at: number): number => view.getUint16(at, true)
  const u32 = (at: number): number => view.getUint32(at, true)

  // End of central directory: fixed 22 bytes plus a comment of up to 64 KiB.
  let eocd = -1
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 0xFFFF); at--) {
    if (u32(at) === 0x06054B50) {
      eocd = at
      break
    }
  }
  if (eocd < 0)
    throw new Error('Not a zip archive')

  const entries = u16(eocd + 10)
  let at = u32(eocd + 16)
  const decoder = new TextDecoder()
  for (let i = 0; i < entries; i++) {
    if (u32(at) !== 0x02014B50)
      throw new Error('Corrupt zip central directory')
    const method = u16(at + 10)
    const compressedSize = u32(at + 20)
    const nameLength = u16(at + 28)
    const extraLength = u16(at + 30)
    const commentLength = u16(at + 32)
    const localOffset = u32(at + 42)
    const entryName = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength))
    if (entryName === name) {
      if (u32(localOffset) !== 0x04034B50)
        throw new Error('Corrupt zip local header')
      const start = localOffset + 30 + u16(localOffset + 26) + u16(localOffset + 28)
      const data = zip.subarray(start, start + compressedSize)
      if (method === 0)
        return data
      if (method === 8)
        return new Uint8Array(inflateRawSync(data))
      throw new Error(`Unsupported zip compression method ${method}`)
    }
    at += 46 + nameLength + extraLength + commentLength
  }
  throw new Error(`${name} not found in zip archive`)
}
