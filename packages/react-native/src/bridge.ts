import type { BridgeEnvelope } from './types'

let counter = 0

export function nextId(): string {
  counter = (counter + 1) | 0
  return `m${Date.now().toString(36)}_${counter.toString(36)}`
}

export function encode(env: BridgeEnvelope): string {
  return JSON.stringify(env)
}

/**
 * Parse a raw string received over `onMessage`. Returns `null` when the
 * payload is malformed — callers should ignore unparseable messages rather
 * than throwing, since WebViews occasionally emit other traffic.
 */
export function decode(raw: string): BridgeEnvelope | null {
  if (typeof raw !== 'string' || raw.length === 0)
    return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object')
      return null
    const obj = parsed as { type?: unknown, id?: unknown }
    if (typeof obj.type !== 'string' || typeof obj.id !== 'string')
      return null
    return parsed as BridgeEnvelope
  }
  catch {
    return null
  }
}
