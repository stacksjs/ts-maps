import type { TsMap } from 'ts-maps'

export const MAP_CONTEXT_KEY: symbol = Symbol('ts-maps/svelte/map')

export interface MapContextValue {
  getMap: () => TsMap | null
}
