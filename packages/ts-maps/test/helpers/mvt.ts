/**
 * A small MVT writer for tests: tiles described as data, encoded with the
 * library's own Pbf, so fixtures stay readable.
 */
import { Pbf } from '../../src/core-map/proto'

export type Value = string | number | boolean
export interface FeatureSpec {
  type: 1 | 2 | 3
  props: Record<string, Value>
  lines: Array<Array<[number, number]>>
}

function zz(n: number): number {
  return (n << 1) ^ (n >> 31)
}

export function encodeTile(layers: Record<string, FeatureSpec[]>): Uint8Array {
  const pbf = new Pbf()
  for (const [name, features] of Object.entries(layers)) {
    const keys: string[] = []
    const values: Value[] = []
    const tagged = features.map((f) => {
      const tags: number[] = []
      for (const [k, v] of Object.entries(f.props)) {
        let ki = keys.indexOf(k)
        if (ki < 0)
          ki = keys.push(k) - 1
        let vi = values.indexOf(v)
        if (vi < 0)
          vi = values.push(v) - 1
        tags.push(ki, vi)
      }
      const geometry: number[] = []
      let cx = 0
      let cy = 0
      for (const line of f.lines) {
        geometry.push((1 & 0x7) | (1 << 3), zz(line[0]![0] - cx), zz(line[0]![1] - cy))
        cx = line[0]![0]
        cy = line[0]![1]
        if (line.length > 1) {
          geometry.push((2 & 0x7) | ((line.length - 1) << 3))
          for (const [x, y] of line.slice(1)) {
            geometry.push(zz(x - cx), zz(y - cy))
            cx = x
            cy = y
          }
        }
      }
      return { type: f.type, tags, geometry }
    })
    pbf.writeMessage(3, (_: unknown, p: Pbf) => {
      p.writeVarintField(15, 2)
      p.writeStringField(1, name)
      for (const f of tagged) {
        p.writeMessage(2, (_f: unknown, q: Pbf) => {
          q.writePackedVarint(2, f.tags)
          q.writeVarintField(3, f.type)
          q.writePackedVarint(4, f.geometry)
        }, f)
      }
      for (const k of keys)
        p.writeStringField(3, k)
      for (const v of values) {
        p.writeMessage(4, (_v: unknown, q: Pbf) => {
          if (typeof v === 'string')
            q.writeStringField(1, v)
          else if (typeof v === 'boolean')
            q.writeBooleanField(7, v)
          else if (Number.isInteger(v))
            q.writeSVarintField(6, v)
          else
            q.writeDoubleField(3, v)
        }, v)
      }
      p.writeVarintField(5, 4096)
    }, null)
  }
  return pbf.finish()
}

export const road = (props: Record<string, Value>, ...points: Array<[number, number]>): FeatureSpec => ({ type: 2, props, lines: [points] })
