<script setup lang="ts">
import { ref } from 'vue'
import GoogleMap from '../../../../packages/vue/src/components/GoogleMap.vue'

const apiKey = ''
const center = ref({ lat: 37.7749, lng: -122.4194 }) // San Francisco
const zoom = ref(12)
const markers = ref([
  {
    position: { lat: 37.7749, lng: -122.4194 },
    title: 'San Francisco',
  },
  {
    position: { lat: 37.7694, lng: -122.4862 },
    title: 'Golden Gate Park',
  },
])

function handleMapLoaded(map: google.maps.Map) {
  console.warn('Map loaded:', map)
}

function handleBoundsChanged(bounds: google.maps.LatLngBounds | null) {
  console.warn('Bounds changed:', bounds)
}

function handleMarkerClicked(marker: google.maps.Marker, index: number) {
  console.warn('Marker clicked:', marker, 'Index:', index)
}
</script>

<template>
  <div class="container">
    <h1>Google Maps Example</h1>

    <div class="map-container">
      <GoogleMap
        :api-key="apiKey"
        :center="center"
        :zoom="zoom"
        :markers="markers"
        @map-loaded="handleMapLoaded"
        @bounds-changed="handleBoundsChanged"
        @marker-clicked="handleMarkerClicked"
      />
    </div>

    <div class="info">
      <p>This example demonstrates the integration of Google Maps with Vue 3.</p>
      <p><strong>Note:</strong> You need to add your Google Maps API key in the component.</p>
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

.map-container {
  height: 500px;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  margin: 20px 0;
}

.info {
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-top: 20px;
}

.info p {
  margin: 10px 0;
}
</style>
