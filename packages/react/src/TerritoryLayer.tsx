import type { TerritoryLayerOptions, TerritoryStore, TerritoryStyle } from 'ts-maps'
import { useEffect, useRef } from 'react'
import { RunTrailLayer as TsRunTrailLayer, TerritoryLayer as TsTerritoryLayer } from 'ts-maps'
import { useMap } from './useMap'

export interface TerritoryLayerProps {
  /** Where territories come from. Changes are followed automatically. */
  store?: TerritoryStore
  /** Per-owner styling. */
  styles?: Record<string, TerritoryStyle>
  /** The viewer, whose ground is drawn with the emphasis. */
  self?: string
  captureDuration?: number
  labelMinZoom?: number
  units?: 'metric' | 'imperial'
  options?: Partial<TerritoryLayerOptions>
}

/**
 * Territories on the map.
 *
 * ```tsx
 * <Map center={[34.02, -118.47]} zoom={16}>
 *   <TerritoryLayer store={store} self="me" />
 * </Map>
 * ```
 *
 * Swapping the store swaps what is drawn without rebuilding the layer, so the
 * capture animation is not interrupted by a re-render.
 */
export function TerritoryLayer({
  store,
  styles,
  self,
  captureDuration,
  labelMinZoom,
  units,
  options,
}: TerritoryLayerProps): null {
  const map = useMap()
  const layerRef = useRef<InstanceType<typeof TsTerritoryLayer> | null>(null)

  useEffect(() => {
    const layer = new TsTerritoryLayer({
      ...options,
      ...(store ? { store } : {}),
      ...(styles ? { styles } : {}),
      ...(self === undefined ? {} : { self }),
      ...(captureDuration === undefined ? {} : { captureDuration }),
      ...(labelMinZoom === undefined ? {} : { labelMinZoom }),
      ...(units === undefined ? {} : { units }),
    })
    ;(map as unknown as { addLayer: (l: any) => void }).addLayer(layer)
    layerRef.current = layer
    return () => {
      ;(map as unknown as { removeLayer: (l: any) => void }).removeLayer(layer)
      layerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useEffect(() => {
    if (store)
      layerRef.current?.setStore(store)
  }, [store])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer || !styles)
      return
    for (const [owner, style] of Object.entries(styles))
      layer.setOwnerStyle(owner, style)
  }, [styles])

  return null
}

export interface RunTrailLayerProps {
  /** The runner's path so far, as `[lng, lat]` positions. */
  track?: number[][]
  color?: string
  weight?: number
  /** Shade what closing the loop from here would enclose. */
  showPotential?: boolean
  options?: Record<string, unknown>
}

/** The live trail behind a runner. */
export function RunTrailLayer({ track, color, weight, showPotential, options }: RunTrailLayerProps): null {
  const map = useMap()
  const layerRef = useRef<InstanceType<typeof TsRunTrailLayer> | null>(null)

  useEffect(() => {
    const layer = new TsRunTrailLayer({
      ...options,
      ...(color === undefined ? {} : { color }),
      ...(weight === undefined ? {} : { weight }),
      ...(showPotential === undefined ? {} : { showPotential }),
    })
    ;(map as unknown as { addLayer: (l: any) => void }).addLayer(layer)
    layerRef.current = layer
    return () => {
      ;(map as unknown as { removeLayer: (l: any) => void }).removeLayer(layer)
      layerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useEffect(() => {
    if (track)
      layerRef.current?.setTrack(track)
  }, [track])

  return null
}
