import type { PropType } from 'vue'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

export const Layer = defineComponent({
  name: 'TsLayer',
  props: {
    layer: {
      type: Object as PropType<{ id: string, type: string, [key: string]: unknown }>,
      required: true,
    },
    before: { type: String, default: undefined },
  },
  setup(props) {
    const mapRef = useMap()
    let registered = false

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || registered)
          return
        (map as unknown as {
          addStyleLayer: (l: unknown, before?: string) => void
        }).addStyleLayer(props.layer, props.before)
        registered = true
      },
      { immediate: true },
    )

    onBeforeUnmount(() => {
      stop()
      const m = mapRef.value as unknown as { removeStyleLayer?: (id: string) => void } | null
      if (registered && m)
        m.removeStyleLayer?.(props.layer.id)
      registered = false
    })

    return () => null
  },
})

export default Layer
