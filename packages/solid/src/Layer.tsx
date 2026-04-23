import type { JSX } from 'solid-js'
import { onCleanup, onMount } from 'solid-js'
import { useMap } from './context'

export interface LayerProps {
  id: string
  type: 'fill' | 'line' | 'circle' | 'symbol' | 'raster' | 'background' | 'fill-extrusion'
  source?: string
  sourceLayer?: string
  paint?: Record<string, unknown>
  layout?: Record<string, unknown>
  filter?: unknown
}

export function Layer(props: LayerProps): JSX.Element {
  onMount(() => {
    const map = useMap() as unknown as {
      addStyleLayer?: (spec: Record<string, unknown>) => void
    } | null
    if (!map?.addStyleLayer)
      return
    const spec: Record<string, unknown> = { id: props.id, type: props.type }
    if (props.source) spec.source = props.source
    if (props.sourceLayer) spec['source-layer'] = props.sourceLayer
    if (props.paint) spec.paint = props.paint
    if (props.layout) spec.layout = props.layout
    if (props.filter !== undefined) spec.filter = props.filter
    map.addStyleLayer(spec)
  })

  onCleanup(() => {
    const map = useMap() as unknown as { removeStyleLayer?: (id: string) => void } | null
    map?.removeStyleLayer?.(props.id)
  })

  return null
}
