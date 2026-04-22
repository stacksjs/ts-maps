// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/layer/LayerGroupSpec.js
import { describe, expect, it } from 'bun:test'
import { GeoJSON, Layer, LayerGroup, Marker } from './_harness'

describe('LayerGroup', () => {
  describe('#hasLayer', () => {
    // Ported from LayerGroupSpec.js#L6
    it('throws when called without proper argument', () => {
      const lg = new LayerGroup()
      const hasLayer = lg.hasLayer.bind(lg)
      expect(() => hasLayer(new Layer())).not.toThrow()

      expect(() => hasLayer(undefined as any)).toThrow()
      expect(() => hasLayer(null as any)).toThrow()
      expect(() => hasLayer(false as any)).toThrow()
      expect(() => (hasLayer as any)()).toThrow()
    })
  })

  describe('#addLayer', () => {
    // Ported from LayerGroupSpec.js#L19
    it('adds a layer', () => {
      const lg = new LayerGroup()
      const marker = new Marker([0, 0])

      expect(lg.addLayer(marker)).toEqual(lg)

      expect(lg.hasLayer(marker)).toBe(true)
    })
  })

  describe('#removeLayer', () => {
    // Ported from LayerGroupSpec.js#L30
    it('removes a layer', () => {
      const lg = new LayerGroup()
      const marker = new Marker([0, 0])

      lg.addLayer(marker)
      expect(lg.removeLayer(marker)).toEqual(lg)

      expect(lg.hasLayer(marker)).toBe(false)
    })
  })

  describe('#clearLayers', () => {
    // Ported from LayerGroupSpec.js#L42
    it('removes all layers', () => {
      const lg = new LayerGroup()
      const marker = new Marker([0, 0])

      lg.addLayer(marker)
      expect(lg.clearLayers()).toEqual(lg)

      expect(lg.hasLayer(marker)).toBe(false)
    })
  })

  describe('#getLayers', () => {
    // Ported from LayerGroupSpec.js#L54
    it('gets all layers', () => {
      const lg = new LayerGroup()
      const marker = new Marker([0, 0])

      lg.addLayer(marker)

      expect(lg.getLayers()).toEqual([marker])
    })
  })

  describe('#eachLayer', () => {
    // Ported from LayerGroupSpec.js#L65
    it('iterates over all layers', () => {
      const lg = new LayerGroup()
      const marker = new Marker([0, 0])
      const ctx = { foo: 'bar' }

      lg.addLayer(marker)

      lg.eachLayer(function (this: any, layer) {
        expect(layer).toEqual(marker)
        expect(this).toEqual(ctx)
      }, ctx)
    })
  })

  describe('#toGeoJSON', () => {
    // Ported from LayerGroupSpec.js#L80
    it('should return valid GeoJSON for a layer with a FeatureCollection', () => {
      const geoJSON = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Point',
              coordinates: [78.3984375, 56.9449741808516],
            },
          },
        ],
      }

      const lg = new LayerGroup()
      const layer = new GeoJSON(geoJSON as any)
      lg.addLayer(layer)

      // eslint-disable-next-line no-new
      new GeoJSON((lg as any).toGeoJSON())
    })
  })
})
