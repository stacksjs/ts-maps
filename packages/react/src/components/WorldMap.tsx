import type { MapOptions } from 'ts-maps'
import { useEffect, useMemo, useRef } from 'react'
import { VectorMap as TSVectorMap } from 'ts-maps'
import worldMap from 'ts-maps/world'
import './map-components.css'

export interface WorldMapProps extends Omit<React.HTMLProps<HTMLDivElement>, 'ref'> {
  options: Omit<MapOptions, 'selector'>
  height?: string
  mapKey?: string | number // Optional key for forcing re-renders
  onRegionClick?: (event: MouseEvent, code: string) => void
  onMarkerClick?: (event: MouseEvent, index: string) => void
  onLoaded?: () => void
  onViewportChange?: (x: number, y: number, z: number) => void
  onRegionSelected?: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => void
  onMarkerSelected?: (event: MouseEvent, index: string, isSelected: boolean, selectedMarkers: string[]) => void
  onRegionTooltipShow?: (event: Event, tooltip: any, code: string) => void
  onMarkerTooltipShow?: (event: Event, tooltip: any, index: string) => void
}

export function WorldMap({
  options,
  height = '500px',
  mapKey,
  onRegionClick,
  onMarkerClick,
  onLoaded,
  onViewportChange,
  onRegionSelected,
  onMarkerSelected,
  onRegionTooltipShow,
  onMarkerTooltipShow,
  style,
  ...props
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<TSVectorMap | null>(null)

  // Generate a key based on options to force re-render when options change significantly
  const computedMapKey = useMemo(() => {
    if (mapKey !== undefined)
      return mapKey

    const optionsHash = JSON.stringify({
      backgroundColor: options.backgroundColor,
      zoomOnScroll: options.zoomOnScroll,
      regionsSelectable: options.regionsSelectable,
      markersSelectable: options.markersSelectable,
      visualizeData: options.visualizeData,
      markers: options.markers?.length,
    })

    return `world-map-${optionsHash.length}-${Date.now()}`
  }, [mapKey, options])

  useEffect(() => {
    if (!containerRef.current)
      return

    // Add World map
    TSVectorMap.addMap('world', worldMap)

    const map = new TSVectorMap({
      selector: `#${containerRef.current.id}`,
      map: {
        name: 'world',
        ...options.map,
      },
      ...options,
    })

    // Note: Event handling is managed by ts-maps internally
    // The library handles events based on the options passed

    mapRef.current = map

    return () => {
      if (mapRef.current) {
        mapRef.current = null
      }
    }
  }, [computedMapKey, options, onRegionClick, onMarkerClick, onLoaded, onViewportChange, onRegionSelected, onMarkerSelected, onRegionTooltipShow, onMarkerTooltipShow])

  const containerStyle: React.CSSProperties = {
    height,
    ...style,
  }

  return (
    <div
      {...props}
      ref={containerRef}
      id={`world-map-${Math.random().toString(36).slice(2, 11)}`}
      style={containerStyle}
    >
      <div className="world-map-loading">
        Loading World map...
      </div>
    </div>
  )
}
