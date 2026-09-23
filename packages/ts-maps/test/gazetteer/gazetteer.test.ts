import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildGazetteer, buildGazetteerFile, Gazetteer, normalizePlaceText } from '../../src/gazetteer'
import { sources } from './fixture'

let gazetteer: Gazetteer

beforeAll(() => {
  const db = new Database(':memory:')
  buildGazetteer(db, sources)
  gazetteer = new Gazetteer(db)
})

const first = (query: string, opts = {}) => gazetteer.searchSync(query, opts)[0]

describe('Gazetteer.search', () => {
  test('finds a city and labels it with its region and country', async () => {
    const [top] = await gazetteer.search('San Diego')
    expect(top.text).toBe('San Diego, California, United States')
    expect(top.center).toEqual({ lat: 32.71571, lng: -117.16472 })
    expect(top.placeType).toBe('place')
    expect(top.relevance).toBe(1)
    expect(top.properties).toMatchObject({ region: 'California', regionCode: 'CA', country: 'US', timezone: 'America/Los_Angeles' })
  })

  test('matches while the last word is still being typed', () => {
    expect(first('san die')?.text).toBe('San Diego, California, United States')
    expect(first('portl')?.properties?.regionCode).toBe('OR')
  })

  test('ranks an exact name above a longer name that merely starts with it', () => {
    const names = gazetteer.searchSync('San Diego', { limit: 5 }).map(r => r.text)
    expect(names.indexOf('San Diego, Texas, United States'))
      .toBeLessThan(names.indexOf('San Diego Country Estates, California, United States'))
  })

  test('a qualifier after a comma picks between places of the same name', () => {
    expect(first('San Diego, TX')?.properties?.regionCode).toBe('TX')
    expect(first('Portland, ME')?.properties?.regionCode).toBe('ME')
    expect(first('Portland, Maine')?.properties?.regionCode).toBe('ME')
    expect(first('Springfield, Illinois, USA')?.properties?.regionCode).toBe('IL')
    expect(first('Paris, USA')?.properties?.country).toBe('US')
    expect(first('Paris, France')?.properties?.country).toBe('FR')
    expect(first('Portland, calif')).toBeDefined() // an unmatched qualifier demotes, never hides
  })

  test('without a qualifier the larger place wins, and proximity can overturn that', () => {
    expect(first('Portland')?.properties?.regionCode).toBe('OR')
    const boston = { lat: 42.36, lng: -71.06 }
    const near = first('Portland', { proximity: boston })
    expect(near?.properties?.regionCode).toBe('ME')
    expect(near?.properties?.distanceKm).toBeGreaterThan(100)
  })

  test('finds places by the names people use for them, with or without accents', () => {
    for (const query of ['Munich', 'München', 'munchen', 'Monaco di Baviera'])
      expect(first(query)?.text).toBe('München, Bavaria, Germany')
    expect(first('Zurich')?.text).toBe('Zürich, Zurich, Switzerland')
    expect(first('Сан-Диего')?.properties?.regionCode).toBe('CA')
  })

  test('abbreviations match their long form, and the larger place still wins', () => {
    expect(first('st george')?.text).toBe('Saint George, Utah, United States')
    expect(first('Saint George')?.text).toBe('Saint George, Utah, United States')
    expect(first('St. George, CA')?.properties?.country).toBe('CA')
    expect(first('mt holly')?.text).toBe('Mount Holly, United States')
  })

  test('a place reached only through an unusual alternate name ranks below real name matches', () => {
    // Found, but a population of 8.5 million does not carry it past a name.
    expect(gazetteer.searchSync('New Amsterdam').map(r => r.text)).toEqual(['Jakarta, ID'])
    const saint = gazetteer.searchSync('Saint', { limit: 5 }).map(r => r.text)
    expect(saint[0]).toBe('Saint George, Utah, United States')
  })

  test('filters by country and bounding box', () => {
    expect(gazetteer.searchSync('Paris', { countries: ['us'] }).map(r => r.properties?.country)).toEqual(['US'])
    const texas: [number, number, number, number] = [-107, 25, -93, 37]
    expect(gazetteer.searchSync('San Diego', { bbox: texas }).map(r => r.properties?.regionCode)).toEqual(['TX'])
  })

  test('returns nothing for empty, one-letter or punctuation-only queries', () => {
    for (const query of ['', ' ', 's', '"*', ', CA'])
      expect(gazetteer.searchSync(query)).toEqual([])
  })

  test('treats FTS syntax in a query as text', () => {
    expect(() => gazetteer.searchSync('san AND diego OR NEAR(" *')).not.toThrow()
    expect(first('"San" (Diego)')?.properties?.regionCode).toBe('CA')
  })

  test('clamps the limit', () => {
    expect(gazetteer.searchSync('Paris', { limit: 0 })).toHaveLength(1)
    expect(gazetteer.searchSync('San', { limit: 1000 }).length).toBeLessThanOrEqual(25)
  })
})

describe('Gazetteer.reverse', () => {
  test('names the nearest place', async () => {
    const [here] = await gazetteer.reverse({ lat: 32.72, lng: -117.16 })
    expect(here.text).toBe('San Diego, California, United States')
    expect(here.properties?.distanceKm).toBeLessThan(2)
  })

  test('returns nothing in the middle of the ocean', () => {
    expect(gazetteer.reverseSync({ lat: 0, lng: -140 })).toEqual([])
    expect(gazetteer.reverseSync({ lat: Number.NaN, lng: 0 })).toEqual([])
  })
})

describe('building', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'gazetteer-'))
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  test('writes a file that opens read-only, skipping malformed lines', () => {
    const path = join(dir, 'places.sqlite')
    expect(buildGazetteerFile(path, sources)).toEqual({ places: 15 })
    expect(existsSync(`${path}.building`)).toBe(false)
    const g = new Gazetteer(path)
    expect(g.size).toBe(15)
    expect(g.searchSync('Zurich')).toHaveLength(1)
    g.close()
  })

  test('rebuilding replaces the old data', () => {
    const path = join(dir, 'places.sqlite')
    buildGazetteerFile(path, sources, { minPopulation: 100000 })
    const g = new Gazetteer(path)
    expect(g.size).toBe(8)
    expect(g.searchSync('San Diego Country')).toEqual([])
    g.close()
  })

  test('a gazetteer that was never built answers with nothing, not an error', () => {
    const empty = new Gazetteer(new Database(':memory:'))
    expect(empty.size).toBe(0)
    expect(empty.searchSync('San Diego')).toEqual([])
    expect(empty.reverseSync({ lat: 32.7, lng: -117.1 })).toEqual([])
  })

  test('refuses a path that does not exist instead of creating an empty file', () => {
    expect(() => new Gazetteer(join(dir, 'missing.sqlite'))).toThrow(/No gazetteer/)
    expect(existsSync(join(dir, 'missing.sqlite'))).toBe(false)
  })
})

test('normalizePlaceText folds case, accents and punctuation', () => {
  expect(normalizePlaceText('  Île-de-France ')).toBe('ile de france')
  expect(normalizePlaceText('St. John\'s')).toBe('st john s')
})
