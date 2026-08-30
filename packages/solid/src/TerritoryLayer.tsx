import type { JSX } from 'solid-js'
import type { TerritoryStore, TerritoryStyle } from 'ts-maps'
import { createEffect, onCleanup } from 'solid-js'
import { RunTrailLayer as TsRunTrailLayer, TerritoryLayer as TsTerritoryLayer } from 'ts-maps'
import { useMap } from './context'

export interface TerritoryLayerProps {
  store?: TerritoryStore
  styles?: Record<string, TerritoryStyle>
  self?: string
  captureDuration?: number
  labelMinZoom?: number
  units?: 'metric' | 'imperial'
  options?: Record<string, unknown>
}

/**
 * Territories on the map.
 *
 * ```tsx
 * <Map center={[34.02, -118.47]} zoom={16}>
 *   <TerritoryLayer store={store} self="me" />
 * </Map>
 * ```
 */
export function TerritoryLayer(props: TerritoryLayerProps): JSX.Element {
  let layer: InstanceType<typeof TsTerritoryLayer> | null = null
  // Captured when the layer is built, so teardown does not depend on the
  // context still being readable.
  let attachedTo: any = null

  // An effect rather than onMount: the map arrives through a signal, so a
  // layer mounted in the same tick would otherwise find nothing to attach to.
  createEffect(() => {
    const map = useMap()
    if (!map || layer)
      return
    layer = new TsTerritoryLayer({
      ...props.options,
      ...(props.store ? { store: props.store } : {}),
      ...(props.styles ? { styles: props.styles } : {}),
      ...(props.self === undefined ? {} : { self: props.self }),
      ...(props.captureDuration === undefined ? {} : { captureDuration: props.captureDuration }),
      ...(props.labelMinZoom === undefined ? {} : { labelMinZoom: props.labelMinZoom }),
      ...(props.units === undefined ? {} : { units: props.units }),
    })
    ;(map as unknown as { addLayer: (l: any) => void }).addLayer(layer)
    attachedTo = map
  })

  createEffect(() => {
    const store = props.store
    if (layer && store)
      layer.setStore(store)
  })

  onCleanup(() => {
    if (layer && attachedTo)
      (attachedTo as { removeLayer: (l: any) => void }).removeLayer(layer)
    layer = null
    attachedTo = null
  })

  return null
}

export interface RunTrailLayerProps {
  track?: number[][]
  color?: string
  weight?: number
  showPotential?: boolean
  options?: Record<string, unknown>
}

/** The live trail behind a runner. */
export function RunTrailLayer(props: RunTrailLayerProps): JSX.Element {
  let layer: InstanceType<typeof TsRunTrailLayer> | null = null
  let attachedTo: any = null

  createEffect(() => {
    const map = useMap()
    if (!map || layer)
      return
    layer = new TsRunTrailLayer({
      ...props.options,
      ...(props.color === undefined ? {} : { color: props.color }),
      ...(props.weight === undefined ? {} : { weight: props.weight }),
      ...(props.showPotential === undefined ? {} : { showPotential: props.showPotential }),
    })
    ;(map as unknown as { addLayer: (l: any) => void }).addLayer(layer)
    attachedTo = map
  })

  createEffect(() => {
    const track = props.track
    if (layer && track)
      layer.setTrack(track)
  })

  onCleanup(() => {
    if (layer && attachedTo)
      (attachedTo as { removeLayer: (l: any) => void }).removeLayer(layer)
    layer = null
    attachedTo = null
  })

  return null
}
