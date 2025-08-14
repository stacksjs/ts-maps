<template>
  <VectorMap
    :options="options"
    map-name="us-aea"
    :height="height"
    :key="mapKey"
    v-bind="$attrs"
    @region-click="(event: MouseEvent, code: string) => emit('region-click', event, code)"
    @marker-click="(event: MouseEvent, index: string) => emit('marker-click', event, index)"
    @loaded="() => emit('loaded')"
    @viewport-change="(x: number, y: number, z: number) => emit('viewport-change', x, y, z)"
    @region-selected="(event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => emit('region-selected', event, code, isSelected, selectedRegions)"
    @marker-selected="(event: MouseEvent, index: string, isSelected: boolean, selectedMarkers: string[]) => emit('marker-selected', event, index, isSelected, selectedMarkers)"
    @region-tooltip-show="(event: Event, tooltip: any, code: string) => emit('region-tooltip-show', event, tooltip, code)"
    @marker-tooltip-show="(event: Event, tooltip: any, index: string) => emit('marker-tooltip-show', event, tooltip, index)"
  >
    <template #loading>
      <slot name="loading">
        <div class="us-map-loading">
          Loading United States map...
        </div>
      </slot>
    </template>
  </VectorMap>
</template>

<script setup lang="ts">
import type { MapOptions } from 'ts-maps'
import { computed, ref, watch } from 'vue'
import VectorMap from '../VectorMap.vue'

// Props interface
interface Props {
  options: Omit<MapOptions, 'selector'>
  height?: string
  mapKey?: string | number // Optional key for forcing re-renders
}

// Events interface
interface Emits {
  (e: 'region-click', event: MouseEvent, code: string): void
  (e: 'marker-click', event: MouseEvent, index: string): void
  (e: 'loaded'): void
  (e: 'viewport-change', x: number, y: number, z: number): void
  (e: 'region-selected', event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]): void
  (e: 'marker-selected', event: MouseEvent, index: string, isSelected: boolean, selectedMarkers: string[]): void
  (e: 'region-tooltip-show', event: Event, tooltip: any, code: string): void
  (e: 'marker-tooltip-show', event: Event, tooltip: any, index: string): void
}

// Props with defaults
const props = withDefaults(defineProps<Props>(), {
  height: '500px',
  mapKey: undefined
})

// Emit events
const emit = defineEmits<Emits>()

// Computed map key - use provided key or generate one based on options
const mapKey = computed(() => {
  if (props.mapKey !== undefined) return props.mapKey
  
  // Generate a key based on options to force re-render when options change significantly
  const optionsHash = JSON.stringify({
    backgroundColor: props.options.backgroundColor,
    zoomOnScroll: props.options.zoomOnScroll,
    regionsSelectable: props.options.regionsSelectable,
    markersSelectable: props.options.markersSelectable,
    visualizeData: props.options.visualizeData,
    markers: props.options.markers?.length
  })
  
  return `us-map-${optionsHash.length}-${Date.now()}`
})

// Watch for options changes to update the map if needed
watch(() => props.options, () => {
  // The mapKey computed will automatically update, forcing a re-render
}, { deep: true })
</script>

<style scoped>
.us-map-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: rgba(255, 255, 255, 0.9);
  font-size: 1.2em;
  color: #666;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
