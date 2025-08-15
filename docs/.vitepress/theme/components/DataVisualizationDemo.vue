<script setup lang="ts">
import { VectorMap } from 'ts-maps'
import { onMounted, ref, watch } from 'vue'
import canada from '../../../../packages/ts-maps/src/maps/canada'
import usAea from '../../../../packages/ts-maps/src/maps/us-aea-en'
import usLcc from '../../../../packages/ts-maps/src/maps/us-lcc-en'
import usMerc from '../../../../packages/ts-maps/src/maps/us-merc-en'
import usMill from '../../../../packages/ts-maps/src/maps/us-mill-en'
import world from '../../../../packages/ts-maps/src/maps/world-merc'

const mapContainer = ref<HTMLElement | null>(null)
const currentMap = ref('world')
const mapInstance = ref<VectorMap | null>(null)

const mapOptions = [
  { value: 'world', label: 'World Map', data: world, projection: 'mercator' as const },
  { value: 'us-merc', label: 'United States (Mercator)', data: usMerc, projection: 'mercator' as const },
  { value: 'us-mill', label: 'United States (Miller)', data: usMill, projection: 'miller' as const },
  { value: 'us-lcc', label: 'United States (Lambert)', data: usLcc, projection: 'mercator' as const },
  { value: 'us-aea', label: 'United States (Albers)', data: usAea, projection: 'mercator' as const },
  { value: 'canada', label: 'Canada', data: canada, projection: 'mercator' as const },
]

// Sample data for different maps
const worldData = {
  scale: ['#fee5d9', '#a50f15'] as [string, string],
  values: {
    US: 100,
    CN: 85,
    RU: 70,
    BR: 60,
    IN: 55,
    DE: 80,
    FR: 75,
    GB: 70,
    JP: 65,
    CA: 90,
  },
}

const usData = {
  scale: ['#e3f2fd', '#1976d2'] as [string, string],
  values: {
    CA: 100, // California
    TX: 85, // Texas
    NY: 80, // New York
    FL: 75, // Florida
    IL: 70, // Illinois
    PA: 65, // Pennsylvania
    OH: 60, // Ohio
    GA: 55, // Georgia
    NC: 50, // North Carolina
    MI: 45, // Michigan
  },
}

const canadaData = {
  scale: ['#fff3e0', '#f57c00'] as [string, string],
  values: {
    ON: 100, // Ontario
    QC: 85, // Quebec
    BC: 80, // British Columbia
    AB: 75, // Alberta
    MB: 70, // Manitoba
    SK: 65, // Saskatchewan
    NS: 60, // Nova Scotia
    NB: 55, // New Brunswick
    NL: 50, // Newfoundland and Labrador
    PE: 45, // Prince Edward Island
    NT: 40, // Northwest Territories
    NU: 35, // Nunavut
    YT: 30, // Yukon
  },
}

function getMapData(mapType: string) {
  if (mapType.startsWith('us'))
    return usData
  if (mapType === 'canada')
    return canadaData
  return worldData
}

function getMapProjection(mapType: string) {
  const option = mapOptions.find(opt => opt.value === mapType)
  return option?.projection || 'mercator'
}

function initializeMap() {
  if (!mapContainer.value)
    return

  const selectedOption = mapOptions.find(opt => opt.value === currentMap.value)
  if (!selectedOption)
    return

  // Clear previous map
  if (mapInstance.value) {
    mapInstance.value = null
  }

  // Add the selected map
  VectorMap.addMap(currentMap.value, selectedOption.data)

  // Create new map instance
  mapInstance.value = new VectorMap({
    selector: `#${mapContainer.value.id}`,
    map: {
      name: currentMap.value,
      projection: getMapProjection(currentMap.value),
    },
    visualizeData: getMapData(currentMap.value),
    backgroundColor: '#f8fafc',
    zoomOnScroll: true,
    zoomButtons: true,
    regionsSelectable: true,
  })
}

function changeMap(newMap: string) {
  currentMap.value = newMap
}

onMounted(() => {
  initializeMap()
})

