<script setup lang="ts">
import type { MapOptions } from 'ts-maps'
import { computed, watch } from 'vue'
import VectorMap from '../VectorMap.vue'

// Props interface
interface Props {
  options: Omit<MapOptions, 'selector'>
  height?: string
  mapKey?: string | number // Optional key for forcing re-renders
}

// Events interface
interface Emits {
  (e: 'regionClick', event: MouseEvent, code: string): void
  (e: 'markerClick', event: MouseEvent, index: string): void
  (e: 'loaded'): void
  (e: 'viewportChange', x: number, y: number, z: number): void
  (e: 'regionSelected', event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]): void
  (e: 'markerSelected', event: MouseEvent, index: string, isSelected: boolean, selectedMarkers: string[]): void
  (e: 'regionTooltipShow', event: Event, tooltip: any, code: string): void
  (e: 'markerTooltipShow', event: Event, tooltip: any, index: string): void
}

// Props with defaults
const props = withDefaults(defineProps<Props>(), {
  height: '500px',
  mapKey: undefined,
})

// Emit events
const emit = defineEmits<Emits>()

// Computed map key - use provided key or generate one based on options
const mapKey = computed(() => {
  if (props.mapKey !== undefined)
    return props.mapKey

  // Generate a key based on options to force re-render when options change significantly
  const optionsHash = JSON.stringify({
    backgroundColor: props.options.backgroundColor,
    zoomOnScroll: props.options.zoomOnScroll,
    regionsSelectable: props.options.regionsSelectable,
    markersSelectable: props.options.markersSelectable,
    visualizeData: props.options.visualizeData,
    markers: props.options.markers?.length,
  })

  return `russia-map-${optionsHash.length}-${Date.now()}`
})

// Create options without projection to avoid overriding map-name
const mapOptions = computed(() => {
  const { projection, ...rest } = props.options
  return rest
})

// Watch for options changes to update the map if needed
watch(() => props.options, () => {
  // The mapKey computed will automatically update, forcing a re-render
}, { deep: true })
</script>

<template>
  <VectorMap
    :key="mapKey"
    :options="mapOptions"
    map-name="russia"
    :height="height"
    @region-click="(event: MouseEvent, code: string) => emit('regionClick', event, code)"
    @marker-click="(event: MouseEvent, index: string) => emit('markerClick', event, index)"
    @loaded="() => emit('loaded')"
    @viewport-change="(x: number, y: number, z: number) => emit('viewportChange', x, y, z)"
    @region-selected="(event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => emit('regionSelected', event, code, isSelected, selectedRegions)"
    @marker-selected="(event: MouseEvent, index: string, isSelected: boolean, selectedMarkers: string[]) => emit('markerSelected', event, index, isSelected, selectedMarkers)"
    @region-tooltip-show="(event: Event, tooltip: any, code: string) => emit('regionTooltipShow', event, tooltip, code)"
    @marker-tooltip-show="(event: Event, tooltip: any, index: string) => emit('markerTooltipShow', event, tooltip, index)"
  >
    <template #loading>
      <slot name="loading">
        <div class="russia-map-loading">
          Loading Russia map...
        </div>
      </slot>
    </template>
  </VectorMap>
</template>

<style scoped>
.russia-map-loading {
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
