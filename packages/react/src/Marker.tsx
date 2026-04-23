import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { Marker as TsMarker } from 'ts-maps'
import { useMap } from './useMap'

export interface MarkerProps {
  position: [number, number]
  options?: Record<string, unknown>
  onClick?: (e: any) => void
  onDragEnd?: (e: any) => void
  children?: ReactNode
}

/**
 * Adds a `Marker` to the surrounding `<Map>`. Updates its position when the
 * `position` prop changes and removes itself on unmount.
 */
export function Marker({ position, options, onClick, onDragEnd }: MarkerProps): null {
  const map = useMap()
  const markerRef = useRef<InstanceType<typeof TsMarker> | null>(null)

  useEffect(() => {
    const marker = new TsMarker(position, options)
    ;(map as unknown as { addLayer: (l: any) => void }).addLayer(marker)
    markerRef.current = marker
    return () => {
      ;(map as unknown as { removeLayer: (l: any) => void }).removeLayer(marker)
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  // Position updates are applied without rebuilding the marker.
  useEffect(() => {
    const marker = markerRef.current
    if (!marker)
      return
    ;(marker as unknown as { setLatLng: (p: [number, number]) => void }).setLatLng(position)
  }, [position[0], position[1]])

  useEffect(() => {
    const marker = markerRef.current
    if (!marker)
      return
    if (onClick)
      (marker as any).on('click', onClick)
    if (onDragEnd)
      (marker as any).on('dragend', onDragEnd)
    return () => {
      if (onClick)
        (marker as any).off('click', onClick)
      if (onDragEnd)
        (marker as any).off('dragend', onDragEnd)
    }
  }, [onClick, onDragEnd])

  return null
}
