import type { Map as MapInstance } from 'ts-maps'
import type { Ref } from 'vue'
import { inject } from 'vue'
import { mapKey } from './provideKey'

/**
 * Returns a `Ref` to the current `Map`. Throws if used outside of `<MapInstance>`.
 */
export function useMap(): Ref<MapInstance | null> {
  const m = inject(mapKey, null)
  if (!m)
    throw new Error('useMap must be used within a <MapInstance> component')
  return m
}

export function useMapOptional(): Ref<MapInstance | null> | null {
  return inject(mapKey, null)
}
