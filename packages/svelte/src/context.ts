import type { Map as MapInstance } from 'ts-maps'

export const MAP_CONTEXT_KEY: symbol = Symbol('ts-maps/svelte/map')

export interface MapContextValue {
  getMap: () => MapInstance | null
}
