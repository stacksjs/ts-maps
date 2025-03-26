<script setup lang="ts">
import type { MapData, MapOptions } from 'ts-maps'
import type { ComputedRef, PropType, Ref } from 'vue'
import { VectorMap as TsVectorMap } from 'ts-maps'
import canadaMap from 'ts-maps/canada'
import italyMap from 'ts-maps/italy'
import spainMap from 'ts-maps/spain'
import usaAeaMap from 'ts-maps/us-aea-en'
import usaLccMap from 'ts-maps/us-lcc-en'
import usaMercMap from 'ts-maps/us-merc-en'
import usaMillMap from 'ts-maps/us-mill-en'
import worldMap from 'ts-maps/world'
import worldMercMap from 'ts-maps/world-merc'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// Map name type
type MapName = 'world' | 'world-merc' | 'us-merc' | 'us-mill' | 'us-lcc' | 'us-aea' | 'spain' | 'italy' | 'canada'

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
  (e: 'markerClick', event: MouseEvent, index: string): void
  (e: 'viewportChange', scale: number, transX: number, transY: number): void
  (e: 'loaded'): void
  (e: 'update:options', options: MapOptions): void
}>()

const mapContainer: Ref<HTMLElement | null> = ref(null)
const map: Ref<TsVectorMap | null> = ref(null)
const loading: Ref<boolean> = ref(true)

const containerStyle: ComputedRef<{ width: string, height: string, position: 'relative' }> = computed(() => ({
  width: props.width,
  height: props.height,
  position: 'relative' as const,
}))

// Map data lookup
const mapData: Record<MapName, MapData> = {
  'world': worldMap as MapData,
  'world-merc': worldMercMap as MapData,
  'us-merc': usaMercMap as MapData,
  'us-mill': usaMillMap as MapData,
  'us-lcc': usaLccMap as MapData,
  'us-aea': usaAeaMap as MapData,
  'spain': spainMap as MapData,
  'italy': italyMap as MapData,
  'canada': canadaMap as MapData,
}

onMounted(async () => {
  if (!mapContainer.value)
    return

  const containerId: string = mapContainer.value.id || `ts-maps-${Math.random().toString(36).substr(2, 9)}`
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
    onMarkerClick: (event: MouseEvent, index: string) => {
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
    emit('update:options', {
      ...newOptions,
      selector: `#${mapContainer.value?.id}`,
      map: {
        name: props.mapName,
        projection: newOptions.projection,
      },
    })
  }
}, { deep: true })

// Watch for map name changes
watch(() => props.mapName, (newMapName) => {
  if (mapContainer.value && mapData[newMapName]) {
    // Add the new map data
    TsVectorMap.addMap(newMapName, mapData[newMapName])

    // Create a new map instance with the new map
    map.value = new TsVectorMap({
      ...props.options,
      map: {
        name: newMapName,
        projection: props.options.projection,
      },
      selector: `#${mapContainer.value.id}`,
      onRegionClick: (event: MouseEvent, code: string) => {
        emit('regionClick', event, code)
      },
      onRegionSelected: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => {
        emit('regionSelected', event, code, isSelected, selectedRegions)
      },
      onMarkerClick: (event: MouseEvent, index: string) => {
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
