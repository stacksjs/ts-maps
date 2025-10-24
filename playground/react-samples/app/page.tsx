'use client'

import type { MapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps-react'
import { useState, useCallback, useMemo } from 'react'
import styles from './page.module.css'

type MapName = 'world' | 'world-merc' | 'us-merc' | 'us-mill' | 'us-lcc' | 'us-aea' | 'spain' | 'italy' | 'canada' | 'russia' | 'iraq' | 'brasil'

interface EventData {
  type: string
  code?: string
  marker?: any
  time: string
}

const mapOptions = [
  { value: 'world', label: 'World Map', projection: 'miller' },
  { value: 'world-merc', label: 'World (Mercator)', projection: 'mercator' },
  { value: 'us-merc', label: 'USA (Mercator)', projection: 'mercator' },
  { value: 'us-mill', label: 'USA (Miller)', projection: 'miller' },
  { value: 'us-lcc', label: 'USA (Lambert)', projection: 'lambert' },
  { value: 'us-aea', label: 'USA (Albers)', projection: 'albers' },
  { value: 'spain', label: 'Spain', projection: 'mercator' },
  { value: 'italy', label: 'Italy', projection: 'mercator' },
  { value: 'canada', label: 'Canada', projection: 'mercator' },
  { value: 'russia', label: 'Russia', projection: 'mercator' },
  { value: 'iraq', label: 'Iraq', projection: 'mercator' },
  { value: 'brasil', label: 'Brasil', projection: 'mercator' },
]

export default function IndexPage() {
  const [isDarkTheme, setIsDarkTheme] = useState(false)
  const [lastEvent, setLastEvent] = useState<EventData | null>(null)
  const [currentMap, setCurrentMap] = useState<MapName>('world')
  const [options, setOptions] = useState<Omit<MapOptions, 'selector'>>({
    map: {
      name: 'world',
      projection: 'miller',
    },
    backgroundColor: '#ffffff',
    zoomOnScroll: true,
    zoomButtons: true,
    regionsSelectable: true,
    markersSelectable: true,
    regionStyle: {
      initial: {
        fill: '#e4e4e4',
        stroke: '#ffffff',
        strokeWidth: 0.5,
      },
      hover: {
        fill: '#2ca25f',
      },
      selected: {
        fill: '#1a9850',
      },
    },
    visualizeData: {
      scale: ['#C8EEFF', '#0071A4'],
      values: {
        'US-CA': 100, // California
        'US-TX': 85, // Texas
        'US-FL': 80, // Florida
        'US-NY': 75, // New York
        'US-IL': 70, // Illinois
        'US-PA': 65, // Pennsylvania
      },
    },
    markers: [
      {
        name: 'Sample Marker',
        coords: [40.7128, -74.0060],
        style: {
          fill: '#ff0000',
          stroke: '#ffffff',
          r: 5,
        },
      },
    ],
  })

  const currentProjection = useMemo(() => {
    const selectedMap = mapOptions.find(map => map.value === currentMap)
    return selectedMap?.projection || 'unknown'
  }, [currentMap])

  const toggleTheme = useCallback(() => {
    const newIsDarkTheme = !isDarkTheme
    setIsDarkTheme(newIsDarkTheme)
    
    setOptions(prev => ({
      ...prev,
      backgroundColor: newIsDarkTheme ? '#2c3e50' : '#ffffff',
      regionStyle: {
        ...prev.regionStyle,
        initial: {
          ...prev.regionStyle?.initial,
          fill: newIsDarkTheme ? '#34495e' : '#e4e4e4',
          stroke: newIsDarkTheme ? '#1a1a1a' : '#ffffff',
        },
      },
    }))
  }, [isDarkTheme])

  const addRandomMarker = useCallback(() => {
    const lat = Math.random() * 180 - 90
    const lng = Math.random() * 360 - 180
    const marker = {
      name: `Marker ${(options.markers?.length ?? 0) + 1}`,
      coords: [lat, lng] as [number, number],
      style: {
        fill: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
        stroke: '#ffffff',
        r: 5,
      },
    }
    
    setOptions(prev => ({
      ...prev,
      markers: [...(prev.markers || []), marker],
    }))
  }, [options.markers?.length])

  const toggleZoom = useCallback(() => {
    setOptions(prev => ({
      ...prev,
      zoomOnScroll: !prev.zoomOnScroll,
    }))
  }, [options.zoomOnScroll])

  const handleRegionClick = useCallback((_event: MouseEvent, code: string) => {
    setLastEvent({
      type: 'Region Click',
      code,
      time: new Date().toLocaleTimeString(),
    })
  }, [])

  const handleMarkerClick = useCallback((_event: MouseEvent, index: string) => {
    setLastEvent({
      type: 'Marker Click',
      marker: options.markers?.[Number.parseInt(index)],
      time: new Date().toLocaleTimeString(),
    })
  }, [options.markers])

  const handleLoaded = useCallback(() => {
    setOptions(prev => ({
      ...prev,
      map: {
        ...prev.map,
        projection: 'mercator',
      },
    }))
    setLastEvent({
      type: 'Map Loaded',
      time: new Date().toLocaleTimeString(),
    })
  }, [])

  return (
    <div className={styles.container}>
      <h1>ts-maps React Example Using VectorMap component</h1>

      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label htmlFor="map-select">Select Map:</label>
          <select 
            id="map-select" 
            value={currentMap}
            onChange={(e) => setCurrentMap(e.target.value as MapName)}
          >
            {mapOptions.map(map => (
              <option key={map.value} value={map.value}>
                {map.label} ({map.projection})
              </option>
            ))}
          </select>
        </div>

        <div className={styles.controlInfo}>
          Current Projection: <strong>{currentProjection}</strong>
        </div>

        <button onClick={toggleTheme}>
          Toggle Theme
        </button>
        <button onClick={addRandomMarker}>
          Add Random Marker
        </button>
        <button onClick={toggleZoom}>
          {options.zoomOnScroll ? 'Disable' : 'Enable'} Zoom
        </button>
      </div>

      <div className={styles.mapContainer}>
        <VectorMap
          key={currentMap}
          options={options}
          mapName={currentMap}
          height="500px"
          onRegionClick={handleRegionClick}
          onMarkerClick={handleMarkerClick}
          onLoaded={handleLoaded}
        >
          <div className={styles.customLoading}>
            Loading your beautiful map...
          </div>
        </VectorMap>
      </div>

      {lastEvent && (
        <div className={styles.infoPanel}>
          <h3>Last Event</h3>
          <pre>{JSON.stringify(lastEvent, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
