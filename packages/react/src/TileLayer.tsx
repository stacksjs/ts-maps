import { useEffect, useRef } from 'react'
import { TileLayer as TsTileLayer } from 'ts-maps'
import { useMap } from './useMap'

export interface TileLayerProps {
  url: string
  options?: Record<string, unknown>
}

export function TileLayer({ url, options }: TileLayerProps): null {
  const map = useMap()
  const layerRef = useRef<InstanceType<typeof TsTileLayer> | null>(null)

  useEffect(() => {
    const layer = new TsTileLayer(url, options)
    ;(map as unknown as { addLayer: (l: any) => void }).addLayer(layer)
    layerRef.current = layer
    return () => {
      ;(map as unknown as { removeLayer: (l: any) => void }).removeLayer(layer)
      layerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer)
      return
    ;(layer as unknown as { setUrl: (u: string) => void }).setUrl(url)
  }, [url])

  return null
}
