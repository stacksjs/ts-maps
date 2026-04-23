import type { PropType } from 'vue'
import { Marker as TsMarker } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

export const Marker = defineComponent({
  name: 'TsMarker',
  props: {
    position: { type: Array as unknown as PropType<[number, number]>, required: true },
    options: { type: Object as PropType<Record<string, unknown>>, default: undefined },
  },
  emits: ['click', 'dragend'],
  setup(props, { emit }) {
    const mapRef = useMap()
    let marker: InstanceType<typeof TsMarker> | null = null

    const handleClick = (e: any): void => {
      emit('click', e)
    }
    const handleDragEnd = (e: any): void => {
      emit('dragend', e)
    }

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || marker)
          return
        marker = new TsMarker(props.position, props.options)
        ;(map as unknown as { addLayer: (l: any) => void }).addLayer(marker)
        ;(marker as any).on('click', handleClick)
        ;(marker as any).on('dragend', handleDragEnd)
      },
      { immediate: true },
    )

    watch(
      () => props.position,
      (pos) => {
        if (!marker || !pos)
          return
        ;(marker as unknown as { setLatLng: (p: [number, number]) => void }).setLatLng(pos)
      },
    )

    onBeforeUnmount(() => {
      stop()
      const m = mapRef.value
      if (marker && m)
        (m as unknown as { removeLayer: (l: any) => void }).removeLayer(marker)
      marker = null
    })

    return () => null
  },
})

export default Marker
