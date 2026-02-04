// Types re-exported from ts-maps
export type { MapData, MapOptions, Marker, MarkerStyle, RegionStyle, SeriesConfig, DataVisualizationOptions } from 'ts-maps'

// STX component types
export interface VectorMapProps {
  options: Omit<MapOptions, 'selector'>
  mapName: MapName
  width?: string
  height?: string
  id?: string
}

export interface CountryMapProps {
  options: Omit<MapOptions, 'selector'>
  height?: string
  id?: string
}

export type MapName =
  | 'world'
  | 'world-merc'
  | 'us-merc'
  | 'us-mill'
  | 'us-lcc'
  | 'us-aea'
  | 'spain'
  | 'iraq'
  | 'italy'
  | 'canada'
  | 'brasil'
  | 'russia'

// Map data imports for direct usage
import type { MapData, MapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps'
import brasilMap from 'ts-maps/brasil'
import canadaMap from 'ts-maps/canada'
import iraqMap from 'ts-maps/iraq'
import italyMap from 'ts-maps/italy'
import russiaMap from 'ts-maps/russia'
import spainMap from 'ts-maps/spain'
import usaAeaMap from 'ts-maps/us-aea-en'
import usaLccMap from 'ts-maps/us-lcc-en'
import usaMercMap from 'ts-maps/us-merc-en'
import usaMillMap from 'ts-maps/us-mill-en'
import worldMap from 'ts-maps/world'
import worldMercMap from 'ts-maps/world-merc'

// Map data lookup table
export const mapData: Record<MapName, MapData> = {
  'world': worldMap as MapData,
  'world-merc': worldMercMap as MapData,
  'us-merc': usaMercMap as MapData,
  'us-mill': usaMillMap as MapData,
  'us-lcc': usaLccMap as MapData,
  'us-aea': usaAeaMap as MapData,
  'spain': spainMap as MapData,
  'iraq': iraqMap as MapData,
  'italy': italyMap as MapData,
  'canada': canadaMap as MapData,
  'brasil': brasilMap as MapData,
  'russia': russiaMap as MapData,
}

/**
 * Initialize a vector map on a given element
 * This is the primary function for creating maps in STX templates
 */
export function createVectorMap(
  selector: string,
  mapName: MapName,
  options: Omit<MapOptions, 'selector'> = {},
): VectorMap {
  // Add the map data
  VectorMap.addMap(mapName, mapData[mapName])

  // Create and return the map instance
  return new VectorMap({
    ...options,
    selector,
    map: {
      name: mapName,
      projection: options.projection,
    },
  })
}

/**
 * Render a vector map container HTML
 * Returns the HTML string for the map container that can be used in STX templates
 */
export function renderMapContainer(props: VectorMapProps): string {
  const {
    id = `ts-maps-${Math.random().toString(36).substring(2, 11)}`,
    width = '100%',
    height = '400px',
  } = props

  return `<div id="${id}" class="ts-maps-container" style="width: ${width}; height: ${height}; position: relative;">
  <div class="ts-maps-loading">Loading map...</div>
</div>`
}

/**
 * Generate the client-side initialization script for a map
 */
export function renderMapScript(props: VectorMapProps): string {
  const {
    id = 'ts-maps-container',
    mapName,
    options,
  } = props

  const optionsJson = JSON.stringify({
    ...options,
    selector: `#${id}`,
    map: {
      name: mapName,
      projection: options.projection,
    },
  })

  return `<script type="module">
import { VectorMap, mapData } from 'ts-maps-stx';

const mapName = '${mapName}';
VectorMap.addMap(mapName, mapData[mapName]);

const map = new VectorMap(${optionsJson});

// Store reference on element for later access
document.getElementById('${id}').__tsMap = map;
</script>`
}

/**
 * Generate CSS for map components
 */
export function renderMapStyles(): string {
  return `<style>
.ts-maps-container {
  position: relative;
}

.ts-maps-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  color: #666;
}

.ts-maps-container svg {
  touch-action: none;
}
</style>`
}

// Re-export VectorMap class for direct usage
export { VectorMap }
