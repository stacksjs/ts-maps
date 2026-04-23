import type { PropType } from 'vue'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

export const Source = defineComponent({
  name: 'TsSource',
  props: {
    id: { type: String, required: true },
    source: { type: [Object, Array] as PropType<unknown>, required: true },
  },
  setup(props) {
    const mapRef = useMap()
    let registered = false

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || registered)
          return
        (map as unknown as { addSource: (id: string, s: unknown) => void }).addSource(
          props.id,
          props.source,
        )
        registered = true
      },
      { immediate: true },
    )

    onBeforeUnmount(() => {
      stop()
      const m = mapRef.value
      if (registered && m)
        (m as unknown as { removeSource: (id: string) => void }).removeSource(props.id)
      registered = false
    })

    return () => null
  },
})

export default Source
