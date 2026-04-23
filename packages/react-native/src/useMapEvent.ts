import type { MutableRefObject } from 'react'
import type { BridgeEnvelope } from './types'
import { useEffect } from 'react'

// eslint-disable-next-line no-unused-vars
export type MapEventHandler<T> = (payload: T) => void

/**
 * Forward a specific bridge event type to a callback. Intended for
 * consumers who want to bypass the named `onLoad`/`onMove`/… props.
 *
 * The `registry` ref is mutated by `<MapView>` on every render to expose
 * its internal listener registry; this hook only touches it inside
 * `useEffect`, so SSR and offscreen renders stay inert.
 */
export function useMapEvent<T = unknown>(
  registry: MutableRefObject<Map<string, Set<(env: BridgeEnvelope) => void>> | null>,
  type: BridgeEnvelope['type'],
  handler: MapEventHandler<T>,
): void {
  useEffect(() => {
    const reg = registry.current
    if (!reg)
      return
    const fn = (env: BridgeEnvelope): void => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler((env as any).payload as T)
    }
    let set = reg.get(type)
    if (!set) {
      set = new Set()
      reg.set(type, set)
    }
    set.add(fn)
    return () => {
      const s = reg.get(type)
      if (s)
        s.delete(fn)
    }
  }, [registry, type, handler])
}
