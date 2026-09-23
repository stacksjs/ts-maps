import { describe, expect, test } from 'bun:test'
import { deflateRawSync } from 'node:zlib'
import { downloadGeoNames, parseGeoNamesAdmin1, parseGeoNamesCities, parseGeoNamesCountries, readZipEntry } from '../../src/gazetteer'
import { admin1, cities, countries } from './fixture'

/** A minimal zip: local headers, central directory, end record. */
function zip(files: { name: string, data: Uint8Array, deflate?: boolean }[]): Uint8Array {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const body = file.deflate ? new Uint8Array(deflateRawSync(file.data)) : file.data
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034B50, true)
    lv.setUint16(8, file.deflate ? 8 : 0, true)
    lv.setUint32(18, body.length, true)
    lv.setUint32(22, file.data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014B50, true)
    cv.setUint16(10, file.deflate ? 8 : 0, true)
    cv.setUint32(20, body.length, true)
    cv.setUint32(24, file.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local, body)
    centrals.push(central)
    offset += local.length + body.length
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054B50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const parts = [...locals, ...centrals, end]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('readZipEntry', () => {
  const readme = new TextEncoder().encode('readme')
  const table = new TextEncoder().encode(cities)
  const archive = zip([
    { name: 'readme.txt', data: readme },
    { name: 'cities1000.txt', data: table, deflate: true },
  ])

  test('reads stored and deflated entries by name', () => {
    expect(text(readZipEntry(archive, 'readme.txt'))).toBe('readme')
    expect(text(readZipEntry(archive, 'cities1000.txt'))).toBe(cities)
  })

  test('says which entry is missing, and rejects what is not a zip', () => {
    expect(() => readZipEntry(archive, 'cities500.txt')).toThrow(/cities500\.txt not found/)
    expect(() => readZipEntry(new TextEncoder().encode('<html>rate limited</html>'), 'x')).toThrow(/Not a zip/)
  })
})

describe('parsers', () => {
  test('cities: typed fields, alternates split, malformed lines skipped', () => {
    const places = parseGeoNamesCities(cities)
    expect(places).toHaveLength(15)
    expect(places[0]).toMatchObject({
      id: 5391811,
      name: 'San Diego',
      alternates: ['SAN', 'San Diegas', 'Сан-Диего'],
      country: 'US',
      admin1: 'CA',
      population: 1394928,
    })
  })

  test('admin1 and country names', () => {
    expect(parseGeoNamesAdmin1(admin1).get('DE.02')).toBe('Bavaria')
    const names = parseGeoNamesCountries(countries)
    expect(names.get('US')).toBe('United States')
    expect(names.has('# ISO')).toBe(false)
  })
})

describe('downloadGeoNames', () => {
  test('fetches the dump, admin1 and country tables and unzips the dump', async () => {
    const requested: string[] = []
    const files: Record<string, Uint8Array> = {
      'cities5000.zip': zip([{ name: 'cities5000.txt', data: new TextEncoder().encode(cities), deflate: true }]),
      'admin1CodesASCII.txt': new TextEncoder().encode(admin1),
      'countryInfo.txt': new TextEncoder().encode(countries),
    }
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input)
      requested.push(url)
      const body = files[url.split('/').pop()!]
      return body ? new Response(body as Uint8Array<ArrayBuffer>) : new Response('missing', { status: 404, statusText: 'Not Found' })
    }) as typeof fetch

    const got = await downloadGeoNames({ dataset: 'cities5000', baseUrl: 'https://mirror.test/dump/', fetch: fakeFetch })
    expect(got).toEqual({ cities, admin1, countries })
    expect(requested.sort()).toEqual([
      'https://mirror.test/dump/admin1CodesASCII.txt',
      'https://mirror.test/dump/cities5000.zip',
      'https://mirror.test/dump/countryInfo.txt',
    ])
  })

  test('a failed download names the file', async () => {
    const notFound = (async () => new Response('', { status: 503, statusText: 'Service Unavailable' })) as unknown as typeof fetch
    await expect(downloadGeoNames({ fetch: notFound })).rejects.toThrow(/cities1000\.zip: 503/)
  })
})
