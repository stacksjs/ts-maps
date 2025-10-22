import type { MapOptions } from 'ts-maps'
import { useMemo } from 'react'
import { VectorMap as TSVectorMap } from 'ts-maps'
import usMap from 'ts-maps/us-aea-en'
import { VectorMap } from '../VectorMap'
import '../map-components.css'

export interface UnitedStatesProps extends Omit<React.HTMLProps<HTMLDivElement>, 'ref'> {
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

export function UnitedStates({
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
}: UnitedStatesProps) {
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

    return `us-map-${optionsHash.length}-${Date.now()}`
  }, [mapKey, options])

  // Add US map data
  TSVectorMap.addMap('us-aea', usMap)

  const containerStyle: React.CSSProperties = {
    height,
    ...style,
  }

  return (
    <VectorMap
      key={computedMapKey}
      options={options}
      mapName="us-aea"
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
      <div className="us-map-loading">
        Loading United States map...
      </div>
    </VectorMap>
  )
}
