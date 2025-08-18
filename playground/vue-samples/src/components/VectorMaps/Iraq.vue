<template>
  <div class="iraq-map-container">
    <h3>Iraq Map</h3>
    <div class="map-info">
      <p><strong>Map Type:</strong> Iraq</p>
      <p><strong>Projection:</strong> Mercator</p>
      <p><strong>Features:</strong> Interactive regions, zoom, data visualization</p>
    </div>
    <div class="map-demo">
      <VectorMap
        :options="mapOptions"
        map-name="iraq"
        height="400px"
        @region-click="handleRegionClick"
        @loaded="handleLoaded"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MapOptions } from 'ts-maps'
import { reactive } from 'vue'
import { VectorMap } from '../../../../packages/vue/src'

const mapOptions = reactive<Omit<MapOptions, 'selector'>>({
  backgroundColor: '#f8f9fa',
  zoomOnScroll: true,
  zoomButtons: true,
  regionsSelectable: true,
  regionStyle: {
    initial: {
      fill: '#e9ecef',
      stroke: '#ffffff',
      strokeWidth: 0.5,
    },
    hover: {
      fill: '#dc3545',
    },
    selected: {
      fill: '#c82333',
    },
  },
  visualizeData: {
    scale: ['#FFE6E6', '#dc3545'],
    values: {
      'IQ-BG': 100,
      'IQ-BA': 85,
      'IQ-AN': 90,
      'IQ-SU': 75,
      'IQ-NA': 80,
    },
  },
})

function handleRegionClick(_event: MouseEvent, code: string) {
  console.log('Iraq Region clicked:', code)
}

function handleLoaded() {
  console.log('Iraq Map loaded')
}
</script>

<style scoped>
.iraq-map-container {
  padding: 20px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  margin: 20px 0;
  background: white;
}

.map-info {
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 6px;
}

.map-info p {
  margin: 5px 0;
  font-size: 14px;
}

.map-demo {
  border: 1px solid #dee2e6;
  border-radius: 6px;
  overflow: hidden;
}
</style>
