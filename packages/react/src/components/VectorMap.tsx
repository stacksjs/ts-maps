import type { MapOptions } from 'ts-maps'
import { useEffect, useRef, useState } from 'react'
import worldMap, { VectorMap as TSVectorMap } from 'ts-maps'

export interface VectorMapProps extends Omit<React.HTMLProps<HTMLDivElement>, 'ref'> {
  options: Omit<MapOptions, 'selector'>
  mapName: string
  width?: number | string
  height?: number | string
  onRegionClick?: (event: MouseEvent, code: string) => void
  onMarkerClick?: (event: MouseEvent, index: string) => void
  onLoaded?: () => void
  onViewportChange?: (x: number, y: number, z: number) => void
  onRegionSelected?: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => void
  onMarkerSelected?: (event: MouseEvent, index: string, isSelected: boolean, selectedMarkers: string[]) => void
  onRegionTooltipShow?: (event: Event, tooltip: any, code: string) => void
  onMarkerTooltipShow?: (event: Event, tooltip: any, index: string) => void
  children?: React.ReactNode
}

export function VectorMap({
  options,
  mapName,
  width = '100%',
  height = '400px',
  onRegionClick,
  onMarkerClick,
  onLoaded,
  onViewportChange,
  onRegionSelected,
  onMarkerSelected,
  onRegionTooltipShow,
  onMarkerTooltipShow,
  style,
  children,
  ...props
}: VectorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<TSVectorMap | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!containerRef.current)
      return

    const containerId = containerRef.current.id || `ts-maps-${Math.random().toString(36).substring(2, 11)}`
    containerRef.current.id = containerId

    const map = new TSVectorMap({
      ...options,
      map: {
        name: mapName,
        ...options.map,
      },
      selector: `#${containerId}`,
      onRegionClick: (event: MouseEvent, code: string) => {
        onRegionClick?.(event, code)
      },
      onRegionSelected: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => {
        onRegionSelected?.(event, code, isSelected, selectedRegions)
      },
      onMarkerClick: (event: MouseEvent, index: string) => {
        onMarkerClick?.(event, index)
      },
      onMarkerSelected: (event: MouseEvent, index: string, isSelected: boolean, selectedMarkers: string[]) => {
        onMarkerSelected?.(event, index, isSelected, selectedMarkers)
      },
      onViewportChange: (x: number, y: number, z: number) => {
        onViewportChange?.(x, y, z)
      },
      onRegionTooltipShow: (event: Event, tooltip: any, code: string) => {
        onRegionTooltipShow?.(event, tooltip, code)
      },
      onMarkerTooltipShow: (event: Event, tooltip: any, index: string) => {
        onMarkerTooltipShow?.(event, tooltip, index)
      },
      onLoaded: () => {
        setLoading(false)
        onLoaded?.()
      },
    })

    mapRef.current = map

    return () => {
      if (mapRef.current) {
        mapRef.current = null
      }
    }
  }, [options, mapName, onRegionClick, onMarkerClick, onLoaded, onViewportChange, onRegionSelected, onMarkerSelected, onRegionTooltipShow, onMarkerTooltipShow])

  const containerStyle: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    position: 'relative',
    ...style,
  }

  return (
    <div
      {...props}
      ref={containerRef}
      style={containerStyle}
    >
      {loading && (
        <div className="ts-maps-loading">
          {children || 'Loading map...'}
        </div>
      )}
    </div>
  )
}

// Add CSS styles for loading state
const styles = `
.ts-maps-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  color: #666;
}
`

// Inject styles if not already present
if (typeof document !== 'undefined' && !document.getElementById('ts-maps-styles')) {
  const styleElement = document.createElement('style')
  styleElement.id = 'ts-maps-styles'
  styleElement.textContent = styles
  document.head.appendChild(styleElement)
}
