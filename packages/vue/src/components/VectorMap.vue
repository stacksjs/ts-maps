<script setup lang="ts">
import type { PropType } from 'vue'
import type { MapOptions } from '../../../ts-maps/src/types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import brasilMap from '../../../ts-maps/src/maps/brasil'

import canadaMap from '../../../ts-maps/src/maps/canada'
import italyMap from '../../../ts-maps/src/maps/italy'
import spainMap from '../../../ts-maps/src/maps/spain'
import usaAeaMap from '../../../ts-maps/src/maps/us-aea-en'
import usaLccMap from '../../../ts-maps/src/maps/us-lcc-en'
import usaMercMap from '../../../ts-maps/src/maps/us-merc-en'
import usaMillMap from '../../../ts-maps/src/maps/us-mill-en'
// Import available maps
import worldMap from '../../../ts-maps/src/maps/world'
import worldMercMap from '../../../ts-maps/src/maps/world-merc'
import { VectorMap as TsVectorMap } from '../../../ts-maps/src/vector-map'

// Map name type
type MapName = 'world' | 'world-merc' | 'us-merc' | 'us-mill' | 'us-lcc' | 'us-aea' | 'spain' | 'italy' | 'canada' | 'brasil'

const props = defineProps({
  options: {
    type: Object as PropType<Omit<MapOptions, 'selector'>>,
    required: true,
  },
  mapName: {
    type: String as PropType<MapName>,
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
const loading = ref<boolean>(true)

const containerStyle = computed<{ width: string, height: string, position: 'relative' }>(() => ({
  width: props.width,
  height: props.height,
  position: 'relative' as const,
}))

// Map data lookup
const mapData: Record<MapName, any> = {
  'world': worldMap,
  'world-merc': worldMercMap,
  'us-merc': usaMercMap,
  'us-mill': usaMillMap,
  'us-lcc': usaLccMap,
  'us-aea': usaAeaMap,
  'spain': spainMap,
  'italy': italyMap,
  'canada': canadaMap,
  'brasil': brasilMap,
}

onMounted(async () => {
  if (!mapContainer.value)
    return

  const containerId = mapContainer.value.id || `ts-maps-${Math.random().toString(36).substr(2, 9)}`
  mapContainer.value.id = containerId

  // Add the map data
  TsVectorMap.addMap(props.mapName, mapData[props.mapName])

  // Initialize the map with the selected map
  map.value = new TsVectorMap({
    ...props.options,
    map: {
      name: props.mapName,
      projection: props.options.projection,
    },
    selector: `#${containerId}`,
    onRegionClick: (event: MouseEvent, code: string) => {
      emit('regionClick', event, code)
    },
    onRegionSelected: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => {
      emit('regionSelected', event, code, isSelected, selectedRegions)
    },
    onMarkerClick: (event: MouseEvent, index: number) => {
      emit('markerClick', event, index)
    },
    onViewportChange: (scale: number, transX: number, transY: number) => {
      emit('viewportChange', scale, transX, transY)
    },
    onLoaded: () => {
      loading.value = false
      emit('loaded')
    },
  })
})

// Watch for options changes
watch(() => props.options, (newOptions) => {
  if (map.value) {
    Object.assign(map.value, newOptions)
    emit('update:options', map.value)
  }
}, { deep: true })

// Watch for map name changes
watch(() => props.mapName, (newMapName) => {
  if (map.value && mapData[newMapName]) {
    // Add the new map data
    TsVectorMap.addMap(newMapName, mapData[newMapName])
    // Update the map
    map.value.setMap(newMapName)
  }
})

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
