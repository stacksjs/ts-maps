import type { MapOptions } from 'ts-maps'
import { useEffect, useRef } from 'react'
import { VectorMap as TSVectorMap } from 'ts-maps'
import worldMap from 'ts-maps/world'

export interface VectorMapProps extends Omit<React.HTMLProps<HTMLDivElement>, 'ref'> {
  options?: Partial<Omit<MapOptions, 'selector'>>
  width?: number | string
  height?: number | string
  onMapInit?: (map: TSVectorMap) => void
}

export function VectorMap({
  options = {},
  width = 650,
  height = 350,
  style,
  onMapInit,
  ...props
}: VectorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<TSVectorMap | null>(null)

  useEffect(() => {
    if (!containerRef.current)
      return

    // Add default world map if not specified
    TSVectorMap.addMap('world', worldMap)

    const map = new TSVectorMap({
      selector: `#${containerRef.current.id}`,
      map: {
        name: 'world',
        ...options.map,
      },
      ...options,
    })

    mapRef.current = map
    onMapInit?.(map)

    return () => {
      if (mapRef.current) {
        // Clean up map instance
        mapRef.current = null
      }
    }
  }, [options, onMapInit])

  const containerStyle: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    ...style,
  }

  return (
    <div
      {...props}
      ref={containerRef}
      id={`vector-map-${Math.random().toString(36).slice(2, 11)}`}
      style={containerStyle}
    />
  )
}
