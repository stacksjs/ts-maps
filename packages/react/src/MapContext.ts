import type { TsMap } from 'ts-maps'
import { createContext } from 'react'

export interface MapContextValue {
  map: TsMap | null
}

export const MapContext: React.Context<MapContextValue> = createContext<MapContextValue>({ map: null })
