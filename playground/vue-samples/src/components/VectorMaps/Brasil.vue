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
      fill: '#fd7e14',
    },
    selected: {
      fill: '#e8590c',
    },
  },
  visualizeData: {
    scale: ['#FFE8D6', '#fd7e14'],
    values: {
      'BR-SP': 100,
      'BR-RJ': 85,
      'BR-MG': 90,
      'BR-RS': 75,
      'BR-PR': 80,
    },
  },
})
</script>

<template>
  <div class="brasil-map-container">
    <h3>Brasil Map</h3>
    <div class="map-info">
      <p><strong>Map Type:</strong> Brasil</p>
      <p><strong>Projection:</strong> Mercator</p>
      <p><strong>Features:</strong> Interactive states, zoom, data visualization</p>
    </div>
    <div class="map-demo">
      <VectorMap
        :options="mapOptions"
        map-name="brasil"
        height="400px"
      />
    </div>
  </div>
</template>

<style scoped>
.brasil-map-container {
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
