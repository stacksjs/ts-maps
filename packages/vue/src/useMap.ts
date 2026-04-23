import type { TsMap } from 'ts-maps'
import type { Ref } from 'vue'
import { inject } from 'vue'
import { mapKey } from './provideKey'

/**
 * Returns a `Ref` to the current `TsMap`. Throws if used outside of `<TsMap>`.
 */
export function useMap(): Ref<TsMap | null> {
  const m = inject(mapKey, null)
  if (!m)
    throw new Error('useMap must be used within a <TsMap> component')
  return m
}

export function useMapOptional(): Ref<TsMap | null> | null {
  return inject(mapKey, null)
}
