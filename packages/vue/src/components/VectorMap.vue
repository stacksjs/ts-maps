<script setup lang="ts">
import type { MapOptions } from 'ts-maps'
import type { PropType } from 'vue'
import { VectorMap as TsVectorMap } from 'ts-maps'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  options: {
    type: Object as PropType<Omit<MapOptions, 'selector'>>,
    required: true,
  },
  width: {
    type: String,
    default: '100%',
  },
  height: {
    type: String,
    default: '400px',
  },
})

const emit = defineEmits<{
  (e: 'regionClick', event: MouseEvent, code: string): void
  (e: 'regionSelected', event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]): void
  (e: 'markerClick', event: MouseEvent, index: number): void
  (e: 'viewportChange', scale: number, transX: number, transY: number): void
  (e: 'loaded'): void
  (e: 'update:options', options: MapOptions): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
const map = ref<TsVectorMap | null>(null)
const loading = ref(true)

const containerStyle = computed(() => ({
  width: props.width,
  height: props.height,
  position: 'relative' as const,
}))

onMounted(async () => {
  if (!mapContainer.value)
    return

  // Initialize the map
  map.value = new TsVectorMap({
    ...props.options,
    selector: `#${mapContainer.value.id || `ts-maps-${Math.random().toString(36).substr(2, 9)}`}`,
  })

  // Set up event handlers
  map.value.params.onRegionClick = (event, code) => {
    emit('regionClick', event, code)
  }

  map.value.params.onRegionSelected = (event, code, isSelected, selectedRegions) => {
    emit('regionSelected', event, code, isSelected, selectedRegions)
  }

  map.value.params.onMarkerClick = (event, index) => {
    emit('markerClick', event, index)
  }

  map.value.params.onViewportChange = (scale, transX, transY) => {
    emit('viewportChange', scale, transX, transY)
  }

  map.value.params.onLoaded = () => {
    loading.value = false
    emit('loaded')
  }
})

// Watch for options changes
watch(() => props.options, (newOptions) => {
  if (map.value) {
    Object.assign(map.value.params, newOptions)
    emit('update:options', map.value.params)
  }
}, { deep: true })

onBeforeUnmount(() => {
  if (map.value) {
    // Clean up the map instance
    map.value = null
  }
})

// Expose the map instance to the parent component
defineExpose({
  map,
})
</script>

<template>
  <div ref="mapContainer" :style="containerStyle">
    <slot v-if="loading" name="loading">
      <div class="ts-maps-loading">
        Loading map...
      </div>
    </slot>
  </div>
</template>

<style>
.ts-maps-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  color: #666;
}
</style>
