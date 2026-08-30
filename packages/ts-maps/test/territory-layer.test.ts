import type { Position } from '../src/core-map/geo/area'
import { describe, expect, test } from 'bun:test'
import { TerritoryStore } from '../src/core-map/game/TerritoryStore'
import { RunTrailLayer } from '../src/core-map/layer/RunTrailLayer'
import { TerritoryLayer } from '../src/core-map/layer/TerritoryLayer'
import { TsMap } from '../src/core-map'

// The harness has no rasteriser, so what is checked here is the layer's
// behaviour rather than its pixels: that it follows a store, that colours stay
// put once assigned, that hit-testing answers, and that it detaches cleanly.
// The drawing itself is verified in a browser.

function makeMap(): TsMap {
  const container = document.createElement('div')
  container.style.width = '600px'
  container.style.height = '400px'
  document.body.appendChild(container)
  return new TsMap(container, {
    center: [34.02, -118.47],
    zoom: 15,
    zoomAnimation: false,
    fadeAnimation: false,
  })
}

function square(lng: number, lat: number, metres: number): Position[] {
  const dLat = metres / 111320
  const dLng = metres / (111320 * Math.cos((lat * Math.PI) / 180))
  return [
    [lng, lat],
    [lng + dLng, lat],
    [lng + dLng, lat + dLat],
    [lng, lat + dLat],
    [lng, lat],
  ]
}

describe('TerritoryLayer', () => {
  test('follows a store and reports its owners', () => {
    const store = new TerritoryStore()
    const layer = new TerritoryLayer({ store })

    store.capture('sam', square(-118.47, 34.02, 150))
    expect(layer._territories().map(([owner]) => owner)).toEqual(['sam'])

    store.capture('alex', square(-118.46, 34.02, 150))
    expect(layer._territories().map(([owner]) => owner).sort()).toEqual(['alex', 'sam'])
  })

  test('an owner keeps the same colour once it is assigned', () => {
    // Territory changing colour between frames would read as it changing
    // hands.
    const layer = new TerritoryLayer()
    const first = layer.colorFor('sam')
    layer.colorFor('alex')
    expect(layer.colorFor('sam')).toBe(first)
  })

  test('two owners get different colours', () => {
    const layer = new TerritoryLayer()
    expect(layer.colorFor('sam')).not.toBe(layer.colorFor('alex'))
  })

  test('an explicit colour wins over the palette', () => {
    const layer = new TerritoryLayer({ styles: { sam: { color: '#ff0000' } } })
    expect(layer.colorFor('sam')).toBe('#ff0000')
  })

  test('setOwnerStyle merges rather than replaces', () => {
    const layer = new TerritoryLayer({ styles: { sam: { color: '#ff0000', weight: 5 } } })
    layer.setOwnerStyle('sam', { fillOpacity: 0.5 })

    const style = layer._styleFor('sam')
    expect(style.color).toBe('#ff0000')
    expect(style.weight).toBe(5)
    expect(style.fillOpacity).toBe(0.5)
  })

  test('the viewer’s own ground is drawn with more emphasis', () => {
    // "Mine" and "theirs" have to read apart before any label does.
    const layer = new TerritoryLayer({ self: 'sam' })
    const mine = layer._styleFor('sam')
    const theirs = layer._styleFor('alex')

    expect(mine.fillOpacity).toBeGreaterThan(theirs.fillOpacity)
    expect(mine.weight).toBeGreaterThan(theirs.weight)
    expect(mine.glow).toBe(true)
    expect(theirs.glow).toBe(false)
  })

  test('territories can be set without a store', () => {
    const layer = new TerritoryLayer()
    layer.setTerritory('sam', [[square(-118.47, 34.02, 100)]])
    expect(layer._territories().map(([owner]) => owner)).toEqual(['sam'])
  })

  test('a capture queues an animation, and only while it is running', () => {
    const layer = new TerritoryLayer({ captureDuration: 500 })
    layer.animateCapture({ owner: 'sam', ring: square(-118.47, 34.02, 100) })
    expect(layer._animations.length).toBe(1)

    // Drawing after it has elapsed retires it.
    layer._animations[0].start -= 10000
    const ctx = fakeContext()
    layer._drawCaptures(ctx as any, p => ({ x: p[0], y: p[1] }))
    expect(layer._animations.length).toBe(0)
  })

  test('a zero duration disables the animation', () => {
    const layer = new TerritoryLayer({ captureDuration: 0 })
    layer.animateCapture({ owner: 'sam', ring: square(-118.47, 34.02, 100) })
    expect(layer._animations.length).toBe(0)
  })

  test('detaching a store stops it driving the layer', () => {
    const store = new TerritoryStore()
    const layer = new TerritoryLayer({ store })

    let redraws = 0
    layer.redraw = function counted() {
      redraws++
      return this
    }

    store.capture('sam', square(-118.47, 34.02, 100))
    expect(redraws).toBeGreaterThan(0)

    const before = redraws
    layer._detachStore()
    store.capture('sam', square(-118.46, 34.02, 100))
    // A layer that outlives its store must not keep drawing for it.
    expect(redraws).toBe(before)
  })

  test('mounts and unmounts on a real map', () => {
    const map = makeMap()
    const store = new TerritoryStore()
    store.capture('sam', square(-118.47, 34.02, 150))

    const layer = new TerritoryLayer({ store, self: 'sam' })
    const pane = map.getPane('overlayPane') as HTMLElement

    map.addLayer(layer as any)
    // Scoped to this map's own pane: earlier tests leave their containers in
    // the document, so a document-wide query would find theirs too.
    expect(pane.children.length).toBe(1)
    expect(layer._canvas?.className).toContain('tsmap-territory-canvas')

    map.removeLayer(layer as any)
    expect(pane.children.length).toBe(0)
  })

  test('hit-testing answers who holds a spot on screen', () => {
    const map = makeMap()
    const store = new TerritoryStore()
    store.capture('sam', square(-118.475, 34.018, 400))

    const layer = new TerritoryLayer({ store })
    map.addLayer(layer as any)

    const inside = map.latLngToContainerPoint([34.0195, -118.4735])
    expect(layer.ownerAtContainerPoint(inside)).toBe('sam')

    const outside = map.latLngToContainerPoint([34.05, -118.40])
    expect(layer.ownerAtContainerPoint(outside)).toBeNull()
  })

  test('hit-testing works without a store too', () => {
    const map = makeMap()
    const layer = new TerritoryLayer()
    layer.setTerritory('sam', [[square(-118.475, 34.018, 400)]])
    map.addLayer(layer as any)

    const inside = map.latLngToContainerPoint([34.0195, -118.4735])
    expect(layer.ownerAtContainerPoint(inside)).toBe('sam')
  })
})

