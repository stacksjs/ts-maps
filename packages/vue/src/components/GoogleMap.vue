//@ts-nocheck
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

declare global {
  interface Window {
    google: typeof google
  }
}

interface MarkerOptions extends Omit<google.maps.MarkerOptions, 'position'> {
  position: google.maps.LatLngLiteral
}

interface Props {
  apiKey: string
  center?: google.maps.LatLngLiteral
  zoom?: number
  mapId?: string
  options?: google.maps.MapOptions
  markers?: MarkerOptions[]
}

const props = withDefaults(defineProps<Props>(), {
  center: () => ({ lat: 0, lng: 0 }),
  zoom: 2,
  mapId: '',
  options: () => ({}),
  markers: () => [],
})

const emit = defineEmits<{
  (e: 'mapLoaded', map: google.maps.Map): void
  (e: 'boundsChanged', bounds: google.maps.LatLngBounds | null): void
  (e: 'markerClicked', marker: google.maps.Marker, index: number): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
const map = ref<google.maps.Map | null>(null)
const markers = ref<google.maps.Marker[]>([])
let googleMapsScript: HTMLScriptElement | null = null

function clearMarkers() {
  markers.value.forEach(marker => marker.setMap(null))
  markers.value = []
}

function createMarkers() {
  if (!map.value)
    return

  clearMarkers()

  props.markers.forEach((markerOptions, index) => {
    const marker = new window.google.maps.Marker({
      ...markerOptions,
      map: map.value,
    })

    marker.addListener('click', () => {
      emit('markerClicked', marker, index)
    })

    markers.value.push(marker)
  })
}

function initializeMap() {
  if (!mapContainer.value)
    return

  const mapOptions: google.maps.MapOptions = {
    center: props.center,
    zoom: props.zoom,
    mapId: props.mapId,
    ...props.options,
  }

  map.value = new window.google.maps.Map(mapContainer.value, mapOptions)
  emit('mapLoaded', map.value)

  map.value.addListener('bounds_changed', () => {
    emit('boundsChanged', map.value?.getBounds() ?? null)
  })

  createMarkers()
}

function loadGoogleMapsScript() {
  if (window.google?.maps) {
    initializeMap()
    return
  }

  googleMapsScript = document.createElement('script')
  googleMapsScript.src = `https://maps.googleapis.com/maps/api/js?key=${props.apiKey}`
  googleMapsScript.async = true
  googleMapsScript.defer = true
  googleMapsScript.onload = initializeMap

  document.head.appendChild(googleMapsScript)
}

watch(() => props.center, (newCenter) => {
  if (map.value && newCenter) {
    map.value.setCenter(newCenter)
  }
})

watch(() => props.zoom, (newZoom) => {
  if (map.value && newZoom) {
    map.value.setZoom(newZoom)
  }
})

watch(() => props.markers, () => {
  if (map.value) {
    createMarkers()
  }
}, { deep: true })

onMounted(() => {
  loadGoogleMapsScript()
})

onUnmounted(() => {
  clearMarkers()
  if (googleMapsScript && googleMapsScript.parentNode) {
    googleMapsScript.parentNode.removeChild(googleMapsScript)
  }
})
</script>

<template>
  <div ref="mapContainer" class="google-map" />
</template>

<style scoped>
.google-map {
  width: 100%;
  height: 100%;
  min-height: 300px;
}
</style>
