<script setup lang="ts">
import type { MapOptions } from 'ts-maps'
import { computed, reactive, ref } from 'vue'
import { VectorMap } from 'ts-maps-vue'

type MapName = 'world' | 'world-merc' | 'us-merc' | 'us-mill' | 'us-lcc' | 'us-aea' | 'spain' | 'italy' | 'canada' | 'russia' | 'iraq' | 'brasil'

interface EventData {
  type: string
  code?: string
  marker?: any
  time: string
}

const isDarkTheme = ref(false)
const lastEvent = ref<EventData | null>(null)
const currentMap = ref<MapName>('world')

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

const options = reactive<Omit<MapOptions, 'selector'>>({
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

const currentProjection = computed(() => {
  const selectedMap = mapOptions.find(map => map.value === currentMap.value)

  if (!selectedMap)
    return 'unknown'

  return selectedMap.projection
})

function toggleTheme() {
  isDarkTheme.value = !isDarkTheme.value
  options.backgroundColor = isDarkTheme.value ? '#2c3e50' : '#ffffff'
  if (options.regionStyle) {
    options.regionStyle = {
      ...options.regionStyle,
      initial: {
        ...options.regionStyle.initial,
        fill: isDarkTheme.value ? '#34495e' : '#e4e4e4',
        stroke: isDarkTheme.value ? '#1a1a1a' : '#ffffff',
      },
    }
  }
}

function addRandomMarker() {
  const lat = Math.random() * 180 - 90
  const lng = Math.random() * 360 - 180
  const marker = {
    name: `Marker ${options.markers?.length ?? 0 + 1}`,
    coords: [lat, lng] as [number, number],
    style: {
      fill: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
      stroke: '#ffffff',
      r: 5,
    },
  }
  options.markers = [...(options.markers || []), marker]
}

function toggleZoom() {
  options.zoomOnScroll = !options.zoomOnScroll
}

function handleRegionClick(_event: MouseEvent, code: string) {
  lastEvent.value = {
    type: 'Region Click',
    code,
    time: new Date().toLocaleTimeString(),
  }
}

function handleMarkerClick(_event: MouseEvent, index: string) {
  lastEvent.value = {
    type: 'Marker Click',
    marker: options.markers?.[Number.parseInt(index)],
    time: new Date().toLocaleTimeString(),
  }
}

function handleLoaded() {
  options.projection = currentProjection.value
  lastEvent.value = {
    type: 'Map Loaded',
    time: new Date().toLocaleTimeString(),
  }
}
</script>

<template>
  <div class="container">
    <h1>ts-maps Vue Example Using VectorMap component</h1>

    <div class="controls">
      <div class="control-group">
        <label for="map-select">Select Map:</label>
        <select id="map-select" v-model="currentMap">
          <option v-for="map in mapOptions" :key="map.value" :value="map.value">
            {{ map.label }} ({{ map.projection }})
          </option>
        </select>
      </div>

      <div class="control-info">
        Current Projection: <strong>{{ currentProjection }}</strong>
      </div>

      <button @click="toggleTheme">
        Toggle Theme
      </button>
      <button @click="addRandomMarker">
        Add Random Marker
      </button>
      <button @click="toggleZoom">
        {{ options.zoomOnScroll ? 'Disable' : 'Enable' }} Zoom
      </button>
    </div>

    <div class="map-container">
      <VectorMap
        :key="currentMap"
        :options="options"
        :map-name="currentMap"
        height="500px"
        @region-click="handleRegionClick"
        @marker-click="handleMarkerClick"
        @loaded="handleLoaded"
      >
        <template #loading>
          <div class="custom-loading">
            Loading your beautiful map...
          </div>
        </template>
      </VectorMap>
    </div>

    <div v-if="lastEvent" class="info-panel">
      <h3>Last Event</h3>
      <pre>{{ lastEvent }}</pre>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.controls {
  margin: 20px 0;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  align-items: center;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-group label {
  font-weight: 500;
}

.control-group select {
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #ddd;
  background: white;
  min-width: 200px;
}

.controls button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: #2ca25f;
  color: white;
  cursor: pointer;
}

.controls button:hover {
  background: #1a9850;
}

.map-container {
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

.custom-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: rgba(255, 255, 255, 0.9);
  font-size: 1.2em;
  color: #666;
}

.info-panel {
  margin-top: 20px;
  padding: 15px;
  background: #f9f9f9;
  border-radius: 8px;
}

.control-info {
  padding: 8px 16px;
  background: #fff;
  border-radius: 4px;
  border: 1px solid #ddd;
}

.control-info strong {
  color: #2ca25f;
}
</style>
