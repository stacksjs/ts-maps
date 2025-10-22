import type { MapOptions } from 'ts-maps'
import { useMemo } from 'react'
import { VectorMap as TSVectorMap } from 'ts-maps'
import brasilMap from 'ts-maps/brasil'
import { VectorMap } from '../VectorMap'
import '../map-components.css'

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

  // Add Brasil map data
  TSVectorMap.addMap('brasil', brasilMap)

  const containerStyle: React.CSSProperties = {
    height,
    ...style,
  }

  return (
    <VectorMap
      key={computedMapKey}
      options={options}
      mapName="brasil"
      height={height}
      style={containerStyle}
      onRegionClick={onRegionClick}
      onMarkerClick={onMarkerClick}
      onLoaded={onLoaded}
      onViewportChange={onViewportChange}
      onRegionSelected={onRegionSelected}
      onMarkerSelected={onMarkerSelected}
      onRegionTooltipShow={onRegionTooltipShow}
      onMarkerTooltipShow={onMarkerTooltipShow}
      {...props}
    >
      <div className="brasil-map-loading">
        Loading Brasil map...
      </div>
    </VectorMap>
  )
}
