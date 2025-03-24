<script setup lang="ts">
import type { MapOptions } from 'ts-maps'
import { reactive, ref } from 'vue'
import { VectorMap } from '../../../packages/vue/src'

interface EventData {
  type: string
  code?: string
  marker?: any
  time: string
}

const isDarkTheme = ref(false)
const lastEvent = ref<EventData | null>(null)

const options = reactive<Omit<MapOptions, 'selector'>>({
  map: {
    name: 'world',
    projection: 'mercator',
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
      US: 100,
      GB: 75,
      FR: 80,
      DE: 85,
      IT: 60,
      ES: 65,
    },
  },
  markers: [
    {
      name: 'New York',
      coords: [40.7128, -74.0060],
      style: {
        fill: '#ff0000',
        stroke: '#ffffff',
        r: 5,
      },
    },
  ],
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

function handleMarkerClick(_event: MouseEvent, index: number) {
  lastEvent.value = {
    type: 'Marker Click',
    marker: options.markers?.[index],
    time: new Date().toLocaleTimeString(),
  }
}

function handleLoaded() {
  lastEvent.value = {
    type: 'Map Loaded',
    time: new Date().toLocaleTimeString(),
  }
}
</script>

<template>
  <div class="container">
    <h1>ts-maps Vue Example</h1>

    <div class="controls">
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
        :options="options"
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
}

.controls button {
  margin: 0 10px 10px 0;
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
</style>
