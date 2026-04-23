import type { TsMap } from 'ts-maps'
import type { MapContextValue } from './context'
import { getContext } from 'svelte'
import { MAP_CONTEXT_KEY } from './context'

export function useMap(): TsMap | null {
  const ctx = getContext<MapContextValue | undefined>(MAP_CONTEXT_KEY)
  return ctx?.getMap() ?? null
}
