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
      fill: '#28a745',
    },
    selected: {
      fill: '#1e7e34',
    },
  },
  visualizeData: {
    scale: ['#C8FFC8', '#28a745'],
    values: {
      'CA-ON': 100,
      'CA-QC': 85,
      'CA-BC': 90,
      'CA-AB': 75,
      'CA-MB': 80,
    },
  },
})
</script>

<template>
  <div class="canada-map-container">
    <h3>Canada Map</h3>
    <div class="map-info">
      <p><strong>Map Type:</strong> Canada</p>
      <p><strong>Projection:</strong> Mercator</p>
      <p><strong>Features:</strong> Interactive provinces, zoom, data visualization</p>
    </div>
    <div class="map-demo">
      <VectorMap
        :options="mapOptions"
        map-name="canada"
        height="400px"
      />
    </div>
  </div>
</template>

<style scoped>
.canada-map-container {
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
