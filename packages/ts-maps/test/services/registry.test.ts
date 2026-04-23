import { describe, expect, test } from 'bun:test'
import {
  defaultDirections,
  defaultGeocoder,
  defaultIsochrone,
  defaultMatrix,
  NominatimGeocoder,
  OSRMDirections,
  valhallaDirections,
  ValhallaDirections,
  ValhallaIsochrone,
  ValhallaMatrix,
} from '../../src/core-map/services/index'

describe('default provider registry', () => {
  test('defaultGeocoder returns a NominatimGeocoder', () => {
    const g = defaultGeocoder()
    expect(g).toBeInstanceOf(NominatimGeocoder)
    expect(g.name).toBe('nominatim')
  })

  test('defaultDirections returns an OSRMDirections', () => {
    const d = defaultDirections()
    expect(d).toBeInstanceOf(OSRMDirections)
    expect(d.name).toBe('osrm')
  })

  test('defaultIsochrone returns a ValhallaIsochrone', () => {
    const i = defaultIsochrone()
    expect(i).toBeInstanceOf(ValhallaIsochrone)
    expect(i.name).toBe('valhalla')
  })

  test('defaultMatrix returns a ValhallaMatrix', () => {
    const m = defaultMatrix()
    expect(m).toBeInstanceOf(ValhallaMatrix)
    expect(m.name).toBe('valhalla')
  })

  test('factories return fresh instances each call', () => {
    const a = defaultGeocoder()
    const b = defaultGeocoder()
    expect(a).not.toBe(b)
  })

  test('valhallaDirections convenience exposes ValhallaDirections', () => {
    const d = valhallaDirections()
    expect(d).toBeInstanceOf(ValhallaDirections)
    expect(d.name).toBe('valhalla')
  })

  test('services namespace is exposed from core-map entry', async () => {
    const mod = await import('../../src/core-map/index')
    expect(mod.services).toBeDefined()
    expect(typeof mod.services.defaultGeocoder).toBe('function')
    expect(mod.services.defaultGeocoder()).toBeInstanceOf(NominatimGeocoder)
  })

  test('types re-export is present via runtime check', async () => {
    const mod = await import('../../src/core-map/services/index')
    expect('NominatimGeocoder' in mod).toBe(true)
    expect('OSRMDirections' in mod).toBe(true)
    expect('ValhallaDirections' in mod).toBe(true)
    expect('ValhallaIsochrone' in mod).toBe(true)
    expect('ValhallaMatrix' in mod).toBe(true)
    expect('MapboxGeocoder' in mod).toBe(true)
    expect('GoogleGeocoder' in mod).toBe(true)
    expect('MaptilerGeocoder' in mod).toBe(true)
    expect('PhotonGeocoder' in mod).toBe(true)
  })
})
