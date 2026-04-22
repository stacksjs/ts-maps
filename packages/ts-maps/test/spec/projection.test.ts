// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/geo/projection/ProjectionSpec.js
import { describe, it } from 'bun:test'
import { expectNear, LatLng, Point, Projection } from './_harness'

describe('Projection.Mercator', () => {
  const p = Projection.Mercator

  describe('#project', () => {
    // Ported from ProjectionSpec.js#L9
    it('projects a center point', () => {
      expectNear(p.project(new LatLng(0, 0)), [0, 0])
    })

    // Ported from ProjectionSpec.js#L14
    it('projects the northeast corner of the world', () => {
      expectNear(p.project(new LatLng(85.0840591556, 180)), [20037508, 20037508])
    })

    // Ported from ProjectionSpec.js#L18
    it('projects the southwest corner of the world', () => {
      expectNear(p.project(new LatLng(-85.0840591556, -180)), [-20037508, -20037508])
    })

    // Ported from ProjectionSpec.js#L22
    it('projects other points', () => {
      expectNear(p.project(new LatLng(50, 30)), [3339584, 6413524])

      // from https://github.com/Leaflet/Leaflet/issues/1578
      expectNear(p.project(new LatLng(51.9371170300465, 80.11230468750001)), [8918060.964088084, 6755099.410887127])
    })
  })

  describe('#unproject', () => {
    function pr(point: Point): Point {
      return p.project(p.unproject(point))
    }

    // Ported from ProjectionSpec.js#L36
    it('unprojects a center point', () => {
      expectNear(pr(new Point(0, 0)), [0, 0])
    })

    // Ported from ProjectionSpec.js#L40
    it('unprojects pi points', () => {
      expectNear(pr(new Point(-Math.PI, Math.PI)), [-Math.PI, Math.PI])
      expectNear(pr(new Point(-Math.PI, -Math.PI)), [-Math.PI, -Math.PI])

      expectNear(pr(new Point(0.523598775598, 1.010683188683)), [0.523598775598, 1.010683188683])
    })

    // Ported from ProjectionSpec.js#L47
    it('unprojects other points', () => {
      // from https://github.com/Leaflet/Leaflet/issues/1578
      pr(new Point(8918060.964088084, 6755099.410887127))
    })
  })
})

describe('Projection.SphericalMercator', () => {
  const p = Projection.SphericalMercator

  describe('#project', () => {
    // Ported from ProjectionSpec.js#L58
    it('projects a center point', () => {
      expectNear(p.project(new LatLng(0, 0)), [0, 0])
    })

    // Ported from ProjectionSpec.js#L63
    it('projects the northeast corner of the world', () => {
      expectNear(p.project(new LatLng(85.0511287798, 180)), [20037508, 20037508])
    })

    // Ported from ProjectionSpec.js#L67
    it('projects the southwest corner of the world', () => {
      expectNear(p.project(new LatLng(-85.0511287798, -180)), [-20037508, -20037508])
    })

    // Ported from ProjectionSpec.js#L71
    it('projects other points', () => {
      expectNear(p.project(new LatLng(50, 30)), [3339584, 6446275])

      // from https://github.com/Leaflet/Leaflet/issues/1578
      expectNear(p.project(new LatLng(51.9371170300465, 80.11230468750001)), [8918060.96409, 6788763.38325])
    })
  })

  describe('#unproject', () => {
    function pr(point: Point): Point {
      return p.project(p.unproject(point))
    }

    // Ported from ProjectionSpec.js#L85
    it('unprojects a center point', () => {
      expectNear(pr(new Point(0, 0)), [0, 0])
    })

    // Ported from ProjectionSpec.js#L89
    it('unprojects pi points', () => {
      expectNear(pr(new Point(-Math.PI, Math.PI)), [-Math.PI, Math.PI])
      expectNear(pr(new Point(-Math.PI, -Math.PI)), [-Math.PI, -Math.PI])

      expectNear(pr(new Point(0.523598775598, 1.010683188683)), [0.523598775598, 1.010683188683])
    })

    // Ported from ProjectionSpec.js#L96
    it('unprojects other points', () => {
      // from https://github.com/Leaflet/Leaflet/issues/1578
      pr(new Point(8918060.964088084, 6755099.410887127))
    })
  })
})
