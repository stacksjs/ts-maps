/**
 * Phase 16 demo — a landmark and trees, after Apple Maps.
 *
 * Wildloop's OpenMapTiles basemap tilted over San Francisco. The
 * Transamerica Pyramid is a glTF model (built here in code, so the demo
 * needs no file) standing in for the extruded box the tiles have, and the
 * Presidio's woods are planted with trees once the map tilts.
 *
 * `?lat=…&lng=…&zoom=…` override the starting view.
 */

import type { GltfJson } from '../../packages/ts-maps/src/core-map'
import { control, landmark, trees, TsMap } from '../../packages/ts-maps/src/core-map'
import { loadBasemap } from './basemap'

const PYRAMID: [number, number] = [37.79520, -122.40280]
const PRESIDIO: [number, number] = [37.79380, -122.45980]

const params = new URLSearchParams(location.search)
const map = new TsMap('map', {
  center: [Number(params.get('lat') ?? 37.79380), Number(params.get('lng') ?? -122.40180)],
  zoom: Number(params.get('zoom') ?? 16.4),
  pitch: 60,
  bearing: -28,
  maxZoom: 19,
  zoomControl: false,
})
control.navigation().addTo(map)
void loadBasemap(map, 'light')

landmark({ model: transamerica(), position: PYRAMID }).addTo(map)
trees().addTo(map)

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-place]')) {
  button.addEventListener('click', () => {
    const presidio = button.dataset.place === 'presidio'
    map.flyTo(presidio ? PRESIDIO : [37.79380, -122.40180], presidio ? 16.2 : 16.4, { pitch: 60, bearing: presidio ? 20 : -28 })
  })
}

/**
 * The Pyramid, roughly: a 53 m square tapering to 14 m at 212 m, a spire
 * to 260 m, and the two elevator wings on its east and west faces.
 */
function transamerica(): GltfJson {
  const positions: number[] = []
  const colors: number[] = []
  const quad = (a: number[], b: number[], c: number[], d: number[], rgb: number[]): void => {
    tri(a, b, c, rgb)
    tri(a, c, d, rgb)
  }
  // Wound to face away from the tower's axis, whichever order the corners came in.
  const tri = (a: number[], b: number[], c: number[], rgb: number[]): void => {
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]
    const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
    const mid = [(a[0]! + b[0]! + c[0]!) / 3, (a[1]! + b[1]! + c[1]!) / 3, (a[2]! + b[2]! + c[2]!) / 3]
    const out = n[0]! * mid[0]! + n[2]! * mid[2]! + (n[1]! * (mid[1]! - 130)) * 0.01
    for (const p of out >= 0 ? [a, b, c] : [a, c, b])
      positions.push(p[0]!, p[1]!, p[2]!)
    for (let k = 0; k < 3; k++)
      colors.push(rgb[0]!, rgb[1]!, rgb[2]!, 1)
  }
  const ring = (half: number, y: number): number[][] => [[-half, y, -half], [half, y, -half], [half, y, half], [-half, y, half]]
  const WHITE = [0.93, 0.91, 0.87]
  const GLASS = [0.62, 0.68, 0.74]
  const bottom = ring(26.5, 0)
  const top = ring(7, 212)
  for (let k = 0; k < 4; k++)
    quad(bottom[k]!, bottom[(k + 1) % 4]!, top[(k + 1) % 4]!, top[k]!, WHITE)
  quad(top[0]!, top[1]!, top[2]!, top[3]!, WHITE)
  for (let k = 0; k < 4; k++)
    tri(top[k]!, top[(k + 1) % 4]!, [0, 260, 0], WHITE)
  // Wings: east and west, from the 29th floor up.
  for (const side of [-1, 1]) {
    const x0 = side * 9
    const x1 = side * 15
    const box = [[x0, 150, -6], [x1, 150, -6], [x1, 150, 6], [x0, 150, 6], [x0, 222, -6], [x1, 222, -6], [x1, 222, 6], [x0, 222, 6]]
    quad(box[1]!, box[2]!, box[6]!, box[5]!, GLASS)
    quad(box[0]!, box[1]!, box[5]!, box[4]!, GLASS)
    quad(box[3]!, box[2]!, box[6]!, box[7]!, GLASS)
    quad(box[4]!, box[5]!, box[6]!, box[7]!, WHITE)
  }

  const position = new Float32Array(positions)
  const color = new Float32Array(colors)
  const bytes = new Uint8Array(position.byteLength + color.byteLength)
  bytes.set(new Uint8Array(position.buffer), 0)
  bytes.set(new Uint8Array(color.buffer), position.byteLength)
  let binary = ''
  for (const b of bytes)
    binary += String.fromCharCode(b)
  const count = positions.length / 3
  return {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 } }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count, type: 'VEC4' },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: position.byteLength }, { buffer: 0, byteOffset: position.byteLength, byteLength: color.byteLength }],
    buffers: [{ byteLength: bytes.length, uri: `data:application/octet-stream;base64,${btoa(binary)}` }],
  }
}

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map }
