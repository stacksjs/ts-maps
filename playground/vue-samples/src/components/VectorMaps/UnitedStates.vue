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
      fill: '#007bff',
    },
    selected: {
      fill: '#0056b3',
    },
  },
  visualizeData: {
    scale: ['#C8EEFF', '#0071A4'],
    values: {
      'US-CA': 100,
      'US-TX': 85,
      'US-NY': 90,
      'US-FL': 75,
      'US-IL': 80,
    },
  },
})
</script>

<template>
  <div class="us-map-container">
    <h3>United States Map</h3>
    <div class="map-info">
      <p><strong>Map Type:</strong> US Albers Equal Area</p>
      <p><strong>Projection:</strong> Albers Equal Area</p>
      <p><strong>Features:</strong> Interactive regions, zoom, markers</p>
    </div>
    <div class="map-demo">
      <VectorMap
        :options="mapOptions"
        map-name="us-aea"
        height="400px"
      />
    </div>
  </div>
</template>

<style scoped>
.us-map-container {
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
