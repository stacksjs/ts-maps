import type { MapOptions } from 'ts-maps'
import { useEffect, useRef, useMemo } from 'react'
import { VectorMap as TSVectorMap } from 'ts-maps'
import brasilMap from 'ts-maps/maps/brasil'
import './map-components.css'

export interface BrasilProps extends Omit<React.HTMLProps<HTMLDivElement>, 'ref'> {
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

export function Brasil({
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
}: BrasilProps) {
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

    return `brasil-map-${optionsHash.length}-${Date.now()}`
  }, [mapKey, options])

  useEffect(() => {
    if (!containerRef.current)
      return

    // Add Brasil map
    TSVectorMap.addMap('brasil', brasilMap)

    const map = new TSVectorMap({
      selector: `#${containerRef.current.id}`,
      map: {
        name: 'brasil',
        ...options.map,
      },
      ...options,
    })

    // Set up event listeners
    if (onRegionClick) {
      map.on('regionClick', onRegionClick)
    }
    if (onMarkerClick) {
      map.on('markerClick', onMarkerClick)
    }
    if (onLoaded) {
      map.on('loaded', onLoaded)
    }
    if (onViewportChange) {
      map.on('viewportChange', onViewportChange)
    }
    if (onRegionSelected) {
      map.on('regionSelected', onRegionSelected)
    }
    if (onMarkerSelected) {
      map.on('markerSelected', onMarkerSelected)
    }
    if (onRegionTooltipShow) {
      map.on('regionTooltipShow', onRegionTooltipShow)
    }
    if (onMarkerTooltipShow) {
      map.on('markerTooltipShow', onMarkerTooltipShow)
    }

    mapRef.current = map

    return () => {
      if (mapRef.current) {
        // Clean up event listeners
        if (onRegionClick) {
          mapRef.current.off('regionClick', onRegionClick)
        }
        if (onMarkerClick) {
          mapRef.current.off('markerClick', onMarkerClick)
        }
        if (onLoaded) {
          mapRef.current.off('loaded', onLoaded)
        }
        if (onViewportChange) {
          mapRef.current.off('viewportChange', onViewportChange)
        }
        if (onRegionSelected) {
          mapRef.current.off('regionSelected', onRegionSelected)
        }
        if (onMarkerSelected) {
          mapRef.current.off('markerSelected', onMarkerSelected)
        }
        if (onRegionTooltipShow) {
          mapRef.current.off('regionTooltipShow', onRegionTooltipShow)
        }
        if (onMarkerTooltipShow) {
          mapRef.current.off('markerTooltipShow', onMarkerTooltipShow)
        }
        
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
      id={`brasil-map-${Math.random().toString(36).slice(2, 11)}`}
      style={containerStyle}
    >
      <div className="brasil-map-loading">
        Loading Brasil map...
      </div>
    </div>
  )
}
