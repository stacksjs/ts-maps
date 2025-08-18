<script setup lang="ts">
import type { MapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps-vue'
import { reactive } from 'vue'

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
      fill: '#17a2b8',
    },
    selected: {
      fill: '#138496',
    },
  },
  visualizeData: {
    scale: ['#D1ECF1', '#17a2b8'],
    values: {
      US: 100,
      GB: 85,
      FR: 90,
      DE: 75,
      IT: 80,
      ES: 70,
      CA: 85,
      BR: 75,
      RU: 80,
      CN: 90,
    },
  },
})
</script>

<template>
  <div class="world-map-container">
    <h3>World Map</h3>
    <div class="map-info">
      <p><strong>Map Type:</strong> World</p>
      <p><strong>Projection:</strong> Miller</p>
      <p><strong>Features:</strong> Interactive countries, zoom, data visualization</p>
    </div>
    <div class="map-demo">
      <VectorMap
        :options="mapOptions"
        map-name="world"
        height="400px"
      />
    </div>
  </div>
</template>

<style scoped>
.world-map-container {
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