watch(currentMap, () => {
  initializeMap()
})
</script>

<template>
  <div class="workspace-wrapper">
    <div class="map-controls">
      <label for="map-select">Select Map:</label>
      <select id="map-select" v-model="currentMap" @change="changeMap(($event.target as HTMLSelectElement).value)">
        <option v-for="option in mapOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div id="map" ref="mapContainer" class="vector-map-container" />

    <div class="map-info">
      <h4>Current Map: {{ mapOptions.find(opt => opt.value === currentMap)?.label }}</h4>
      <p>Projection: {{ getMapProjection(currentMap) }}</p>
      <p>
        Data: {{
          currentMap.startsWith('us') ? 'US States'
          : currentMap === 'canada' ? 'Canadian Provinces & Territories'
            : 'World Countries'
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
  .map-controls {
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .map-controls label {
    font-weight: 500;
    color: #374151;
  }

  .map-controls select {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background-color: white;
    font-size: 14px;
    min-width: 250px;
  }

  .map-info {
    margin-top: 20px;
    padding: 16px;
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .map-info h4 {
    margin: 0 0 8px 0;
    color: #111827;
    font-size: 16px;
  }

  .map-info p {
    margin: 4px 0;
    color: #6b7280;
    font-size: 14px;
  }

  #map {
    width: 100%;
    height: 600px;
    margin: 0 auto;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    background-color: #f1f5f9;
    position: relative;
  }

  /* Ensure SVG fills the container */
  #map svg {
    width: 100% !important;
    height: 100% !important;
    position: absolute;
    top: 0;
    left: 0;
  }

  /* Hide all text elements on the map */
  #map .jvm-region-label {
    display: none !important;
  }

  /* Fix for the zoom buttons */
  #map .jvm-zoom-btn {
    position: absolute;
    right: 10px;
    z-index: 10;
  }

  #map .jvm-zoomin {
    top: 10px;
  }

  #map .jvm-zoomout {
    top: 50px;
  }

  .workspace-wrapper {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  /* Improved tooltip styling */
  .jvm-tooltip {
    background-color: white;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 10px 14px;
    font-size: 14px;
    font-weight: 500;
    color: #1e293b;
    pointer-events: none;
    border: 1px solid #e2e8f0;
    z-index: 1000;
    max-width: 250px;
    min-width: 120px;
    text-align: center;
    position: fixed !important; /* Use fixed positioning to ensure it stays in place */
    transition: none !important; /* Prevent any transitions */
    transform: translate3d(0,0,0) !important; /* Force hardware acceleration */
    will-change: top, left !important; /* Optimize for animations */
  }

  /* Tooltip arrow */
  .jvm-tooltip:after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
    width: 12px;
    height: 12px;
    background: white;
    border-right: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
  }

  /* Map legend */
  .map-legend {
    position: absolute;
    bottom: 20px;
    right: 20px;
    background-color: white;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    padding: 12px;
    z-index: 100;
    border: 1px solid #e2e8f0;
    max-width: 200px;
  }

  .map-legend h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: #1e293b;
  }

  .legend-gradient {
    height: 20px;
    width: 100%;
    margin-bottom: 5px;
    background: linear-gradient(to right, #e2e8f0, rgb(40, 70, 200));
    border-radius: 3px;
  }

  .legend-labels {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #64748b;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
  }

  header h1 {
    margin: 0 0 10px 0;
    color: #1e293b;
  }

  header p {
    margin: 0;
    color: #64748b;
    line-height: 1.5;
  }

  header a {
    padding: 10px 20px;
    background-color: #4f46e5;
    color: white;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 500;
    transition: background-color 0.2s;
  }

  header a:hover {
    background-color: #4338ca;
  }

  /* Map control buttons styling */
  .jvm-zoom-btn {
    background-color: white;
    border: 1px solid #e2e8f0;
    color: #4f46e5;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    line-height: 30px;
    text-align: center;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .jvm-zoom-btn:hover {
    background-color: #f8fafc;
  }
</style>
