import type { PropType } from 'vue'
import { TileLayer as TsTileLayer } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

export const TileLayer = defineComponent({
  name: 'TsTileLayer',
  props: {
    url: { type: String, required: true },
    options: { type: Object as PropType<Record<string, unknown>>, default: undefined },
  },
  setup(props) {
    const mapRef = useMap()
    let layer: InstanceType<typeof TsTileLayer> | null = null

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || layer)
          return
        layer = new TsTileLayer(props.url, props.options)
        ;(map as unknown as { addLayer: (l: any) => void }).addLayer(layer)
      },
      { immediate: true },
    )

    watch(
      () => props.url,
      (url) => {
        if (!layer)
          return
        ;(layer as unknown as { setUrl: (u: string) => void }).setUrl(url)
      },
    )

    onBeforeUnmount(() => {
      stop()
      const m = mapRef.value
      if (layer && m)
        (m as unknown as { removeLayer: (l: any) => void }).removeLayer(layer)
      layer = null
    })

    return () => null
  },
})

export default TileLayer