describe('RunTrailLayer', () => {
  test('collects points and hands the track back', () => {
    const layer = new RunTrailLayer()
    layer.addPoint([-118.47, 34.02])
    layer.addPoint([-118.469, 34.02])
    expect(layer.track.length).toBe(2)
  })

  test('setTrack replaces, clear empties', () => {
    const layer = new RunTrailLayer()
    layer.setTrack([[-118.47, 34.02], [-118.469, 34.02], [-118.468, 34.021]])
    expect(layer.track.length).toBe(3)
    layer.clear()
    expect(layer.track.length).toBe(0)
  })

  test('mounts and unmounts on a real map', () => {
    const map = makeMap()
    const layer = new RunTrailLayer()
    const pane = map.getPane('overlayPane') as HTMLElement

    map.addLayer(layer as any)
    expect(pane.children.length).toBe(1)
    expect(layer._canvas?.className).toContain('tsmap-run-trail-canvas')

    map.removeLayer(layer as any)
    expect(pane.children.length).toBe(0)
  })

  test('an empty track draws nothing and does not throw', () => {
    const map = makeMap()
    const layer = new RunTrailLayer()
    map.addLayer(layer as any)
    expect(() => layer._draw()).not.toThrow()
  })
})

/** Enough of a 2D context to record the calls these tests care about. */
function fakeContext(): Record<string, any> {
  const ctx: Record<string, any> = {
    canvas: { width: 600, height: 400 },
    globalAlpha: 1,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    fill() {},
    stroke() {},
    clip() {},
    setLineDash() {},
    fillText() {},
    strokeText() {},
    setTransform() {},
    clearRect() {},
  }
  return ctx
}
